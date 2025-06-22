import {
  AdAccount as MetaAdAccountSDK,
  Ad as MetaAdSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaAdResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaAdHandler {
  async getAds(
    authPayload: JWTPayload,
    params: { adSetId?: string; campaignId?: string; adAccountId?: string }
  ) {
    logger.info('Executing get_ads', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const fields = [
          MetaAdSDK.Fields.id,
          MetaAdSDK.Fields.name,
          MetaAdSDK.Fields.status,
          MetaAdSDK.Fields.configured_status,
          MetaAdSDK.Fields.effective_status,
          MetaAdSDK.Fields.creative,
          MetaAdSDK.Fields.adset_id,
          MetaAdSDK.Fields.campaign_id,
          MetaAdSDK.Fields.created_time,
          MetaAdSDK.Fields.updated_time,
        ];

        let adsCursor: unknown;

        if (params.adSetId) {
          // Get ads from a specific ad set
          adsCursor = await new MetaAdSetSDK(params.adSetId, {}, null, api).getAds(fields);
        } else if (params.campaignId) {
          // Get ads from a specific campaign
          adsCursor = await new MetaCampaignSDK(params.campaignId, {}, null, api).getAds(fields);
        } else {
          // Get ads from an ad account
          const adAccountId = await accountManager.requireAccountSelection(
            authPayload.userId,
            params.adAccountId
          );
          adsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getAds(fields);
        }

        // Use the common pagination utility to handle all edge cases
        const allRawAds = await fetchAllPaginatedData<unknown>({
          cursor: adsCursor,
          limit: env.META_MAX_ADS_TO_FETCH,
          entityName: 'ads',
          userId: authPayload.userId,
          apiContext: params,
        });

        // Validate and transform the response using auto-generated schema
        const validatedAds: z.infer<typeof MetaAdResponseSchema>[] = [];
        for (const ad of allRawAds) {
          const result = MetaAdResponseSchema.safeParse(ad);
          if (result.success) {
            validatedAds.push(result.data);
          } else {
            logger.warn('Invalid ad data received from Meta API, skipping.', {
              error: result.error.format(),
              ad,
              userId: authPayload.userId,
              params,
            });
          }
        }

        const response = { ads: validatedAds };
        logger.info('Successfully retrieved ads', {
          userId: authPayload.userId,
          count: validatedAds.length,
          params,
        });

        return await createMcpSuccessResult(response);
      },
      {
        toolName: 'get_ads',
        userId: authPayload.userId,
      }
    );
  }

  async createAd(authPayload: JWTPayload, params: CreateAdRequest & { adAccountId?: string }) {
    logger.info('Executing create_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

        const adData: Record<string, unknown> = {
          [MetaAdSDK.Fields.name]: params.name,
          [MetaAdSDK.Fields.adset_id]: params.adsetId,
          [MetaAdSDK.Fields.creative]: { creative_id: params.creativeId },
          [MetaAdSDK.Fields.status]: params.status,
        };

        // Meta API handles business context automatically via ad account
        removeUndefinedProperties(adData);

        const ad = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAd([], adData);

        // Treat response as unknown and validate
        const validationResult = MetaCreateSuccessResponseSchema.safeParse(ad);
        if (!validationResult.success) {
          const errorMessage = 'Failed to create ad: Invalid response from Meta API.';
          logger.error(errorMessage, { validationErrors: validationResult.error.format() });
          throw new ValidationError(errorMessage);
        }

        const adId = validationResult.data.id;
        const result = {
          adId: adId,
          name: params.name,
          adsetId: params.adsetId,
          creativeId: params.creativeId,
          status: params.status,
        };
        return await createMcpSuccessResult(
          result,
          `Ad "${params.name}" created successfully with ID: ${adId}`
        );
      },
      {
        toolName: 'create_ad',
        userId: authPayload.userId,
      }
    );
  }

  async updateAd(
    authPayload: JWTPayload,
    params: { adId: string; name?: string; status?: string; creativeId?: string }
  ) {
    logger.info('Executing update_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const updateData: Record<string, unknown> = {
          [MetaAdSDK.Fields.name]: params.name,
          [MetaAdSDK.Fields.status]: params.status,
          // For creative updates, Meta API expects the creative field to be an object with creative_id
          ...(params.creativeId && {
            [MetaAdSDK.Fields.creative]: { creative_id: params.creativeId },
          }),
        };

        removeUndefinedProperties(updateData);

        const ad = new MetaAdSDK(params.adId, {}, null, api);
        const updateResponse = await ad.update([], updateData);

        const validation = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for update ad', {
            error: validation.error.format(),
            response: updateResponse,
          });
          throw new ValidationError('Failed to update ad: Invalid API response.');
        }

        const result = {
          adId: params.adId,
          updatedFields: Object.keys(updateData),
        };
        logger.info('Successfully updated ad', {
          userId: authPayload.userId,
          adId: params.adId,
          updatedFields: Object.keys(updateData),
        });

        return await createMcpSuccessResult(result, `Successfully updated ad ${params.adId}.`);
      },
      {
        toolName: 'update_ad',
        userId: authPayload.userId,
      }
    );
  }

  async deleteAd(
    authPayload: JWTPayload,
    params: { adId: string; confirmPermanentDelete?: boolean }
  ) {
    logger.info('Executing delete_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Safety check: require explicit confirmation for permanent deletion
        if (!params.confirmPermanentDelete) {
          throw new ValidationError(
            'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
          );
        }

        const ad = new MetaAdSDK(params.adId, {}, null, api);
        const deleteResponse = await ad.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for delete ad', {
            error: validation.error.format(),
            response: deleteResponse,
          });
          throw new ValidationError('Failed to delete ad: Invalid API response.');
        }

        const result = { adId: params.adId };
        logger.info('Successfully deleted ad', {
          userId: authPayload.userId,
          adId: params.adId,
        });

        return await createMcpSuccessResult(result, `Successfully deleted ad ${params.adId}.`);
      },
      {
        toolName: 'delete_ad',
        userId: authPayload.userId,
      }
    );
  }
}
