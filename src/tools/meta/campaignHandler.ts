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
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

export class MetaCampaignHandler {
  async getCampaigns(authPayload: JWTPayload, params: { adAccountId?: string }) {
    logger.info('Executing get_campaigns', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      // Handle account selection intelligently
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const fields = [
        MetaCampaignSDK.Fields.id,
        MetaCampaignSDK.Fields.name,
        MetaCampaignSDK.Fields.status,
        MetaCampaignSDK.Fields.effective_status,
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

      // Treat the response as unknown and validate it
      const rawCampaigns = campaignsCursor as unknown;

      // Validate each campaign using the auto-generated schema
      const validatedCampaigns: z.infer<typeof MetaCampaignResponseSchema>[] = [];
      if (Array.isArray(rawCampaigns)) {
        for (const campaign of rawCampaigns) {
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

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const campaignData: Record<string, unknown> = {
        [MetaCampaignSDK.Fields.name]: params.name,
        [MetaCampaignSDK.Fields.objective]: params.objective,
        [MetaCampaignSDK.Fields.status]: params.status,
        [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        [MetaCampaignSDK.Fields.special_ad_categories]: params.specialAdCategories,
      };

      removeUndefinedProperties(campaignData);

      const campaign = await new MetaAdAccountSDK(adAccountId).createCampaign([], campaignData);

      // Treat response as unknown and validate
      const validationResult = MetaCreateSuccessResponseSchema.safeParse(campaign);
      if (!validationResult.success) {
        logger.warn('Invalid createCampaign response from Meta API', {
          response: campaign,
          errors: validationResult.error.errors,
        });
        throw new Error('Failed to create campaign: Invalid response from Meta API.');
      }

      const campaignId = validationResult.data.id;
      logger.info('Campaign created successfully', { campaignId, name: params.name });

      const result = {
        success: true,
        campaignId: campaignId,
        name: params.name,
        objective: params.objective,
        status: params.status,
        message: `Campaign "${params.name}" created successfully with ID: ${campaignId}`,
      };

      return createMcpSuccessResult(result, 'Campaign created successfully');
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
        throw new Error('Failed to update campaign: Invalid response from Meta API.');
      }

      logger.info('Campaign updated successfully', { campaignId: params.campaignId });

      const result = {
        success: true,
        campaignId: params.campaignId,
        updatedFields: Object.keys(updateData),
        message: `Campaign ${params.campaignId} updated successfully`,
      };

      return createMcpSuccessResult(result, 'Campaign updated successfully');
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
        throw new Error('Failed to delete campaign: Invalid response from Meta API.');
      }

      logger.info('Campaign deleted successfully', { campaignId: params.campaignId });

      const result = {
        success: true,
        campaignId: params.campaignId,
        message: `Campaign ${params.campaignId} deleted successfully`,
      };

      return createMcpSuccessResult(result, 'Campaign deleted successfully');
    });
  }
}
