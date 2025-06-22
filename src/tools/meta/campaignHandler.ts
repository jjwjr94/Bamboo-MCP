import {
  AdAccount as MetaAdAccountSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import {
  MetaCampaignResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateCampaignRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateCampaignResult,
  DeleteCampaignResult,
  GetCampaignsResult,
  MetaCampaign,
  UpdateCampaignResult,
} from './types.js';

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
        logger.info('Successfully retrieved campaigns', {
          userId: authPayload.userId,
          adAccountId,
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

    // Validate budget requirement: either dailyBudget OR lifetimeBudget must be provided
    if (!params.dailyBudget && !params.lifetimeBudget) {
      throw new ValidationError('A campaign must have either a dailyBudget or a lifetimeBudget.');
    }
    if (params.dailyBudget && params.lifetimeBudget) {
      throw new ValidationError('Provide either dailyBudget or lifetimeBudget, but not both.');
    }

    // Validate Special Ad Category requirements
    const hasSpecialCategory = params.specialAdCategories.some((cat) => cat !== 'NONE');
    if (
      hasSpecialCategory &&
      (!params.specialAdCategoryCountry || params.specialAdCategoryCountry.length === 0)
    ) {
      throw new ValidationError(
        "The 'specialAdCategoryCountry' parameter is required when 'specialAdCategories' contains values other than 'NONE'."
      );
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        const campaignData: Record<string, unknown> = {
          [MetaCampaignSDK.Fields.name]: params.name,
          [MetaCampaignSDK.Fields.objective]: params.objective,
          [MetaCampaignSDK.Fields.buying_type]: params.buying_type || 'AUCTION',
          [MetaCampaignSDK.Fields.status]: params.status || 'PAUSED',
          [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
          [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
          [MetaCampaignSDK.Fields.special_ad_categories]: params.specialAdCategories,
          [MetaCampaignSDK.Fields.special_ad_category_country]: params.specialAdCategoryCountry,
        };

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
        logger.info('Successfully created campaign', {
          userId: authPayload.userId,
          adAccountId,
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
    params: {
      campaignId: string;
      name?: string;
      status?: string;
      dailyBudget?: number;
      lifetimeBudget?: number;
    }
  ): Promise<UpdateCampaignResult> {
    logger.info('Executing update_campaign', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const updateData: Record<string, unknown> = {
          [MetaCampaignSDK.Fields.name]: params.name,
          [MetaCampaignSDK.Fields.status]: params.status,
          [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
          [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        };

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

        const result: UpdateCampaignResult = {
          campaignId: params.campaignId,
          updatedFields: Object.keys(updateData),
        };
        logger.info('Successfully updated campaign', {
          userId: authPayload.userId,
          campaignId: params.campaignId,
          updatedFields: Object.keys(updateData),
        });

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

    if (params.confirmPermanentDelete !== true) {
      throw new ValidationError(
        'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.'
      );
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const campaign = new MetaCampaignSDK(params.campaignId, {}, null, api);
        const deleteResponse = await campaign.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for delete campaign', {
            error: validation.error.format(),
            response: deleteResponse,
          });
          throw new ValidationError('Failed to delete campaign: Invalid API response.');
        }

        const result: DeleteCampaignResult = { campaignId: params.campaignId };
        logger.info('Successfully deleted campaign', {
          userId: authPayload.userId,
          campaignId: params.campaignId,
        });

        return result;
      },
      {
        toolName: 'delete_campaign',
        userId: authPayload.userId,
      }
    );
  }
}
