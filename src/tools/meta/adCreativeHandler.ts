import type { MultipartFile } from '@fastify/multipart';
import { eq, sql } from 'drizzle-orm';
import {
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
} from 'facebook-nodejs-business-sdk';
import FormData from 'form-data';
import type { z } from 'zod';
import { db, withUserContext } from '../../db/client.js';
import { creativeAssetUploads } from '../../db/schema.js';
import {
  MetaAdCreativeResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdCreativeRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { detectAssetTypeFromMimeType } from '../../utils/mimeTypeDetector.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, fetchUserTokenString, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaAdCreativeHandler {
  async getAdCreatives(authPayload: JWTPayload, params: { adAccountId?: string }) {
    logger.info('Executing get_ad_creatives', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

        const fields = [
          MetaAdCreativeSDK.Fields.id,
          MetaAdCreativeSDK.Fields.name,
          MetaAdCreativeSDK.Fields.status,
          MetaAdCreativeSDK.Fields.object_story_spec,
          MetaAdCreativeSDK.Fields.thumbnail_url,
          MetaAdCreativeSDK.Fields.image_url,
          MetaAdCreativeSDK.Fields.title,
          MetaAdCreativeSDK.Fields.body,
          MetaAdCreativeSDK.Fields.call_to_action_type,
          MetaAdCreativeSDK.Fields.link_url,
        ];

        const creativesCursor = await new MetaAdAccountSDK(
          adAccountId,
          {},
          null,
          api
        ).getAdCreatives(fields);

        // Use the common pagination utility to handle all edge cases
        const allRawCreatives = await fetchAllPaginatedData<unknown>({
          cursor: creativesCursor,
          limit: env.META_MAX_CREATIVES_TO_FETCH,
          entityName: 'ad creatives',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });

        const validatedCreatives: z.infer<typeof MetaAdCreativeResponseSchema>[] = [];
        for (const creative of allRawCreatives) {
          const result = MetaAdCreativeResponseSchema.safeParse(creative);
          if (result.success) {
            validatedCreatives.push(result.data);
          } else {
            logger.warn('Skipping invalid ad creative data from Meta API', {
              creativeId: (creative as { id?: string }).id || 'Unknown ID',
              errors: result.error.format(), // Use .format() for better readability
            });
          }
        }

        return await createMcpSuccessResult(
          { adCreatives: validatedCreatives },
          `Retrieved ${validatedCreatives.length} ad creatives`
        );
      },
      {
        toolName: 'get_ad_creatives',
        userId: authPayload.userId,
      }
    );
  }

  async createAdCreative(
    authPayload: JWTPayload,
    params: CreateAdCreativeRequest & { adAccountId?: string }
  ) {
    logger.info('Executing create_ad_creative', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

        const creativeData: Record<string, unknown> = {
          [MetaAdCreativeSDK.Fields.name]: params.name,
          [MetaAdCreativeSDK.Fields.object_story_spec]: params.objectStorySpec,
        };

        // Ensure no undefined values are passed to Meta API
        removeUndefinedProperties(creativeData);

        const creative = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAdCreative(
          [],
          creativeData
        );

        // Treat response as unknown and validate
        const validationResult = MetaCreateSuccessResponseSchema.safeParse(creative);
        if (!validationResult.success) {
          logger.warn('Invalid createAdCreative response from Meta API', {
            response: creative,
            errors: validationResult.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after creating the ad creative. The operation status is uncertain.'
          );
        }

        const adCreativeId = validationResult.data.id;
        const result = {
          adCreativeId: adCreativeId,
          name: params.name,
        };
        return await createMcpSuccessResult(
          result,
          `Ad creative "${params.name}" created successfully with ID: ${adCreativeId}`
        );
      },
      {
        toolName: 'create_ad_creative',
        userId: authPayload.userId,
      }
    );
  }

  async updateAdCreative(authPayload: JWTPayload, params: { adCreativeId: string; name: string }) {
    logger.info('Executing update_ad_creative', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const updateData = { [MetaAdCreativeSDK.Fields.name]: params.name };

        // Ensure no undefined values are passed to Meta API
        removeUndefinedProperties(updateData);

        const creative = new MetaAdCreativeSDK(params.adCreativeId, {}, null, api);
        const updateResponse = await creative.update([], updateData);

        // Treat response as unknown and validate
        const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
        if (!validationResult.success) {
          logger.warn('Invalid updateAdCreative response from Meta API', {
            adCreativeId: params.adCreativeId,
            response: updateResponse,
            errors: validationResult.error.errors,
          });
          throw new ValidationError(
            `Meta API returned an invalid response after updating ad creative ${params.adCreativeId}. The operation status is uncertain.`
          );
        }

        const result = {
          adCreativeId: params.adCreativeId,
          updatedFields: Object.keys(updateData), // Make this dynamic
        };
        return await createMcpSuccessResult(
          result,
          `Ad creative ${params.adCreativeId} updated successfully`
        );
      },
      {
        toolName: 'update_ad_creative',
        userId: authPayload.userId,
      }
    );
  }

  async deleteAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; confirmPermanentDelete?: boolean }
  ) {
    logger.info('Executing delete_ad_creative', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Safety check: require explicit confirmation for permanent deletion
        if (!params.confirmPermanentDelete) {
          throw new ValidationError(
            'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
          );
        }

        const creative = new MetaAdCreativeSDK(params.adCreativeId, {}, null, api);
        const deleteResponse = await creative.delete([]);

        // Treat response as unknown and validate
        const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
        if (!validationResult.success) {
          logger.warn('Invalid deleteAdCreative response from Meta API', {
            adCreativeId: params.adCreativeId,
            response: deleteResponse,
            errors: validationResult.error.errors,
          });
          throw new ValidationError(
            `Meta API returned an invalid response after deleting ad creative ${params.adCreativeId}. The operation status is uncertain.`
          );
        }

        const result = {
          adCreativeId: params.adCreativeId,
        };
        return await createMcpSuccessResult(
          result,
          `Ad creative ${params.adCreativeId} deleted successfully`
        );
      },
      {
        toolName: 'delete_ad_creative',
        userId: authPayload.userId,
      }
    );
  }

  async requestCreativeUpload(
    authPayload: JWTPayload,
    params: { adAccountId?: string; filename: string }
  ) {
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

        return await createMcpSuccessResult(
          { uploadId, uploadUrl },
          'Upload session created. Share the upload URL with the user to upload the file via web interface.'
        );
      },
      { toolName: 'request_creative_upload', userId: authPayload.userId }
    );
  }

  async checkUploadStatus(authPayload: JWTPayload, params: { uploadId: string }) {
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

        return await createMcpSuccessResult(
          {
            status: uploadRecord.status,
            metaAssetId: uploadRecord.metaAssetId,
            errorMessage: uploadRecord.errorMessage,
          },
          `Upload status is: ${uploadRecord.status}`
        );
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
          const form = new FormData();

          // Use ONLY the validated filename from the database, not client-provided filename
          form.append('source', fileData.file, { filename: uploadRequest.filename });
          form.append('access_token', accessToken);

          // Select endpoint based on determined asset type
          const endpoint = assetType === 'image' ? 'adimages' : 'advideos';
          const uploadUrl = `https://graph.facebook.com/${env.META_API_VERSION}/${uploadRequest.adAccountId}/${endpoint}`;

          const response = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(),
            signal: AbortSignal.timeout(env.META_UPLOAD_TIMEOUT),
          });

          if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            const errorMessage =
              errorData?.error?.message || `Meta API upload failed: ${response.statusText}`;
            throw new Error(errorMessage);
          }

          const metaResponse = (await response.json()) as {
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
            errorMessage: null, // Clear any previous errors
            updatedAt: new Date(),
          })
          .where(eq(creativeAssetUploads.id, uploadId));
      });

      return {
        success: true,
        metaAssetId: result.metaAssetId,
        assetType: result.assetType,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      logger.error('Creative asset upload failed', { userId, uploadId, error: errorMessage });

      // CRITICAL: Update the database record to 'failed' status
      try {
        await withUserContext(userId, async (tx) => {
          await tx
            .update(creativeAssetUploads)
            .set({
              status: 'failed',
              errorMessage: errorMessage,
              updatedAt: new Date(),
            })
            .where(eq(creativeAssetUploads.id, uploadId));
        });
      } catch (dbError) {
        logger.error('Failed to update upload status to failed', { uploadId, dbError });
      }

      // Re-throw the original error to be handled by the calling route
      throw error;
    }
  }
}
