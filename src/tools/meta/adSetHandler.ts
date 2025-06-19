import {
  AdAccount as MetaAdAccountSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaAdSetResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CampaignStatus, CreateAdSetRequest, MetaTargeting } from '../../types/meta.js';
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

      // Treat the response as unknown and validate it
      const rawAdSets = adSetsCursor as unknown;

      // Validate each ad set using the auto-generated schema
      const validatedAdSets: z.infer<typeof MetaAdSetResponseSchema>[] = [];
      if (Array.isArray(rawAdSets)) {
        for (const adSet of rawAdSets) {
          const result = MetaAdSetResponseSchema.safeParse(adSet);
          if (result.success) {
            validatedAdSets.push(result.data);
          } else {
            logger.warn('Skipping invalid ad set data received from Meta API', {
              adSetId: (adSet as { id?: string }).id || 'Unknown ID',
              errors: result.error.errors,
            });
          }
        }
      }

      return createMcpSuccessResult(
        { adSets: validatedAdSets },
        `Retrieved ${validatedAdSets.length} ad sets`
      );
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

      removeUndefinedProperties(adSetData);

      const adSet = await new MetaAdAccountSDK(adAccountId).createAdSet([], adSetData);

      // Treat response as unknown and validate
      const validationResult = MetaCreateSuccessResponseSchema.safeParse(adSet);
      if (!validationResult.success) {
        logger.warn('Invalid createAdSet response from Meta API', {
          response: adSet,
          errors: validationResult.error.errors,
        });
        throw new Error('Failed to create ad set: Invalid response from Meta API.');
      }

      const adSetId = validationResult.data.id;
      logger.info('Ad set created successfully', { adSetId, name: params.name });

      const result = {
        success: true,
        adSetId: adSetId,
        name: params.name,
        campaignId: params.campaignId,
        message: `Ad set "${params.name}" created successfully with ID: ${adSetId}`,
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
      const updateResponse = await adSet.update([], updateData);

      // Treat response as unknown and validate
      const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
      if (!validationResult.success) {
        logger.warn('Invalid updateAdSet response from Meta API', {
          response: updateResponse,
          errors: validationResult.error.errors,
        });
        throw new Error('Failed to update ad set: Invalid response from Meta API.');
      }

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
      const deleteResponse = await adSet.delete([]);

      // Treat response as unknown and validate
      const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
      if (!validationResult.success) {
        logger.warn('Invalid deleteAdSet response from Meta API', {
          response: deleteResponse,
          errors: validationResult.error.errors,
        });
        throw new Error('Failed to delete ad set: Invalid response from Meta API.');
      }

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
