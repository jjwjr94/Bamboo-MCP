import {
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
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
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
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
}
