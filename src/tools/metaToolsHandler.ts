import { sql } from 'drizzle-orm';
import {
  AdAccount as MetaAdAccountSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
  User as MetaUserSDK,
} from 'facebook-nodejs-business-sdk';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import type { JWTPayload } from '../types/index.js';
import type { CampaignStatus, CreateCampaignRequest } from '../types/meta.js';
import type { CreateAdSetRequest, MetaTargeting } from '../types/meta.js';
import { accountManager } from '../utils/accountManager.js';
import { logger } from '../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './metaApi.js';

export class MetaToolsHandler {
  async getAdAccounts(authPayload: JWTPayload, params: any = {}) {
    logger.info('Executing get_ad_accounts', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const fields = [
        MetaAdAccountSDK.Fields.id,
        MetaAdAccountSDK.Fields.name,
        MetaAdAccountSDK.Fields.account_status,
        MetaAdAccountSDK.Fields.currency,
        MetaAdAccountSDK.Fields.timezone_name,
      ];

      const metaAccounts = await new MetaUserSDK('me').getAdAccounts(fields);

      // Fetch permissions for each account
      const accountsToStore = await Promise.all(
        metaAccounts.map(async (acc: any) => {
          let permissions = ['UNKNOWN'];

          try {
            const users = await new MetaAdAccountSDK(acc.id).getUsers(['id', 'role']);
            const currentUser = await new MetaUserSDK('me').get(['id']);
            const userRole = users.find((u: any) => u.id === currentUser.id);

            if (userRole) {
              permissions = [userRole.role];
            }
          } catch (error) {
            logger.warn('Failed to fetch permissions for ad account', {
              accountId: acc.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          return {
            id: acc.id,
            name: acc.name,
            status: acc.account_status,
            currency: acc.currency,
            timezone: acc.timezone_name,
            permissions,
          };
        })
      );

      // Store in database
      await withUserContext(authPayload.userId, async () => {
        await db
          .insert(adAccounts)
          .values(
            accountsToStore.map((acc) => ({
              ...acc,
              userId: authPayload.userId,
            }))
          )
          .onConflictDoUpdate({
            target: [adAccounts.id, adAccounts.userId],
            set: {
              name: sql`excluded.name`,
              status: sql`excluded.status`,
              currency: sql`excluded.currency`,
              timezone: sql`excluded.timezone`,
              permissions: sql`excluded.permissions`,
            },
          });
      });

      logger.info('Ad accounts retrieved and stored', { count: accountsToStore.length });
      return {
        structuredContent: { accounts: accountsToStore },
        content: [{ type: 'text' as const, text: JSON.stringify(accountsToStore, null, 2) }],
      };
    });
  }

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

      const campaigns = await new MetaAdAccountSDK(adAccountId).getCampaigns(fields);

      const campaignData = campaigns.map((campaign: any) => ({
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

  async callMetaApi(
    authPayload: JWTPayload,
    params: {
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      fields?: string[];
      parameters?: Record<string, any>;
    }
  ) {
    logger.info('Executing call_meta_api', { userId: authPayload.userId, params });

    const api = await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const { endpoint, method = 'GET', fields, parameters = {} } = params;

      // Add fields if provided
      if (fields && fields.length > 0) {
        parameters.fields = fields.join(',');
      }

      const endpointParts = endpoint.split('/');
      const responseData = await api.call(method, endpointParts, parameters);

      return {
        structuredContent: { responseData },
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
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

      const campaignData: Record<string, any> = {
        [MetaCampaignSDK.Fields.name]: params.name,
        [MetaCampaignSDK.Fields.objective]: params.objective,
        [MetaCampaignSDK.Fields.status]: params.status,
        [MetaCampaignSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaCampaignSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        [MetaCampaignSDK.Fields.special_ad_categories]: params.specialAdCategories,
      };

      // Remove undefined values
      Object.keys(campaignData).forEach((key) => {
        if (campaignData[key] === undefined) {
          delete campaignData[key];
        }
      });

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
      const updateData: Record<string, any> = {};

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

  async getAdSets(authPayload: JWTPayload, params: { campaignId?: string; adAccountId?: string }) {
    logger.info('Executing get_adsets', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const fields = [
        'id',
        'name',
        'status',
        'effective_status',
        'configured_status',
        'created_time',
        'updated_time',
        'start_time',
        'end_time',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'billing_event',
        'optimization_goal',
        'bid_amount',
        'targeting',
        'attribution_spec',
        'promoted_object',
      ];

      let adSets;
      if (params.campaignId) {
        adSets = await new MetaCampaignSDK(params.campaignId).getAdSets(fields);
      } else {
        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));
        adSets = await new MetaAdAccountSDK(adAccountId).getAdSets(fields);
      }

      const adSetData = adSets.map((adSet: any) => ({
        id: adSet.id,
        name: adSet.name,
        status: adSet.status,
        effective_status: adSet.effective_status,
        configured_status: adSet.configured_status,
        created_time: adSet.created_time,
        updated_time: adSet.updated_time,
        start_time: adSet.start_time,
        end_time: adSet.end_time,
        daily_budget: adSet.daily_budget,
        lifetime_budget: adSet.lifetime_budget,
        budget_remaining: adSet.budget_remaining,
        billing_event: adSet.billing_event,
        optimization_goal: adSet.optimization_goal,
        bid_amount: adSet.bid_amount,
        targeting: adSet.targeting,
        attribution_spec: adSet.attribution_spec,
        promoted_object: adSet.promoted_object,
      }));

      return {
        structuredContent: { adSets: adSetData },
        content: [{ type: 'text' as const, text: JSON.stringify(adSetData, null, 2) }],
      };
    });
  }

  async createAdSet(authPayload: JWTPayload, params: CreateAdSetRequest) {
    logger.info('Executing create_adset', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

        return await handleMetaApiCall(async () => {
      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        undefined
      );

      const adSetData: Record<string, any> = {
        name: params.name,
        campaign_id: params.campaignId, // Required: tie ad set to campaign
        daily_budget: params.dailyBudget,
        lifetime_budget: params.lifetimeBudget,
        targeting: params.targeting,
        billing_event: params.billingEvent,
        optimization_goal: params.optimizationGoal,
        bid_amount: params.bidAmount,
        start_time: params.startTime,
        end_time: params.endTime,
        status: params.status || 'PAUSED',
      };

      // Remove undefined values
      Object.keys(adSetData).forEach((key) => {
        if (adSetData[key] === undefined) {
          delete adSetData[key];
        }
      });

      const adSet = await new MetaAdAccountSDK(adAccountId).createAdSet([], adSetData);

      logger.info('Ad set created successfully', { adSetId: adSet.id, name: params.name });

      const result = {
        success: true,
        adSetId: adSet.id,
        name: params.name,
        campaignId: params.campaignId,
        message: `Ad set "${params.name}" created successfully with ID: ${adSet.id}`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });
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
  ) {
    logger.info('Executing update_adset', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const updateData: Record<string, any> = {};

      if (params.name !== undefined) updateData.name = params.name;
      if (params.status !== undefined) updateData.status = params.status;
      if (params.dailyBudget !== undefined) updateData.daily_budget = params.dailyBudget;
      if (params.lifetimeBudget !== undefined) updateData.lifetime_budget = params.lifetimeBudget;
      if (params.bidAmount !== undefined) updateData.bid_amount = params.bidAmount;
      if (params.targeting !== undefined) updateData.targeting = params.targeting;
      if (params.startTime !== undefined) updateData.start_time = params.startTime;
      if (params.endTime !== undefined) updateData.end_time = params.endTime;

      const adSet = new MetaAdSetSDK(params.adSetId);
      await adSet.update([], updateData);

      logger.info('Ad set updated successfully', { adSetId: params.adSetId });

      const result = {
        success: true,
        adSetId: params.adSetId,
        updatedFields: Object.keys(updateData),
        message: `Ad set ${params.adSetId} updated successfully`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });
  }

  async deleteAdSet(authPayload: JWTPayload, params: { adSetId: string }) {
    logger.info('Executing delete_adset', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const adSet = new MetaAdSetSDK(params.adSetId);
      await adSet.delete([]);

      logger.info('Ad set deleted successfully', { adSetId: params.adSetId });

      const result = {
        success: true,
        adSetId: params.adSetId,
        message: `Ad set ${params.adSetId} deleted successfully`,
      };

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });
  }
}
