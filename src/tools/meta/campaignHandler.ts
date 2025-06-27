import {
  AdAccount as MetaAdAccountSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import { z } from 'zod';
import {
  MetaCampaignResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import type {
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from '../../mcp/registries/CampaignToolRegistry.js';
import { DeletionConfirmationSchema } from '../../mcp/registries/registryHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateCampaignResult,
  DeleteCampaignResult,
  GetCampaignsResult,
  MetaCampaign,
  UpdateCampaignResult,
} from './types.js';

// Define validation schemas for campaigns
const BudgetXorValidationSchema = z
  .object({
    dailyBudget: z.number().optional(),
    lifetimeBudget: z.number().optional(),
  })
  .refine(
    (data) =>
      (data.dailyBudget && !data.lifetimeBudget) || (!data.dailyBudget && data.lifetimeBudget),
    {
      message: 'A campaign must have either a dailyBudget or a lifetimeBudget, but not both.',
      path: ['dailyBudget'],
    }
  );

const SpecialAdCategoryValidationSchema = z
  .object({
    specialAdCategories: z.array(z.string()),
    specialAdCategoryCountry: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      const hasSpecialCategory = data.specialAdCategories.some((cat) => cat !== 'NONE');
      return (
        !hasSpecialCategory ||
        (data.specialAdCategoryCountry && data.specialAdCategoryCountry.length > 0)
      );
    },
    {
      message:
        "The 'specialAdCategoryCountry' parameter is required when 'specialAdCategories' contains values other than 'NONE'.",
      path: ['specialAdCategoryCountry'],
    }
  );

const UpdateBudgetValidationSchema = z
  .object({
    dailyBudget: z.number().optional(),
    lifetimeBudget: z.number().optional(),
  })
  .refine((data) => !(data.dailyBudget && data.lifetimeBudget), {
    message: 'Provide either dailyBudget or lifetimeBudget for an update, but not both.',
    path: ['dailyBudget'],
  });

const DeleteCampaignValidationSchema = z.object({
  confirmPermanentDelete: DeletionConfirmationSchema,
});

export class MetaCampaignHandler {
  async getCampaigns(
    authPayload: JWTPayload,
    params: { adAccountId?: string }
  ): Promise<GetCampaignsResult> {
    logger.info('Executing get_campaigns', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        const fields = [
          MetaCampaignSDK.Fields.id,
          MetaCampaignSDK.Fields.name,
          MetaCampaignSDK.Fields.status,
          MetaCampaignSDK.Fields.effective_status,
          MetaCampaignSDK.Fields.objective,
          MetaCampaignSDK.Fields.created_time,
          MetaCampaignSDK.Fields.updated_time,
          MetaCampaignSDK.Fields.start_time,
          MetaCampaignSDK.Fields.stop_time,
          MetaCampaignSDK.Fields.daily_budget,
          MetaCampaignSDK.Fields.lifetime_budget,
          MetaCampaignSDK.Fields.budget_remaining,
          MetaCampaignSDK.Fields.buying_type,
          MetaCampaignSDK.Fields.bid_strategy,
          MetaCampaignSDK.Fields.special_ad_categories,
        ];

        const campaignsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getCampaigns(
          fields
        );

        const allRawCampaigns = await fetchAllPaginatedData<unknown>({
          cursor: campaignsCursor,
          limit: env.META_MAX_CAMPAIGNS_TO_FETCH,
          entityName: 'campaigns',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });

        const validatedCampaigns: MetaCampaign[] = [];
        for (const campaign of allRawCampaigns) {
          const result = MetaCampaignResponseSchema.safeParse(campaign);
          if (result.success) {
            validatedCampaigns.push(result.data);
          } else {
            logger.warn('Invalid campaign data received from Meta API, skipping.', {
              error: result.error.format(),
              campaign,
              userId: authPayload.userId,
              adAccountId,
            });
          }
        }

        const response: GetCampaignsResult = { campaigns: validatedCampaigns };
        logger.info('Retrieved campaigns', {
          userId: authPayload.userId,
          count: validatedCampaigns.length,
        });

        return response;
      },
      {
        toolName: 'get_campaigns',
        userId: authPayload.userId,
      }
    );
  }

  async createCampaign(
    authPayload: JWTPayload,
    params: CreateCampaignRequest
  ): Promise<CreateCampaignResult> {
    logger.info('Executing create_campaign', { userId: authPayload.userId, params });

    const budgetValidation = BudgetXorValidationSchema.safeParse(params);
    if (!budgetValidation.success) {
      const error = budgetValidation.error.errors[0];
      throw new ValidationError(error.message);
    }

    const sacValidation = SpecialAdCategoryValidationSchema.safeParse(params);
    if (!sacValidation.success) {
      const error = sacValidation.error.errors[0];
      throw new ValidationError(error.message);
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        // Create a consolidated, camelCased object for API parameters
        const apiParams = {
          name: params.name,
          objective: params.objective,
          buyingType: params.buying_type || 'AUCTION',
          status: params.status || 'PAUSED',
          dailyBudget: params.dailyBudget,
          lifetimeBudget: params.lifetimeBudget,
          specialAdCategories: params.specialAdCategories,
          specialAdCategoryCountry: params.specialAdCategoryCountry,
        };

        // Convert keys to snake_case and remove undefined properties
        const campaignData = convertKeysToSnakeCase(apiParams);
        removeUndefinedProperties(campaignData);

        const campaign = await new MetaAdAccountSDK(adAccountId, {}, null, api).createCampaign(
          [],
          campaignData
        );
        const validation = MetaCreateSuccessResponseSchema.safeParse(campaign);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for create campaign', {
            error: validation.error.format(),
            response: campaign,
          });
          throw new ValidationError('Failed to create campaign: Invalid API response.');
        }

        const campaignId = validation.data.id;

        const result: CreateCampaignResult = {
          campaignId,
          name: params.name,
          objective: params.objective,
          status: params.status || 'PAUSED',
        };
        logger.info('Created campaign', {
          userId: authPayload.userId,
          campaignId,
          name: params.name,
        });

        return result;
      },
      {
        toolName: 'create_campaign',
        userId: authPayload.userId,
      }
    );
  }

  async updateCampaign(
    authPayload: JWTPayload,
    params: UpdateCampaignRequest
  ): Promise<UpdateCampaignResult> {
    logger.info('Executing update_campaign', { userId: authPayload.userId, params });

    const budgetValidation = UpdateBudgetValidationSchema.safeParse(params);
    if (!budgetValidation.success) {
      const error = budgetValidation.error.errors[0];
      throw new ValidationError(error.message);
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Separate campaignId from fields to be updated
        const { campaignId, ...updateFields } = params;

        // Convert keys to snake_case and remove undefined properties
        const updateData = convertKeysToSnakeCase(updateFields);
        removeUndefinedProperties(updateData);

        const campaign = new MetaCampaignSDK(params.campaignId, {}, null, api);
        const updateResponse = await campaign.update([], updateData);

        const validation = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for update campaign', {
            error: validation.error.format(),
            response: updateResponse,
          });
          throw new ValidationError('Failed to update campaign: Invalid API response.');
        }

        logger.info('Updated campaign', { campaignId: params.campaignId });

        const result: UpdateCampaignResult = {
          campaignId: params.campaignId,
          updatedFields: Object.keys(updateData),
        };

        return result;
      },
      {
        toolName: 'update_campaign',
        userId: authPayload.userId,
      }
    );
  }

  async deleteCampaign(
    authPayload: JWTPayload,
    params: { campaignId: string; confirmPermanentDelete?: boolean }
  ): Promise<DeleteCampaignResult> {
    logger.info('Executing delete_campaign', { userId: authPayload.userId, params });

    const validationResult = DeleteCampaignValidationSchema.safeParse(params);
    if (!validationResult.success) {
      const error = validationResult.error.errors[0];
      throw new ValidationError(error.message);
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const campaign = new MetaCampaignSDK(params.campaignId, {}, null, api);

        // The Facebook Marketing API uses a POST call with the object ID to delete
        // campaigns – the SDK exposes this via the `.delete()` helper.
        const deleteResponse = await campaign.delete([], {});

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);

        if (!validation.success) {
          logger.warn('Invalid deleteCampaign response from Meta API', {
            response: deleteResponse,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after deleting the campaign. The operation status is uncertain.'
          );
        }

        logger.info('Deleted campaign', { campaignId: params.campaignId });

        const result: DeleteCampaignResult = { campaignId: params.campaignId };
        return result;
      },
      {
        toolName: 'delete_campaign',
        userId: authPayload.userId,
      }
    );
  }
}
