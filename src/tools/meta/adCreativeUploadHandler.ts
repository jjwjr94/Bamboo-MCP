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
import { MetaApiError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { detectAssetTypeFromMimeType } from '../../utils/mimeTypeDetector.js';
import { fetchUserTokenString, handleMetaApiCall } from './api.js';
import type { GetAssetUploadStatusResult, InitiateAssetUploadResult } from './types.js';

export class AdCreativeUploadHandler {
  async initiateAssetUpload(
    authPayload: JWTPayload,
    params: { adAccountId?: string }
  ): Promise<InitiateAssetUploadResult> {
    logger.info('Executing initiate_asset_upload', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required for initiate_asset_upload');
        }

        const newUploadRequest = await withUserContext(authPayload.userId, async (tx) => {
          const [result] = await tx
            .insert(creativeAssetUploads)
            .values({
              userId: authPayload.userId,
              adAccountId,
              assetType: 'pending', // Will be updated when file is uploaded
            })
            .returning();
          return result;
        });

        const uploadId = newUploadRequest.id;
        const uploadUrl = `${env.BASE_URL}/v1/assets/upload/${uploadId}`;

        const result: InitiateAssetUploadResult = {
          uploadId,
          uploadUrl,
        };
        return result;
      },
      { toolName: 'initiate_asset_upload', userId: authPayload.userId }
    );
  }

  async getAssetUploadStatus(
    authPayload: JWTPayload,
    params: { uploadId: string }
  ): Promise<GetAssetUploadStatusResult> {
    logger.info('Executing get_asset_upload_status', { userId: authPayload.userId, params });

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

        const result: GetAssetUploadStatusResult = {
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
      { toolName: 'get_asset_upload_status', userId: authPayload.userId }
    );
  }

  private createUploadFormData(
    fileData: MultipartFile,
    assetType: string,
    filename: string,
    accessToken: string,
    businessId: string | null
  ): FormData {
    const form = new FormData();

    // Use correct form field name based on asset type
    const fileParamName = assetType === 'image' ? 'filename' : 'source';
    form.append(fileParamName, fileData.file, { filename });
    form.append('access_token', accessToken);

    // Add business parameter for business-managed accounts
    if (businessId) {
      form.append('business', businessId);
    }

    return form;
  }

  /**
   * Constructs the Meta API upload URL based on asset type and account
   */
  private buildUploadUrl(assetType: string, adAccountId: string): string {
    const endpoint = assetType === 'image' ? 'adimages' : 'advideos';
    const accountSegment = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    return `https://graph.facebook.com/${env.META_API_VERSION}/${accountSegment}/${endpoint}`;
  }

  /**
   * Extracts the asset ID from Meta API response based on asset type
   */
  private extractAssetId(
    metaResponse: { hash?: string; id?: string; images?: { [key: string]: { hash: string } } },
    assetType: string,
    filename: string
  ): string {
    let metaAssetId: string | undefined;

    if (assetType === 'image') {
      metaAssetId = metaResponse.images?.[filename]?.hash || metaResponse.hash;
    } else {
      metaAssetId = metaResponse.id;
    }

    if (!metaAssetId) {
      throw new ValidationError('Could not extract asset ID from Meta API response');
    }

    return metaAssetId;
  }

  private async sendToMetaAPI(
    uploadUrl: string,
    form: FormData,
    userId: string,
    uploadId: string
  ): Promise<{ statusCode: number; responseText: string }> {
    try {
      const { statusCode, body: responseBody } = await httpRequest(uploadUrl, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form,
        headersTimeout: env.META_UPLOAD_TIMEOUT,
      });

      const responseText = await responseBody.text();
      return { statusCode, responseText };
    } catch (netErr: unknown) {
      const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
      logger.error('Network error during Meta upload', { userId, uploadId, error: errMsg });
      // Use MetaApiError to wrap network failures, indicating a potential gateway timeout or service unavailability.
      throw new MetaApiError(
        `Network error uploading asset: ${errMsg}`,
        'NETWORK_ERROR', // metaErrorCode
        undefined, // metaErrorSubcode
        504, // statusCode
        'NetworkError' // metaErrorType
      );
    }
  }

  private processMetaResponse(
    statusCode: number,
    responseText: string,
    userId: string,
    uploadId: string
  ): { hash?: string; id?: string; images?: { [key: string]: { hash: string } } } {
    if (statusCode < 200 || statusCode >= 300) {
      let errorDetails:
        | {
            message?: string;
            type?: string;
            code?: number | string;
            error_subcode?: number | string;
            fbtrace_id?: string;
            error_user_title?: string;
            error_user_msg?: string;
          }
        | undefined;

      try {
        const parsedBody = JSON.parse(responseText);
        if (parsedBody && typeof parsedBody.error === 'object' && parsedBody.error !== null) {
          errorDetails = parsedBody.error;
        }
      } catch {
        // Response was not valid JSON, no structured error details available.
      }

      const errorMessage =
        errorDetails?.message ||
        `Meta API upload failed with status ${statusCode}: ${responseText}`;
      const metaErrorCode = errorDetails?.code?.toString();
      const metaErrorSubcode = errorDetails?.error_subcode?.toString();
      const metaErrorType = errorDetails?.type;
      const fbtrace_id = errorDetails?.fbtrace_id;
      const userTitle = errorDetails?.error_user_title;
      const userMessage = errorDetails?.error_user_msg;

      logger.error('Meta API upload error', {
        userId,
        uploadId,
        statusCode,
        errorMessage,
        metaErrorCode,
        metaErrorSubcode,
        metaErrorType,
        fbtrace_id,
        userTitle,
        userMessage,
      });

      throw new MetaApiError(
        errorMessage,
        metaErrorCode,
        metaErrorSubcode,
        statusCode,
        metaErrorType,
        fbtrace_id,
        userTitle,
        userMessage
      );
    }
    return JSON.parse(responseText);
  }

  /**
   * Handles creative asset file uploads for the MCP server.
   *
   * This method exists because MCP clients (like Claude) cannot directly send large files
   * to the server due to protocol limitations. Instead, we use a two-step process:
   * 1. MCP client calls initiate_asset_upload to get an upload URL
   * 2. User uploads file via web interface to this endpoint
   * 3. MCP client polls get_asset_upload_status to get the Meta asset ID
   *
   * The asset type (image/video) is automatically determined from the uploaded file's MIME type,
   * and the file is streamed directly to the appropriate Meta API endpoint without local storage.
   *
   * Upload links are reusable until successful completion or expiration. Failed uploads can be retried.
   * Race conditions are prevented by atomically claiming the upload session with 'uploading' state.
   */
  async handleCreativeAssetUpload(uploadId: string, fileData: MultipartFile) {
    // Atomically claim the upload session by updating status to 'uploading'.
    // This allows retries on 'failed' sessions and prevents concurrent uploads.
    const uploadingRecord = await db.transaction(async (tx) => {
      const updateResult = await tx
        .update(creativeAssetUploads)
        .set({
          status: 'uploading',
          updatedAt: new Date(),
        })
        .where(
          sql`${creativeAssetUploads.id} = ${uploadId} AND 
              (${creativeAssetUploads.status} = 'pending' OR ${creativeAssetUploads.status} = 'failed') AND
              ${creativeAssetUploads.expiresAt} > NOW()`
        )
        .returning();

      return updateResult[0];
    });

    if (!uploadingRecord) {
      // If the claim failed, inspect the current state to provide a specific error.
      const currentRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, uploadId),
      });

      if (!currentRecord) {
        throw new NotFoundError(`Upload session ${uploadId} not found.`);
      }
      if (new Date() > currentRecord.expiresAt) {
        throw new ValidationError('Upload session has expired. Please request a new upload link.');
      }
      if (currentRecord.status === 'uploading') {
        throw new ValidationError(
          'An upload is already in progress for this session. Please wait a moment.'
        );
      }
      if (currentRecord.status === 'completed') {
        throw new ValidationError('This upload has already been completed successfully.');
      }
      // Fallback for any other unexpected state
      throw new ValidationError('Upload session is not in a valid state for upload.');
    }

    const userId = uploadingRecord.userId;
    logger.info('Upload session claimed for processing', { userId, uploadId });

    // Initialize asset type with a default value
    let detectedAssetType: 'image' | 'video' | 'pending' = 'pending';

    try {
      // Determine asset type from MIME type after claiming the session
      detectedAssetType = detectAssetTypeFromMimeType(fileData.mimetype);

      // Stream file to Meta API
      const result = await handleMetaApiCall(
        async () => {
          const accessToken = await fetchUserTokenString(userId);
          const businessId = await getBusinessIdForAdAccount(userId, uploadingRecord.adAccountId);

          logger.info('Streaming asset to Meta API', {
            userId,
            uploadId,
            assetType: detectedAssetType,
            filename: fileData.filename,
            hasBusinessContext: businessId !== null,
          });

          if (!fileData.file.readable) {
            throw new ValidationError('File stream is not readable');
          }

          // Prepare upload request
          const form = this.createUploadFormData(
            fileData,
            detectedAssetType,
            fileData.filename,
            accessToken,
            businessId
          );
          const uploadUrl = this.buildUploadUrl(detectedAssetType, uploadingRecord.adAccountId);

          // Send to Meta API
          const { statusCode, responseText } = await this.sendToMetaAPI(
            uploadUrl,
            form,
            userId,
            uploadId
          );

          // Process response
          const metaResponse = this.processMetaResponse(statusCode, responseText, userId, uploadId);
          const metaAssetId = this.extractAssetId(
            metaResponse,
            detectedAssetType,
            fileData.filename
          );

          return { metaAssetId, assetType: detectedAssetType };
        },
        { toolName: 'handle_creative_asset_upload', userId }
      );

      // SUCCESS: Update with Meta asset ID, final asset type, and set status to 'completed'.
      await withUserContext(userId, async (tx) => {
        await tx
          .update(creativeAssetUploads)
          .set({
            status: 'completed',
            assetType: result.assetType,
            metaAssetId: result.metaAssetId,
            errorMessage: null, // Clear any previous error message
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
      // FAILURE: Update with error details and set status to 'failed'
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';

      // FAILURE: Update with error details and set status to 'failed'.
      await withUserContext(userId, async (tx) => {
        await tx
          .update(creativeAssetUploads)
          .set({
            status: 'failed',
            assetType: detectedAssetType, // Use the single detectedAssetType variable
            errorMessage,
            metaAssetId: null, // Clear any stale asset ID from a previous attempt
            updatedAt: new Date(),
          })
          .where(eq(creativeAssetUploads.id, uploadId));
      });

      logger.error('Creative asset upload failed - marked for retry', {
        userId,
        uploadId,
        error: errorMessage,
      });
      throw error; // Re-throw to ensure caller gets the failure context
    }
  }
}
