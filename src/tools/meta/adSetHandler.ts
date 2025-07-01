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
import type {
  CreateAdSetRequest,
  DeleteAdSetRequest,
  UpdateAdSetRequest,
} from '../../mcp/registries/AdSetToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
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

// Note: Input validation is now handled by the MCP registry schemas
// Only async validation that requires API data remains in the handler

// Helper utility functions extracted from createAdSet to reduce cognitive complexity
function hasSpecialAdCategory(campaign: { special_ad_categories?: readonly string[] }): boolean {
  return (
    Array.isArray(campaign.special_ad_categories) &&
    campaign.special_ad_categories.some((cat) => cat !== 'NONE')
  );
}

function isCampaignBudgetOptimized(campaign: {
  daily_budget?: unknown;
  lifetime_budget?: unknown;
}): boolean {
  return Boolean(campaign.daily_budget || campaign.lifetime_budget);
}

function isTargetingCalifornia(targeting: {
  geoLocations?: { regions?: { key?: string }[] };
}): boolean {
  return !!targeting?.geoLocations?.regions?.some((r) => r.key === META_LOCATION_KEYS.CALIFORNIA);
}

function validateBudgetConstraints(
  isCboCampaign: boolean,
  budget: CreateAdSetRequest['budget']
): void {
  if (isCboCampaign && budget) {
    throw new ValidationError(
      'This ad set belongs to a Campaign Budget Optimization (CBO) campaign. The budget must be managed at the campaign level, so do not provide a budget for the ad set.'
    );
  }

  if (!isCboCampaign && !budget) {
    throw new ValidationError(
      'This ad set belongs to a campaign without budget optimization. You must provide a budget (either daily or lifetime) for the ad set.'
    );
  }
}

function validateSacCompliance(params: {
  isSpecialAdCategory: boolean;
  optimizationGoal: string;
  targetsCalifornia: boolean;
  isSacCfcaTermsCertified?: boolean;
  isEligibleForSacCampaigns?: boolean;
}): void {
  const {
    isSpecialAdCategory,
    optimizationGoal,
    targetsCalifornia,
    isSacCfcaTermsCertified,
    isEligibleForSacCampaigns,
  } = params;

  if (
    isSpecialAdCategory &&
    (SAC_COMPLIANCE.CCPA_REQUIRED_OPTIMIZATION_GOALS as readonly string[]).includes(
      optimizationGoal
    ) &&
    targetsCalifornia &&
    isSacCfcaTermsCertified !== true
  ) {
    throw new ValidationError(
      `For Special Ad Category campaigns with '${optimizationGoal}' goal targeting California, 'isSacCfcaTermsCertified' must be set to true.`
    );
  }

  if (isSpecialAdCategory && isEligibleForSacCampaigns !== true) {
    throw new ValidationError(
      "For Special Ad Category campaigns, 'isEligibleForSacCampaigns' must be set to true as required by Meta's enhanced compliance framework from January 2025."
    );
  }
}

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
        logger.info('Retrieved ad sets', {
          userId: authPayload.userId,
          count: validatedAdSets.length,
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

    // Note: Input validation is now handled by the MCP registry CreateAdSetSchema
    // Only async validation that requires API data remains here

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Fetch campaign to check for special ad categories and budget compatibility (async validation)
        const campaign = await new MetaCampaignSDK(params.campaignId, {}, null, api).read([
          'special_ad_categories',
          'daily_budget',
          'lifetime_budget',
        ]);
        const isSpecialAdCategory = hasSpecialAdCategory(campaign);

        // Campaign vs. Ad Set Budget Validation (requires async campaign data)
        const isCboCampaign = isCampaignBudgetOptimized(campaign);

        validateBudgetConstraints(isCboCampaign, params.budget);

        // Check for California targeting (async validation)
        const targetsCalifornia = isTargetingCalifornia(params.targeting);

        // Enforce SAC-CFCA compliance rule (requires async data)
        validateSacCompliance({
          isSpecialAdCategory,
          optimizationGoal: params.optimizationGoal,
          targetsCalifornia,
          isSacCfcaTermsCertified: params.isSacCfcaTermsCertified,
          isEligibleForSacCampaigns: params.isEligibleForSacCampaigns,
        });

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        // Create a consolidated, camelCased object for API parameters
        const apiParams = {
          name: params.name,
          campaignId: params.campaignId,
          status: params.status || 'PAUSED',
          optimizationGoal: params.optimizationGoal,
          billingEvent: params.billingEvent,
          bidStrategy: params.bidStrategy,
          bidAmount: params.bidAmount,
          dailyBudget: params.budget?.daily,
          lifetimeBudget: params.budget?.lifetime,
          startTime: params.startTime,
          endTime: params.endTime,
          targeting: params.targeting,
          promotedObject: params.promotedObject,
          attributionSpec: params.attributionSpec,
          isSacCfcaTermsCertified: params.isSacCfcaTermsCertified,
          isEligibleForSacCampaigns: params.isEligibleForSacCampaigns,
        };

        // Convert keys to snake_case and remove undefined properties
        const adSetData = convertKeysToSnakeCase(apiParams);
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
        logger.info('Created ad set', {
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
    params: UpdateAdSetRequest
  ): Promise<UpdateAdSetResult> {
    logger.info('Executing update_adset', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // If budget is being updated, perform CBO validation (requires async campaign data)
        if (params.budget && (params.budget.daily || params.budget.lifetime)) {
          // Fetch the ad set to get its parent campaign ID
          const adSetForValidation = await new MetaAdSetSDK(params.adSetId, {}, null, api).read([
            'campaign_id',
          ]);
          const campaignId = adSetForValidation.campaign_id;

          if (!campaignId) {
            throw new ValidationError('Could not determine the parent campaign for the ad set.');
          }

          // Fetch the campaign to check its CBO status
          const campaign = await new MetaCampaignSDK(campaignId, {}, null, api).read([
            'daily_budget',
            'lifetime_budget',
          ]);
          const isCboCampaign = isCampaignBudgetOptimized(campaign);

          if (isCboCampaign) {
            throw new ValidationError(
              'Cannot update the budget of an ad set that belongs to a Campaign Budget Optimization (CBO) campaign. Budget must be managed at the campaign level.'
            );
          }
        }

        // Separate adSetId and budget from fields to be updated
        const { adSetId, budget, ...otherFields } = params;

        // Flatten the budget object for the API call
        const updateFields = {
          ...otherFields,
          dailyBudget: budget?.daily,
          lifetimeBudget: budget?.lifetime,
        };

        // Convert keys to snake_case and remove undefined properties
        const updateData = convertKeysToSnakeCase(updateFields);
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

        logger.info('Ad set updated', { adSetId: params.adSetId });

        const result: UpdateAdSetResult = {
          adSetId: params.adSetId,
          updatedFields: Object.keys(updateFields).filter(
            (key) => updateFields[key as keyof typeof updateFields] !== undefined
          ),
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
    params: DeleteAdSetRequest
  ): Promise<DeleteAdSetResult> {
    logger.info('Executing delete_ad_set', { userId: authPayload.userId, params });

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

        logger.info('Ad set deleted', { adSetId: params.adSetId });

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
