import {
  AdAccount as MetaAdAccountSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type {
  CampaignStatus,
  CreateAdSetRequest,
  MetaAdSet,
  MetaTargeting,
} from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

export class MetaAdSetHandler {
  async getAdSets(authPayload: JWTPayload, params: { campaignId?: string; adAccountId?: string }) {
    logger.info('Executing get_adsets', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      const fields = [
        MetaAdSetSDK.Fields.id,
        MetaAdSetSDK.Fields.name,
        MetaAdSetSDK.Fields.status,
        MetaAdSetSDK.Fields.effective_status,
        MetaAdSetSDK.Fields.configured_status,
        MetaAdSetSDK.Fields.created_time,
        MetaAdSetSDK.Fields.updated_time,
        MetaAdSetSDK.Fields.start_time,
        MetaAdSetSDK.Fields.end_time,
        MetaAdSetSDK.Fields.daily_budget,
        MetaAdSetSDK.Fields.lifetime_budget,
        MetaAdSetSDK.Fields.budget_remaining,
        MetaAdSetSDK.Fields.billing_event,
        MetaAdSetSDK.Fields.optimization_goal,
        MetaAdSetSDK.Fields.bid_amount,
        MetaAdSetSDK.Fields.targeting,
        MetaAdSetSDK.Fields.attribution_spec,
        MetaAdSetSDK.Fields.promoted_object,
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
        bid_amount: adSet.bid_amount ? Number(adSet.bid_amount) : null,
        targeting: adSet.targeting,
        attribution_spec: adSet.attribution_spec,
        promoted_object: adSet.promoted_object,
      }));

      return createMcpSuccessResult({ adSets: adSetData }, `Retrieved ${adSetData.length} ad sets`);
    });
  }

  async createAdSet(authPayload: JWTPayload, params: CreateAdSetRequest) {
    logger.info('Executing create_adset', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    return await handleMetaApiCall(async () => {
      // Use the account selection logic to determine the ad account
      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        undefined
      );

      const adSetData: Record<string, unknown> = {
        [MetaAdSetSDK.Fields.name]: params.name,
        [MetaAdSetSDK.Fields.campaign_id]: params.campaignId,
        [MetaAdSetSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaAdSetSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        [MetaAdSetSDK.Fields.targeting]: params.targeting,
        [MetaAdSetSDK.Fields.billing_event]: params.billingEvent,
        [MetaAdSetSDK.Fields.optimization_goal]: params.optimizationGoal,
        [MetaAdSetSDK.Fields.bid_amount]: params.bidAmount,
        [MetaAdSetSDK.Fields.start_time]: params.startTime,
        [MetaAdSetSDK.Fields.end_time]: params.endTime,
        [MetaAdSetSDK.Fields.status]: params.status || 'PAUSED',
      };

      // Remove undefined values
      removeUndefinedProperties(adSetData);

      const adSet = await new MetaAdAccountSDK(adAccountId).createAdSet([], adSetData);

      logger.info('Ad set created successfully', { adSetId: adSet.id, name: params.name });

      const result = {
        success: true,
        adSetId: adSet.id,
        name: params.name,
        campaignId: params.campaignId,
        message: `Ad set "${params.name}" created successfully with ID: ${adSet.id}`,
      };

      return createMcpSuccessResult(result, 'Ad set created successfully');
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

      const adSet = new MetaAdSetSDK(params.adSetId);
      await adSet.update([], updateData);

      logger.info('Ad set updated successfully', { adSetId: params.adSetId });

      const result = {
        success: true,
        adSetId: params.adSetId,
        updatedFields: Object.keys(updateData),
        message: `Ad set ${params.adSetId} updated successfully`,
      };

      return createMcpSuccessResult(result, 'Ad set updated successfully');
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

      return createMcpSuccessResult(result, 'Ad set deleted successfully');
    });
  }
}
