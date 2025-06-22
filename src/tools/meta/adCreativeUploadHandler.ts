import type { MultipartFile } from '@fastify/multipart';
import { eq, sql } from 'drizzle-orm';
import FormData from 'form-data';
import { request as httpRequest } from 'undici';
import { db, withUserContext } from '../../db/client.js';
import { creativeAssetUploads } from '../../db/schema.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { getBusinessIdForAdAccount } from '../../utils/businessContextManager.js';
import { env } from '../../utils/env.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { detectAssetTypeFromMimeType } from '../../utils/mimeTypeDetector.js';
import { fetchUserTokenString, handleMetaApiCall } from './api.js';
import type { CheckUploadStatusResult, RequestCreativeUploadResult } from './types.js';

export class AdCreativeUploadHandler {
  async requestCreativeUpload(
    authPayload: JWTPayload,
    params: { adAccountId?: string; filename: string }
  ): Promise<RequestCreativeUploadResult> {
    logger.info('Executing request_creative_upload', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

        // Create upload record in database - asset type will be determined at upload time
        const newUploadRequest = await withUserContext(authPayload.userId, async (tx) => {
          const [result] = await tx
            .insert(creativeAssetUploads)
            .values({
              userId: authPayload.userId,
              adAccountId,
              filename: params.filename,
              assetType: 'pending', // Will be updated when file is uploaded
            })
            .returning();
          return result;
        });

        const uploadId = newUploadRequest.id;
        const uploadUrl = `${env.BASE_URL}/v1/assets/upload/${uploadId}`;

        const result: RequestCreativeUploadResult = { uploadId, uploadUrl };
        return result;
      },
      { toolName: 'request_creative_upload', userId: authPayload.userId }
    );
  }

  async checkUploadStatus(
    authPayload: JWTPayload,
    params: { uploadId: string }
  ): Promise<CheckUploadStatusResult> {
    logger.info('Executing check_upload_status', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const uploadRecord = await withUserContext(authPayload.userId, async (tx) => {
          return tx.query.creativeAssetUploads.findFirst({
            where: eq(creativeAssetUploads.id, params.uploadId),
          });
        });

        if (!uploadRecord) {
          throw new NotFoundError(`Upload request with ID ${params.uploadId}`);
        }

        const result: CheckUploadStatusResult = {
          status: uploadRecord.status,
        };

        if (uploadRecord.metaAssetId) {
          result.metaAssetId = uploadRecord.metaAssetId;
        }

        if (uploadRecord.errorMessage) {
          result.errorMessage = uploadRecord.errorMessage;
        }

        return result;
      },
      { toolName: 'check_upload_status', userId: authPayload.userId }
    );
  }

  /**
   * Handles creative asset file uploads for the MCP server.
   *
   * This method exists because MCP clients (like Claude) cannot directly send large files
   * to the server due to protocol limitations. Instead, we use a two-step process:
   * 1. MCP client calls request_creative_upload to get an upload URL
   * 2. User uploads file via web interface to this endpoint
   * 3. MCP client polls check_upload_status to get the Meta asset ID
   *
   * The asset type (image/video) is automatically determined from the uploaded file's MIME type,
   * and the file is streamed directly to the appropriate Meta API endpoint without local storage.
   */
  async handleCreativeAssetUpload(uploadId: string, fileData: MultipartFile) {
    // 1. Look up upload session to get user context (no RLS needed for initial lookup)
    const initialUploadRecord = await db.query.creativeAssetUploads.findFirst({
      where: eq(creativeAssetUploads.id, uploadId),
    });

    if (!initialUploadRecord) {
      throw new NotFoundError(`Upload session not found: ${uploadId}`);
    }

    const userId = initialUploadRecord.userId;
    logger.info('Executing handle_creative_asset_upload', { userId, uploadId });

    // Use a try/catch block to ensure database status is updated on any failure
    try {
      // 2. Determine asset type from MIME type (available immediately from headers)
      const assetType = detectAssetTypeFromMimeType(fileData.mimetype);

      // 3. Atomically claim the upload session and set the determined asset type
      const uploadRequest = await withUserContext(userId, async (tx) => {
        const [updatedRecord] = await tx
          .update(creativeAssetUploads)
          .set({
            status: 'uploading',
            assetType, // Set based on uploaded file's MIME type
            updatedAt: new Date(),
          })
          .where(
            sql`${creativeAssetUploads.id} = ${uploadId} AND ${creativeAssetUploads.status} = 'pending' AND ${creativeAssetUploads.expiresAt} > NOW()`
          )
          .returning();

        return updatedRecord;
      });

      if (!uploadRequest) {
        throw new ValidationError('Upload session is invalid, already used, or expired');
      }

      // 4. Stream file to Meta API with resilience policy
      const result = await handleMetaApiCall(
        async () => {
          const accessToken = await fetchUserTokenString(userId);

          // Resolve business context for the ad account
          const businessId = await getBusinessIdForAdAccount(userId, uploadRequest.adAccountId);
          logger.info('Resolved business context for media upload', {
            userId,
            uploadId,
            adAccountId: uploadRequest.adAccountId,
            businessId: businessId ?? 'non-business',
            hasBusinessContext: businessId !== null,
          });

          const form = new FormData();

          // Basic stream sanity check (no verbose chunk logging in production)
          fileData.file.on('error', (err) => {
            logger.error('Upload stream error', { err });
          });

          // Use correct form field name based on asset type
          const fileParamName = assetType === 'image' ? 'filename' : 'source';
          form.append(fileParamName, fileData.file, { filename: uploadRequest.filename });
          form.append('access_token', accessToken);

          // CRITICAL: Add business parameter for business-managed accounts
          if (businessId) {
            form.append('business', businessId);
            logger.debug('Added business parameter to media upload FormData', {
              adAccountId: uploadRequest.adAccountId,
              businessId,
              reasoning: 'Business-managed account requires business parameter',
            });
          } else {
            logger.debug('No business parameter added to media upload', {
              adAccountId: uploadRequest.adAccountId,
              reason: 'Non-business account (business parameter forbidden)',
            });
          }

          // Select endpoint based on determined asset type
          const endpoint = assetType === 'image' ? 'adimages' : 'advideos';
          const accountSegment = uploadRequest.adAccountId.startsWith('act_')
            ? uploadRequest.adAccountId
            : `act_${uploadRequest.adAccountId}`;
          const uploadUrl = `https://graph.facebook.com/${env.META_API_VERSION}/${accountSegment}/${endpoint}`;

          // Enhanced logging to validate request parameters before streaming
          const formHeaders = form.getHeaders();

          /*
           * CRITICAL: Compute exact multipart body length and set Content-Length header
           *
           * Why this is necessary:
           * - Global fetch() uses chunked transfer encoding by default (no Content-Length)
           * - Meta's Graph API rejects chunked uploads for adimages/advideos with error 100/33
           * - curl succeeds because it automatically calculates and sends Content-Length
           *
           * Solution:
           * - Use form-data package's getLength() to calculate exact multipart size
           * - Use undici.request() instead of fetch() to send with explicit Content-Length
           * - This disables chunked encoding and matches curl's behavior
           *
           * Memory efficiency:
           * - The file stream is never buffered in memory
           * - getLength() calculates size by examining multipart structure, not reading file
           * - Supports 4GB uploads on 512MB server instances
           */
          const contentLength = await new Promise<number>((resolve, reject) => {
            (
              form as unknown as {
                getLength: (cb: (err: Error | null, len: number) => void) => void;
              }
            ).getLength((err, len) => (err ? reject(err) : resolve(len)));
          });
          formHeaders['Content-Length'] = String(contentLength);

          // Log the complete request details we're about to send
          logger.info('Complete request details being sent to Meta API', {
            userId,
            uploadId,
            method: 'POST',
            url: uploadUrl,
            headers: {
              ...formHeaders,
              // Redact sensitive headers but show structure
              'content-type': formHeaders['content-type'],
              'content-length': formHeaders['content-length'] || 'not-set',
            },
            formDataFields: {
              [fileParamName]: `<file-stream: ${uploadRequest.filename}>`,
              access_token: '<REDACTED>',
              ...(businessId ? { business: businessId } : {}),
            },
            streamInfo: {
              assetType,
              mimeType: fileData.mimetype,
              filename: uploadRequest.filename,
              isReadable: fileData.file.readable,
              isPaused: fileData.file.isPaused?.() || 'unknown',
            },
          });

          logger.info('Attempting to stream file to Meta API', {
            userId,
            uploadId,
            assetType,
            url: uploadUrl,
            formFields: {
              [fileParamName]: uploadRequest.filename,
              access_token: 'REDACTED', // For security
              business: businessId ?? 'not_applicable',
            },
            // Log the Content-Type to verify the multipart boundary is set
            contentTypeHeader: formHeaders['content-type'],
            mimeType: fileData.mimetype,
            streamingApproach: 'direct_file_stream_via_FormData',
          });

          if (!fileData.file.readable) {
            throw new Error('File stream is not readable — was it already consumed?');
          }

          /*
           * Use Undici's low-level request API instead of fetch()
           *
           * Reasons:
           * 1. fetch() forces chunked encoding when Content-Length is manually set
           * 2. undici.request() respects explicit Content-Length and disables chunking
           * 3. Preserves zero-copy streaming from Fastify → form-data → Meta API
           * 4. Matches the exact HTTP semantics that Meta's servers expect
           */
          const { statusCode, body: responseBody } = await httpRequest(uploadUrl, {
            method: 'POST',
            headers: formHeaders,
            body: form,
            maxRedirections: 0,
            headersTimeout: env.META_UPLOAD_TIMEOUT,
          });

          const responseText = await responseBody.text();

          if (statusCode < 200 || statusCode >= 300) {
            let errorData: { error?: { message?: string } } | null = null;
            try {
              errorData = JSON.parse(responseText);
            } catch {
              logger.error('Meta API non-JSON error response', {
                userId,
                uploadId,
                statusCode,
                responseSnippet: responseText.substring(0, 500),
              });
            }
            if (errorData?.error) {
              logger.error('Meta API upload error', {
                userId,
                uploadId,
                statusCode,
                errorDetails: errorData.error,
              });
            }
            throw new Error(
              errorData?.error?.message ||
                `Meta API upload failed with status ${statusCode}: ${responseText}`
            );
          }

          const metaResponse = JSON.parse(responseText) as {
            hash?: string;
            id?: string;
            images?: { [key: string]: { hash: string } };
          };

          // Extract the correct asset ID based on the asset type
          let metaAssetId: string | undefined;
          if (assetType === 'image') {
            // For images, the response contains an 'images' object with filename as key
            metaAssetId = metaResponse.images?.[uploadRequest.filename]?.hash || metaResponse.hash;
          } else {
            // For videos, the response contains a direct 'id' field
            metaAssetId = metaResponse.id;
          }

          if (!metaAssetId) {
            throw new Error('Could not extract asset ID from Meta API response');
          }

          return { metaAssetId, assetType };
        },
        { toolName: 'handle_creative_asset_upload', userId }
      );

      // 5. Update DB with completion status
      await withUserContext(userId, async (tx) => {
        await tx
          .update(creativeAssetUploads)
          .set({
            status: 'completed',
            metaAssetId: result.metaAssetId,
            updatedAt: new Date(),
          })
          .where(eq(creativeAssetUploads.id, uploadId));
      });

      logger.info('Creative asset upload completed successfully', {
        userId,
        uploadId,
        metaAssetId: result.metaAssetId,
        assetType: result.assetType,
      });

      return { success: true, metaAssetId: result.metaAssetId, assetType: result.assetType };
    } catch (error: unknown) {
      // 6. On any error, update the DB with failure status
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      logger.error('Creative asset upload failed', { userId, uploadId, error: errorMessage });

      await withUserContext(userId, async (tx) => {
        await tx
          .update(creativeAssetUploads)
          .set({
            status: 'failed',
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(creativeAssetUploads.id, uploadId));
      });

      throw error;
    }
  }
}
