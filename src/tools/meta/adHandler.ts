import {
  AdAccount as MetaAdAccountSDK,
  Ad as MetaAdSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import { z } from 'zod';
import {
  MetaAdResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';

import { DeletionConfirmationSchema } from '../../mcp/registries/registryHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateAdResult,
  DeleteAdResult,
  GetAdsResult,
  MetaAd,
  UpdateAdResult,
} from './types.js';

// Define validation schema for ad deletion
const DeleteAdValidationSchema = z.object({
  confirmPermanentDelete: DeletionConfirmationSchema,
});

export class MetaAdHandler {
  async getAds(
    authPayload: JWTPayload,
    params: { adSetId?: string; campaignId?: string; adAccountId?: string }
  ): Promise<GetAdsResult> {
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
          MetaAdSDK.Fields.ad_review_feedback,
          MetaAdSDK.Fields.issues_info,
          MetaAdSDK.Fields.created_time,
          MetaAdSDK.Fields.updated_time,
        ];

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        let adsCursor: unknown;

        if (params.adSetId) {
          adsCursor = await new MetaAdSetSDK(params.adSetId, {}, null, api).getAds(fields);
        } else if (params.campaignId) {
          adsCursor = await new MetaCampaignSDK(params.campaignId, {}, null, api).getAds(fields);
        } else {
          adsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getAds(fields);
        }

        const allRawAds = await fetchAllPaginatedData<unknown>({
          cursor: adsCursor,
          limit: env.META_MAX_ADS_TO_FETCH,
          entityName: 'ads',
          userId: authPayload.userId,
          apiContext: { adAccountId },
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
              adAccountId,
            });
          }
        }

        const response = { ads: validatedAds };
        logger.info('Retrieved ads', {
          userId: authPayload.userId,
          count: validatedAds.length,
        });

        return response;
      },
      {
        toolName: 'get_ads',
        userId: authPayload.userId,
      }
    );
  }

  async createAd(
    authPayload: JWTPayload,
    params: CreateAdRequest & { adAccountId?: string }
  ): Promise<CreateAdResult> {
    logger.info('Executing create_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

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

  async updateAd(
    authPayload: JWTPayload,
    params: { adId: string; name?: string; status?: string; creativeId?: string }
  ): Promise<UpdateAdResult> {
    logger.info('Executing update_ad', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Create a consolidated object for API parameters, handling creative field specially
        const apiParams = {
          name: params.name,
          status: params.status,
          ...(params.creativeId && {
            creative: { creativeId: params.creativeId },
          }),
        };

        // Convert keys to snake_case and remove undefined properties
        const updateData = convertKeysToSnakeCase(apiParams);
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
          updatedFields: Object.keys(updateData),
        };

        return result;
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
  ): Promise<DeleteAdResult> {
    logger.info('Executing delete_ad', { userId: authPayload.userId, params });

    const validationResult = DeleteAdValidationSchema.safeParse(params);
    if (!validationResult.success) {
      const error = validationResult.error.errors[0];
      throw new ValidationError(error.message);
    }

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
