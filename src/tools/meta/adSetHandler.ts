import {
  AdAccount as MetaAdAccountSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import { z } from 'zod';
import {
  MetaAdSetResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { DeletionConfirmationSchema } from '../../mcp/registries/registryHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdSetRequest, UpdateAdSetRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { ADSET_COMPATIBILITY, META_LOCATION_KEYS, SAC_COMPLIANCE } from './constants.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateAdSetResult,
  DeleteAdSetResult,
  GetAdSetsResult,
  MetaAdSet,
  UpdateAdSetResult,
} from './types.js';

// Define business logic validation schema for ad sets
// Note: Static validation (budget XOR, field types, required fields) is handled by the MCP registry
const CreateAdSetValidationSchema = z
  .object({
    targeting: z.object({
      geoLocations: z.object({
        countries: z.array(z.string()).optional(),
        regions: z.array(z.object({ key: z.string() })).optional(),
        cities: z.array(z.object({ key: z.string() })).optional(),
      }),
    }),
    optimizationGoal: z.string(),
    billingEvent: z.string(),
    promotedObject: z.record(z.string(), z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    // 1. Geographic targeting validation (business logic - not static)
    const geoLocs = data.targeting.geoLocations;
    if (!geoLocs.countries?.length && !geoLocs.regions?.length && !geoLocs.cities?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Geographic targeting must specify at least one of: countries, regions, or cities.',
        path: ['targeting', 'geoLocations'],
      });
    }

    // 2. Promoted object requirements based on optimization goal (business logic)
    if (data.optimizationGoal === 'APP_INSTALLS' && !data.promotedObject?.application_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "For the 'APP_INSTALLS' optimization goal, 'promotedObject' must include 'application_id'.",
        path: ['promotedObject'],
      });
    }
    if (data.optimizationGoal === 'LEAD_GENERATION' && !data.promotedObject?.page_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "For the 'LEAD_GENERATION' optimization goal, 'promotedObject' must include 'page_id'.",
        path: ['promotedObject'],
      });
    }

    // 3. Billing event compatibility matrix validation (business logic)
    const billingEvent = data.billingEvent;
    if (billingEvent in ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP) {
      const compatibleGoals =
        ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP[
          billingEvent as keyof typeof ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP
        ];
      if (!compatibleGoals.includes(data.optimizationGoal as never)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Optimization goal '${data.optimizationGoal}' is not compatible with billing event '${billingEvent}'. Valid optimization goals for '${billingEvent}' are: ${compatibleGoals.join(', ')}.`,
          path: ['optimizationGoal'],
        });
      }
    }
  });

// UpdateAdSetValidationSchema removed - static validation handled by MCP registry
// No dynamic business logic validation required for updates

const DeleteAdSetValidationSchema = z.object({
  confirmPermanentDelete: DeletionConfirmationSchema,
});

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

    const validation = CreateAdSetValidationSchema.safeParse(params);
    if (!validation.success) {
      // Extract the first validation error for clear error messaging
      const error = validation.error.errors[0];
      throw new ValidationError(error.message);
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Fetch campaign to check for special ad categories (async validation)
        const campaign = await new MetaCampaignSDK(params.campaignId, {}, null, api).read([
          'special_ad_categories',
        ]);
        const isSpecialAdCategory = campaign.special_ad_categories?.some(
          (cat: string) => cat !== 'NONE'
        );

        // Check for California targeting (async validation)
        const targetsCalifornia = params.targeting.geoLocations?.regions?.some(
          (r) => r.key === META_LOCATION_KEYS.CALIFORNIA
        );

        // Enforce SAC-CFCA compliance rule (requires async data)
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

        // Validate SAC campaign eligibility field (requires async data)
        if (isSpecialAdCategory && params.isEligibleForSacCampaigns !== true) {
          throw new ValidationError(
            "For Special Ad Category campaigns, 'isEligibleForSacCampaigns' must be set to true as required by Meta's enhanced compliance framework from January 2025."
          );
        }

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
          dailyBudget: params.budget.daily,
          lifetimeBudget: params.budget.lifetime,
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

    // Static validation (budget XOR, field types) handled by MCP registry
    // No additional dynamic business logic validation required for updates

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

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

    const validationResult = DeleteAdSetValidationSchema.safeParse(params);
    if (!validationResult.success) {
      const error = validationResult.error.errors[0];
      throw new ValidationError(error.message);
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
