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
import { MetaCampaignHandler } from './metaCampaignHandler.js';

// ---------------------------------------------------------------------------
// Local helper interfaces for SDK responses where upstream types are missing.
// These interfaces capture only the fields that are used inside this file in
// order to keep the typings minimal yet useful. They are NOT exhaustive
// representations of the Meta Ads SDK responses.
// ---------------------------------------------------------------------------

interface MetaAdAccount {
  id: string;
  name: string;
  account_status: string | number; // API may return numeric code – stored as string later
  currency: string;
  timezone_name: string;
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  configured_status: string;
  created_time: string;
  updated_time: string;
  start_time: string;
  end_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  billing_event?: string;
  optimization_goal?: string;
  bid_amount?: string;
  targeting?: unknown;
  attribution_spec?: unknown;
  promoted_object?: unknown;
}

type MetaApiParameters = Record<
  string,
  string | number | boolean | undefined | Array<unknown> | Record<string, unknown>
>;

export class MetaToolsHandler {
  private campaignHandler = new MetaCampaignHandler();

  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
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

      // The SDK does not ship with TypeScript definitions, so we cast here to a
      // minimal interface capturing only the properties we care about.
      const metaAccountsCursor = await new MetaUserSDK('me').getAdAccounts(fields);
      const metaAccounts = metaAccountsCursor as unknown as MetaAdAccount[];

      // Fetch permissions for each account
      const accountsToStore = await Promise.all(
        metaAccounts.map(
          async (acc: {
            id: string;
            name: string;
            account_status: string | number;
            currency: string;
            timezone_name: string;
          }) => {
            let permissions = ['UNKNOWN'];

            try {
              const usersCursor = await new MetaAdAccountSDK(acc.id).getUsers(['id', 'role']);
              const users = usersCursor as unknown as Array<{
                id: string;
                role: string;
              }>;
              const currentUser = await new MetaUserSDK('me').get(['id']);
              const userRole = users.find((u) => u.id === currentUser.id);

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
              status: String(acc.account_status),
              currency: acc.currency,
              timezone: acc.timezone_name,
              permissions,
            };
          }
        )
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

  async callMetaApi(
    authPayload: JWTPayload,
    params: {
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      fields?: string[];
      parameters?: MetaApiParameters;
    }
  ) {
    logger.info('Executing call_meta_api', { userId: authPayload.userId, params });

    const api = await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const { endpoint, method = 'GET', fields, parameters = {} } = params;

      // Prepare parameters with optional fields attribute
      const requestParams: MetaApiParameters = { ...parameters };
      if (fields && fields.length > 0) {
        requestParams.fields = fields.join(',');
      }

      const endpointParts = endpoint.split('/');
      const responseData = await api.call(method, endpointParts, requestParams);

      return {
        structuredContent: { responseData },
        content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      };
    });
  }

  // Campaign methods - delegated to MetaCampaignHandler
  async getCampaigns(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.campaignHandler.getCampaigns(authPayload, params);
  }

  async createCampaign(authPayload: JWTPayload, params: CreateCampaignRequest) {
    return this.campaignHandler.createCampaign(authPayload, params);
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
    return this.campaignHandler.updateCampaign(authPayload, params);
  }

  async deleteCampaign(authPayload: JWTPayload, params: { campaignId: string }) {
    return this.campaignHandler.deleteCampaign(authPayload, params);
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

      const adSetsCursor = params.campaignId
        ? await new MetaCampaignSDK(params.campaignId).getAdSets(fields)
        : await new MetaAdAccountSDK(
            params.adAccountId ||
              (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId))
          ).getAdSets(fields);

      const adSets = adSetsCursor as unknown as MetaAdSet[];

      const adSetData = adSets.map((adSet) => ({
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

      const adSetData: Record<string, unknown> = {
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
      for (const [key, value] of Object.entries(adSetData)) {
        if (typeof value === 'undefined') {
          delete adSetData[key as keyof typeof adSetData];
        }
      }

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

  /**
   * Builds update data object with only defined properties
   */
  private buildAdSetUpdateData(params: {
    name?: string;
    status?: CampaignStatus;
    dailyBudget?: number;
    lifetimeBudget?: number;
    bidAmount?: number;
    targeting?: MetaTargeting;
    startTime?: string;
    endTime?: string;
  }): Record<string, unknown> {
    const updateData = {
      ...(params.name !== undefined && { name: params.name }),
      ...(params.status !== undefined && { status: params.status }),
      ...(params.dailyBudget !== undefined && { daily_budget: params.dailyBudget }),
      ...(params.lifetimeBudget !== undefined && { lifetime_budget: params.lifetimeBudget }),
      ...(params.bidAmount !== undefined && { bid_amount: params.bidAmount }),
      ...(params.targeting !== undefined && { targeting: params.targeting }),
      ...(params.startTime !== undefined && { start_time: params.startTime }),
      ...(params.endTime !== undefined && { end_time: params.endTime }),
    };

    return updateData;
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
      const updateData = this.buildAdSetUpdateData(params);

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
