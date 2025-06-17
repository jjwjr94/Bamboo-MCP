import {
  AdAccount as MetaAdAccountSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import type { JWTPayload } from '../types/index.js';
import type { CampaignStatus, CreateCampaignRequest } from '../types/meta.js';
import { accountManager } from '../utils/accountManager.js';
import { logger } from '../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './metaApi.js';

// ---------------------------------------------------------------------------
// Local helper interface for SDK responses where upstream types are missing.
// This interface captures only the fields that are used inside this file in
// order to keep the typings minimal yet useful. It is NOT exhaustive
// representation of the Meta Ads SDK responses.
// ---------------------------------------------------------------------------

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  budget_remaining?: string;
  spend_cap?: string;
  configured_status?: string;
  start_time?: string;
  stop_time?: string;
}

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
      const campaigns = campaignsCursor as unknown as MetaCampaign[];

      const campaignData = campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        effective_status: campaign.effective_status,
        objective: campaign.objective,
        created_time: campaign.created_time,
        updated_time: campaign.updated_time,
        daily_budget: campaign.daily_budget,
        lifetime_budget: campaign.lifetime_budget,
        bid_strategy: campaign.bid_strategy,
        budget_remaining: campaign.budget_remaining,
        spend_cap: campaign.spend_cap,
        configured_status: campaign.configured_status,
        start_time: campaign.start_time,
        stop_time: campaign.stop_time,
      }));

      return {
        structuredContent: { campaigns: campaignData },
        content: [{ type: 'text' as const, text: JSON.stringify(campaignData, null, 2) }],
      };
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

      // Remove undefined values
      for (const [key, value] of Object.entries(campaignData)) {
        if (typeof value === 'undefined') {
          delete campaignData[key as keyof typeof campaignData];
        }
      }

      const campaign = await new MetaAdAccountSDK(adAccountId).createCampaign([], campaignData);

      logger.info('Campaign created successfully', { campaignId: campaign.id, name: params.name });

      const result = {
        success: true,
        campaignId: campaign.id,
        name: params.name,
        objective: params.objective,
        status: params.status,
        message: `Campaign "${params.name}" created successfully with ID: ${campaign.id}`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
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
      const updateData: Record<string, unknown> = {};

      if (params.name !== undefined) {
        updateData[MetaCampaignSDK.Fields.name] = params.name;
      }
      if (params.status !== undefined) {
        updateData[MetaCampaignSDK.Fields.status] = params.status;
      }
      if (params.dailyBudget !== undefined) {
        updateData[MetaCampaignSDK.Fields.daily_budget] = params.dailyBudget;
      }
      if (params.lifetimeBudget !== undefined) {
        updateData[MetaCampaignSDK.Fields.lifetime_budget] = params.lifetimeBudget;
      }

      const campaign = new MetaCampaignSDK(params.campaignId);
      await campaign.update([], updateData);

      logger.info('Campaign updated successfully', { campaignId: params.campaignId });

      const result = {
        success: true,
        campaignId: params.campaignId,
        updatedFields: Object.keys(updateData),
        message: `Campaign ${params.campaignId} updated successfully`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });
  }

  async deleteCampaign(authPayload: JWTPayload, params: { campaignId: string }) {
    logger.info('Executing delete_campaign', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const campaign = new MetaCampaignSDK(params.campaignId);
      await campaign.delete([]);

      logger.info('Campaign deleted successfully', { campaignId: params.campaignId });

      const result = {
        success: true,
        campaignId: params.campaignId,
        message: `Campaign ${params.campaignId} deleted successfully`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });
  }
}
