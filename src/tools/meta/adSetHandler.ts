import {
  AdAccount as MetaAdAccountSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import {
  MetaAdSetResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CampaignStatus, CreateAdSetRequest, MetaTargeting } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { META_LOCATION_KEYS, SAC_COMPLIANCE } from './constants.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateAdSetResult,
  DeleteAdSetResult,
  GetAdSetsResult,
  MetaAdSet,
  UpdateAdSetResult,
} from './types.js';

export class MetaAdSetHandler {
  async getAdSets(
    authPayload: JWTPayload,
    params: { campaignId?: string; adAccountId?: string }
  ): Promise<GetAdSetsResult> {
    logger.info('Executing get_ad_sets', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const fields = [
          MetaAdSetSDK.Fields.id,
          MetaAdSetSDK.Fields.name,
          MetaAdSetSDK.Fields.status,
          MetaAdSetSDK.Fields.effective_status,
          MetaAdSetSDK.Fields.targeting,
          MetaAdSetSDK.Fields.optimization_goal,
          MetaAdSetSDK.Fields.billing_event,
          MetaAdSetSDK.Fields.bid_strategy,
          MetaAdSetSDK.Fields.attribution_spec,
          MetaAdSetSDK.Fields.daily_budget,
          MetaAdSetSDK.Fields.lifetime_budget,
          MetaAdSetSDK.Fields.start_time,
          MetaAdSetSDK.Fields.end_time,
          MetaAdSetSDK.Fields.created_time,
          MetaAdSetSDK.Fields.updated_time,
        ];

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        let adSetsCursor: unknown;

        if (params.campaignId) {
          adSetsCursor = await new MetaCampaignSDK(params.campaignId, {}, null, api).getAdSets(
            fields
          );
        } else {
          adSetsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getAdSets(fields);
        }

        const allRawAdSets = await fetchAllPaginatedData<unknown>({
          cursor: adSetsCursor,
          limit: env.META_MAX_ADSETS_TO_FETCH,
          entityName: 'ad sets',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });

        const validatedAdSets: MetaAdSet[] = [];
        for (const adSet of allRawAdSets) {
          const result = MetaAdSetResponseSchema.safeParse(adSet);
          if (result.success) {
            validatedAdSets.push(result.data);
          } else {
            logger.warn('Invalid ad set data received from Meta API, skipping.', {
              error: result.error.format(),
              adSet,
              userId: authPayload.userId,
              adAccountId,
            });
          }
        }

        const response = { adSets: validatedAdSets };
        logger.info('Successfully retrieved ad sets', {
          userId: authPayload.userId,
          count: validatedAdSets.length,
          params,
        });

        return response;
      },
      {
        toolName: 'get_adsets',
        userId: authPayload.userId,
      }
    );
  }

  async createAdSet(
    authPayload: JWTPayload,
    params: CreateAdSetRequest
  ): Promise<CreateAdSetResult> {
    logger.info('Executing create_adset', { userId: authPayload.userId, params });

    // Validate budget requirement: either dailyBudget OR lifetimeBudget must be provided
    if (!params.dailyBudget && !params.lifetimeBudget) {
      throw new ValidationError('Either dailyBudget or lifetimeBudget must be provided.');
    }
    if (params.dailyBudget && params.lifetimeBudget) {
      throw new ValidationError('Provide either dailyBudget or lifetimeBudget, but not both.');
    }

    // Validate geoLocations has at least one targeting criterion
    const geoLocs = params.targeting.geoLocations;
    if (!geoLocs.countries?.length && !geoLocs.regions?.length && !geoLocs.cities?.length) {
      throw new ValidationError(
        'Geographic targeting must specify at least one of: countries, regions, or cities.'
      );
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Fetch campaign to check for special ad categories
        const campaign = await new MetaCampaignSDK(params.campaignId, {}, null, api).read([
          'special_ad_categories',
        ]);
        const isSpecialAdCategory = campaign.special_ad_categories?.some(
          (cat: string) => cat !== 'NONE'
        );

        // Check for California targeting
        const targetsCalifornia = params.targeting.geoLocations?.regions?.some(
          (r) => r.key === META_LOCATION_KEYS.CALIFORNIA
        );

        // Enforce SAC-CFCA compliance rule
        if (
          isSpecialAdCategory &&
          (SAC_COMPLIANCE.CCPA_REQUIRED_OPTIMIZATION_GOALS as readonly string[]).includes(
            params.optimizationGoal
          ) &&
          targetsCalifornia &&
          params.isSacCfcaTermsCertified !== true
        ) {
          throw new ValidationError(
            `For Special Ad Category campaigns with '${params.optimizationGoal}' goal targeting California, 'isSacCfcaTermsCertified' must be set to true.`
          );
        }

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        const adSetData: Record<string, unknown> = {
          [MetaAdSetSDK.Fields.name]: params.name,
          [MetaAdSetSDK.Fields.campaign_id]: params.campaignId,
          [MetaAdSetSDK.Fields.status]: params.status || 'PAUSED',
          [MetaAdSetSDK.Fields.optimization_goal]: params.optimizationGoal,
          [MetaAdSetSDK.Fields.billing_event]: params.billingEvent,
          [MetaAdSetSDK.Fields.bid_strategy]: params.bidStrategy,
          [MetaAdSetSDK.Fields.bid_amount]: params.bidAmount,
          [MetaAdSetSDK.Fields.daily_budget]: params.dailyBudget,
          [MetaAdSetSDK.Fields.lifetime_budget]: params.lifetimeBudget,
          [MetaAdSetSDK.Fields.start_time]: params.startTime,
          [MetaAdSetSDK.Fields.end_time]: params.endTime,
          [MetaAdSetSDK.Fields.targeting]: params.targeting,
          [MetaAdSetSDK.Fields.promoted_object]: params.promotedObject,
          [MetaAdSetSDK.Fields.attribution_spec]: params.attributionSpec,
          is_sac_cfca_terms_certified: params.isSacCfcaTermsCertified,
        };

        removeUndefinedProperties(adSetData);

        const adSet = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAdSet(
          [],
          adSetData
        );
        const validation = MetaCreateSuccessResponseSchema.safeParse(adSet);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for create ad set', {
            error: validation.error.format(),
            response: adSet,
          });
          throw new ValidationError('Failed to create ad set: Invalid API response.');
        }

        const adSetId = validation.data.id;

        const result: CreateAdSetResult = {
          adSetId,
          name: params.name,
          campaignId: params.campaignId,
          status: params.status || 'PAUSED',
        };
        logger.info('Successfully created ad set', {
          userId: authPayload.userId,
          adAccountId,
          adSetId,
          name: params.name,
        });

        return result;
      },
      {
        toolName: 'create_adset',
        userId: authPayload.userId,
      }
    );
  }

  async updateAdSet(
    authPayload: JWTPayload,
    params: {
      adSetId: string;
      name?: string;
      status?: CampaignStatus;
      dailyBudget?: number;
      lifetimeBudget?: number;
      bidAmount?: number;
      targeting?: MetaTargeting;
      startTime?: string;
      endTime?: string;
    }
  ): Promise<UpdateAdSetResult> {
    logger.info('Executing update_adset', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const updateData = {
          [MetaAdSetSDK.Fields.name]: params.name,
          [MetaAdSetSDK.Fields.status]: params.status,
          [MetaAdSetSDK.Fields.daily_budget]: params.dailyBudget,
          [MetaAdSetSDK.Fields.lifetime_budget]: params.lifetimeBudget,
          [MetaAdSetSDK.Fields.bid_amount]: params.bidAmount,
          [MetaAdSetSDK.Fields.targeting]: params.targeting,
          [MetaAdSetSDK.Fields.start_time]: params.startTime,
          [MetaAdSetSDK.Fields.end_time]: params.endTime,
        };
        removeUndefinedProperties(updateData);

        const adSet = new MetaAdSetSDK(params.adSetId, {}, null, api);
        const updateResponse = await adSet.update([], updateData);

        const validation = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
        if (!validation.success) {
          logger.warn('Invalid updateAdSet response from Meta API', {
            response: updateResponse,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after updating the ad set. The operation status is uncertain.'
          );
        }

        logger.info('Ad set updated successfully', { adSetId: params.adSetId });

        const result: UpdateAdSetResult = {
          adSetId: params.adSetId,
          updatedFields: Object.keys(updateData),
        };

        return result;
      },
      {
        toolName: 'update_adset',
        userId: authPayload.userId,
      }
    );
  }

  async deleteAdSet(
    authPayload: JWTPayload,
    params: { adSetId: string; confirmPermanentDelete?: boolean }
  ): Promise<DeleteAdSetResult> {
    logger.info('Executing delete_ad_set', { userId: authPayload.userId, params });

    if (params.confirmPermanentDelete !== true) {
      throw new ValidationError(
        'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.'
      );
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adSet = new MetaAdSetSDK(params.adSetId, {}, null, api);
        const deleteResponse = await adSet.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
        if (!validation.success) {
          logger.warn('Invalid deleteAdSet response from Meta API', {
            response: deleteResponse,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after deleting the ad set. The operation status is uncertain.'
          );
        }

        logger.info('Ad set deleted successfully', { adSetId: params.adSetId });

        const result: DeleteAdSetResult = {
          adSetId: params.adSetId,
        };

        return result;
      },
      {
        toolName: 'delete_adset',
        userId: authPayload.userId,
      }
    );
  }
}
