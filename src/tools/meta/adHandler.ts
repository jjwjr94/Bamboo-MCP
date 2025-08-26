import {
  AdAccount as MetaAdAccountSDK,
  Ad as MetaAdSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import {
  MetaAdResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';

import type {
  CreateAdRequest,
  DeleteAdRequest,
  UpdateAdRequest,
} from '../../mcp/registries/AdToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateAdResult,
  DeleteAdResult,
  GetAdsResult,
  MetaAd,
  UpdateAdResult,
} from './types.js';

// Note: Input validation is now handled at the MCP tool registration level.

export class MetaAdHandler {
  async getAds(
    authPayload: JWTPayload,
    params: { adAccountId?: string; adSetId?: string; campaignId?: string }
  ): Promise<GetAdsResult> {
    logger.info('Executing get_ads', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        
        // Only require adAccountId if we're not filtering by campaign or ad set
        // When filtering by campaign or ad set, we can get ads without the ad account ID
        if (!adAccountId && !params.campaignId && !params.adSetId) {
          throw new Error('adAccountId is required for get_ads when not filtering by campaign or ad set. Please provide the Meta Ads account ID (format: act_XXXXXXXXX)');
        }

        const fields = [
          MetaAdSDK.Fields.id,
          MetaAdSDK.Fields.name,
          MetaAdSDK.Fields.status,
          MetaAdSDK.Fields.effective_status,
          MetaAdSDK.Fields.creative,
          MetaAdSDK.Fields.created_time,
          MetaAdSDK.Fields.updated_time,
          MetaAdSDK.Fields.campaign_id,
          MetaAdSDK.Fields.adset_id,
          MetaAdSDK.Fields.bid_amount,
          MetaAdSDK.Fields.tracking_specs,
          MetaAdSDK.Fields.source_ad_id,
        ];

        let adsCursor: unknown;

        if (params.adSetId) {
          // Get ads from specific ad set
          adsCursor = await new MetaAdSetSDK(params.adSetId, {}, null, api).getAds(fields);
        } else if (params.campaignId) {
          // Get ads from specific campaign
          adsCursor = await new MetaCampaignSDK(params.campaignId, {}, null, api).getAds(fields);
        } else {
          // Get all ads from ad account
          adsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getAds(fields);
        }

        const allRawAds = await fetchAllPaginatedData<unknown>({
          cursor: adsCursor,
          limit: env.META_MAX_ADS_TO_FETCH,
          entityName: 'ads',
          userId: authPayload.userId,
          apiContext: { adAccountId: adAccountId || 'unknown', adSetId: params.adSetId, campaignId: params.campaignId },
        });

        const validatedAds: MetaAd[] = [];
        for (const ad of allRawAds) {
          const result = MetaAdResponseSchema.safeParse(ad);
          if (result.success) {
            validatedAds.push(result.data);
          } else {
            logger.warn('Invalid ad data received from Meta API, skipping.', {
              error: result.error.format(),
              ad,
              userId: authPayload.userId,
              adAccountId: adAccountId || 'unknown',
            });
          }
        }

        const response: GetAdsResult = { ads: validatedAds };
        logger.info('Retrieved ads', { userId: authPayload.userId, count: validatedAds.length });

        return response;
      },
      {
        toolName: 'get_ads',
        userId: authPayload.userId,
      }
    );
  }

  async createAd(authPayload: JWTPayload, params: CreateAdRequest): Promise<CreateAdResult> {
    logger.info('Executing create_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required for create_ad. Please provide the Meta Ads account ID (format: act_XXXXXXXXX)');
        }

        // Create a consolidated, camelCased object for API parameters
        const apiParams = {
          name: params.name,
          adsetId: params.adsetId,
          creative: { creativeId: params.creativeId },
          status: params.status,
          creativeFeaturesSpec: params.creativeFeaturesSpec,
        };

        // Convert keys to snake_case and remove undefined properties
        const adData = convertKeysToSnakeCase(apiParams);
        removeUndefinedProperties(adData);

        const ad = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAd([], adData);
        const validation = MetaCreateSuccessResponseSchema.safeParse(ad);

        if (!validation.success) {
          const errorMessage = 'Failed to create ad: Invalid response from Meta API.';
          logger.error(errorMessage, { validationErrors: validation.error.format() });
          throw new ValidationError(errorMessage);
        }

        const adId = validation.data.id;
        const result = {
          adId: adId,
          name: params.name,
          adsetId: params.adsetId,
          creativeId: params.creativeId,
          status: params.status || 'ACTIVE',
        };
        return result;
      },
      {
        toolName: 'create_ad',
        userId: authPayload.userId,
      }
    );
  }

  async updateAd(authPayload: JWTPayload, params: UpdateAdRequest): Promise<UpdateAdResult> {
    logger.info('Executing update_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Separate adId from fields to be updated
        const { adId, ...updateFields } = params;

        // Convert keys to snake_case and remove undefined properties
        const updateData = convertKeysToSnakeCase(updateFields);
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

        logger.info('Updated ad', { adId: params.adId });

        const result: UpdateAdResult = {
          adId: params.adId,
          updatedFields: Object.keys(updateFields).filter(
            (key) => updateFields[key as keyof typeof updateFields] !== undefined
          ),
        };

        return result;
      },
      {
        toolName: 'update_ad',
        userId: authPayload.userId,
      }
    );
  }

  async deleteAd(authPayload: JWTPayload, params: DeleteAdRequest): Promise<DeleteAdResult> {
    logger.info('Executing delete_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const ad = new MetaAdSDK(params.adId, {}, null, api);
        const deleteResponse = await ad.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
        if (!validation.success) {
          logger.warn('Invalid deleteAd response from Meta API', {
            response: deleteResponse,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after deleting the ad. The operation status is uncertain.'
          );
        }

        logger.info('Deleted ad', { adId: params.adId });

        const result = { adId: params.adId };
        return result;
      },
      {
        toolName: 'delete_ad',
        userId: authPayload.userId,
      }
    );
  }
}
