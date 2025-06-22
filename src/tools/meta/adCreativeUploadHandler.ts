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
    params: { adAccountId?: string }
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
   * Creates a FormData object for the Meta API upload request
   */
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
      throw new Error('Could not extract asset ID from Meta API response');
    }

    return metaAssetId;
  }

  /**
   * Handles the HTTP request to Meta API
   */
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
        maxRedirections: 0,
        headersTimeout: env.META_UPLOAD_TIMEOUT,
      });

      const responseText = await responseBody.text();
      return { statusCode, responseText };
    } catch (netErr: unknown) {
      const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
      logger.error('Network error during Meta upload', { userId, uploadId, error: errMsg });
      throw new Error(`Network error uploading asset: ${errMsg}`);
    }
  }

  /**
   * Processes Meta API response and handles errors
   */
  private processMetaResponse(
    statusCode: number,
    responseText: string,
    userId: string,
    uploadId: string
  ): { hash?: string; id?: string; images?: { [key: string]: { hash: string } } } {
    if (statusCode < 200 || statusCode >= 300) {
      let errorData: { error?: { message?: string } } | null = null;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        // Non-JSON error response
      }

      const errorMessage =
        errorData?.error?.message || `Meta API upload failed with status ${statusCode}`;

      logger.error('Meta API upload error', {
        userId,
        uploadId,
        statusCode,
        errorMessage,
      });

      throw new Error(errorMessage);
    }

    return JSON.parse(responseText);
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
    // Look up upload session to get user context
    const initialUploadRecord = await db.query.creativeAssetUploads.findFirst({
      where: eq(creativeAssetUploads.id, uploadId),
    });

    if (!initialUploadRecord) {
      throw new NotFoundError(`Upload session not found: ${uploadId}`);
    }

    const userId = initialUploadRecord.userId;
    logger.info('Executing handle_creative_asset_upload', { userId, uploadId });

    try {
      // Determine asset type from MIME type
      const assetType = detectAssetTypeFromMimeType(fileData.mimetype);

      // Atomically claim the upload session and set the determined asset type
      const uploadRequest = await withUserContext(userId, async (tx) => {
        const [updatedRecord] = await tx
          .update(creativeAssetUploads)
          .set({
            status: 'uploading',
            assetType,
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

      // Stream file to Meta API
      const result = await handleMetaApiCall(
        async () => {
          const accessToken = await fetchUserTokenString(userId);
          const businessId = await getBusinessIdForAdAccount(userId, uploadRequest.adAccountId);

          logger.info('Streaming asset to Meta API', {
            userId,
            uploadId,
            assetType,
            filename: fileData.filename,
            hasBusinessContext: businessId !== null,
          });

          if (!fileData.file.readable) {
            throw new Error('File stream is not readable');
          }

          // Prepare upload request
          const form = this.createUploadFormData(
            fileData,
            assetType,
            fileData.filename,
            accessToken,
            businessId
          );
          const uploadUrl = this.buildUploadUrl(assetType, uploadRequest.adAccountId);

          // Send to Meta API
          const { statusCode, responseText } = await this.sendToMetaAPI(
            uploadUrl,
            form,
            userId,
            uploadId
          );

          // Process response
          const metaResponse = this.processMetaResponse(statusCode, responseText, userId, uploadId);
          const metaAssetId = this.extractAssetId(metaResponse, assetType, fileData.filename);

          return { metaAssetId, assetType };
        },
        { toolName: 'handle_creative_asset_upload', userId }
      );

      // Update DB with completion status
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
      // Update DB with failure status
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
