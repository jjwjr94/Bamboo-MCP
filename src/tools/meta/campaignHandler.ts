import {
  AdAccount as MetaAdAccountSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaCampaignResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CampaignStatus, CreateCampaignRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaCampaignHandler {
  async getCampaigns(authPayload: JWTPayload, params: { adAccountId?: string }) {
    logger.info('Executing get_campaigns', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const fields = [
        MetaCampaignSDK.Fields.id,
        MetaCampaignSDK.Fields.name,
        MetaCampaignSDK.Fields.status,
        MetaCampaignSDK.Fields.objective,
        MetaCampaignSDK.Fields.created_time,
        MetaCampaignSDK.Fields.updated_time,
        MetaCampaignSDK.Fields.daily_budget,
        MetaCampaignSDK.Fields.lifetime_budget,
        MetaCampaignSDK.Fields.bid_strategy,
        MetaCampaignSDK.Fields.budget_remaining,
        MetaCampaignSDK.Fields.spend_cap,
        MetaCampaignSDK.Fields.configured_status,
        MetaCampaignSDK.Fields.start_time,
        MetaCampaignSDK.Fields.stop_time,
      ];

      const campaignsCursor = await new MetaAdAccountSDK(adAccountId).getCampaigns(fields);

      // Use the common pagination utility to handle all edge cases
      const allRawCampaigns = await fetchAllPaginatedData<unknown>({
        cursor: campaignsCursor,
        limit: env.META_MAX_CAMPAIGNS_TO_FETCH,
        entityName: 'campaigns',
        userId: authPayload.userId,
        apiContext: { adAccountId },
      });

      // Validate each campaign using the auto-generated schema
      const validatedCampaigns: z.infer<typeof MetaCampaignResponseSchema>[] = [];
      for (const campaign of allRawCampaigns) {
        const result = MetaCampaignResponseSchema.safeParse(campaign);
        if (result.success) {
          validatedCampaigns.push(result.data);
        } else {
          logger.warn('Skipping invalid campaign data received from Meta API', {
            campaignId: (campaign as { id?: string }).id || 'Unknown ID',
            errors: result.error.errors,
          });
        }
      }

      const responseData = { campaigns: validatedCampaigns };

      return createMcpSuccessResult(
        responseData,
        `Retrieved ${validatedCampaigns.length} campaigns from ad account ${adAccountId}`
      );
    });
  }

  async createCampaign(authPayload: JWTPayload, params: CreateCampaignRequest) {
    logger.info('Executing create_campaign', { userId: authPayload.userId, params });

    // Validate special_ad_category_country requirement (business rule)
    // Check for invalid combination: NONE cannot be mixed with other categories
    const hasNone = params.specialAdCategories.includes('NONE');
    const hasOtherCategories = params.specialAdCategories.some((cat) => cat !== 'NONE');

    if (hasNone && hasOtherCategories) {
      throw new ValidationError(
        "Invalid special ad categories: 'NONE' cannot be combined with other special ad categories."
      );
    }

    // Check if special_ad_category_country is required
    const isSpecialCategory = params.specialAdCategories.length > 0 && !hasNone;

    if (
      isSpecialCategory &&
      (!params.specialAdCategoryCountry || params.specialAdCategoryCountry.length === 0)
    ) {
      throw new ValidationError(
        "The 'specialAdCategoryCountry' parameter is required when a special ad category is selected."
      );
    }

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      // Safeguard: Default to ['NONE'] if specialAdCategories is null, undefined, or empty.
      // This ensures the parameter is always a valid array with at least one item for the Meta API call.
      const specialCategories =
        params.specialAdCategories && params.specialAdCategories.length > 0
          ? params.specialAdCategories
          : ['NONE'];

      const campaignData: Record<string, unknown> = {
        [MetaCampaignSDK.Fields.name]: params.name,
        [MetaCampaignSDK.Fields.objective]: params.objective,
        [MetaCampaignSDK.Fields.status]: params.status,
        [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        [MetaCampaignSDK.Fields.special_ad_categories]: specialCategories,
        special_ad_category_country: params.specialAdCategoryCountry,
      };

      // Meta API handles business context automatically via ad account
      removeUndefinedProperties(campaignData);

      const campaign = await new MetaAdAccountSDK(adAccountId).createCampaign([], campaignData);

      // Treat response as unknown and validate
      const validationResult = MetaCreateSuccessResponseSchema.safeParse(campaign);
      if (!validationResult.success) {
        logger.warn('Invalid createCampaign response from Meta API', {
          response: campaign,
          errors: validationResult.error.errors,
        });
        throw new ValidationError('Failed to create campaign: Invalid response from Meta API.');
      }

      const campaignId = validationResult.data.id;
      logger.info('Campaign created successfully', { campaignId, name: params.name });

      const result = {
        campaignId: campaignId,
        name: params.name,
        objective: params.objective,
        status: params.status,
      };

      return createMcpSuccessResult(
        result,
        `Campaign "${params.name}" created successfully with ID: ${campaignId}`
      );
    });
  }

  async updateCampaign(
    authPayload: JWTPayload,
    params: {
      campaignId: string;
      name?: string;
      status?: CampaignStatus;
      dailyBudget?: number;
      lifetimeBudget?: number;
    }
  ) {
    logger.info('Executing update_campaign', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const updateData = {
        [MetaCampaignSDK.Fields.name]: params.name,
        [MetaCampaignSDK.Fields.status]: params.status,
        [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
      };
      removeUndefinedProperties(updateData);

      const campaign = new MetaCampaignSDK(params.campaignId);
      const updateResponse = await campaign.update([], updateData);

      // Treat response as unknown and validate
      const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
      if (!validationResult.success) {
        logger.warn('Invalid updateCampaign response from Meta API', {
          response: updateResponse,
          errors: validationResult.error.errors,
        });
        throw new ValidationError('Failed to update campaign: Invalid response from Meta API.');
      }

      logger.info('Campaign updated successfully', { campaignId: params.campaignId });

      const result = {
        campaignId: params.campaignId,
        updatedFields: Object.keys(updateData),
      };

      return createMcpSuccessResult(result, `Campaign ${params.campaignId} updated successfully`);
    });
  }

  async deleteCampaign(authPayload: JWTPayload, params: { campaignId: string }) {
    logger.info('Executing delete_campaign', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const campaign = new MetaCampaignSDK(params.campaignId);
      const deleteResponse = await campaign.delete([]);

      // Treat response as unknown and validate
      const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
      if (!validationResult.success) {
        logger.warn('Invalid deleteCampaign response from Meta API', {
          response: deleteResponse,
          errors: validationResult.error.errors,
        });
        throw new ValidationError('Failed to delete campaign: Invalid response from Meta API.');
      }

      logger.info('Campaign deleted successfully', { campaignId: params.campaignId });

      const result = {
        success: true, // Keep this as it indicates the outcome of the delete operation itself
        campaignId: params.campaignId,
      };

      return createMcpSuccessResult(result, `Campaign ${params.campaignId} deleted successfully`);
    });
  }
}
