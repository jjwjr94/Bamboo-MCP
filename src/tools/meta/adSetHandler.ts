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
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

export class MetaAdSetHandler {
  async getAdSets(authPayload: JWTPayload, params: { campaignId?: string; adAccountId?: string }) {
    logger.info('Executing get_ad_sets', { userId: authPayload.userId, params });

    return handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      const fields = [
        MetaAdSetSDK.Fields.id,
        MetaAdSetSDK.Fields.name,
        MetaAdSetSDK.Fields.status,
        MetaAdSetSDK.Fields.targeting,
        MetaAdSetSDK.Fields.optimization_goal,
        MetaAdSetSDK.Fields.bid_strategy,
        MetaAdSetSDK.Fields.daily_budget,
        MetaAdSetSDK.Fields.lifetime_budget,
        MetaAdSetSDK.Fields.start_time,
        MetaAdSetSDK.Fields.end_time,
        MetaAdSetSDK.Fields.created_time,
        MetaAdSetSDK.Fields.updated_time,
      ];

      let adSetsCursor: unknown;

      if (params.campaignId) {
        // Get ad sets from a specific campaign
        adSetsCursor = await new MetaCampaignSDK(params.campaignId, {}, null, api).getAdSets(
          fields
        );
      } else {
        // Get ad sets from an ad account
        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );
        adSetsCursor = await new MetaAdAccountSDK(adAccountId, {}, null, api).getAdSets(fields);
      }

      // Use the common pagination utility to handle all edge cases
      const allRawAdSets = await fetchAllPaginatedData<unknown>({
        cursor: adSetsCursor,
        limit: env.META_MAX_ADSETS_TO_FETCH,
        entityName: 'ad sets',
        userId: authPayload.userId,
        apiContext: params,
      });

      // Validate and transform the response using auto-generated schema
      const validatedAdSets: z.infer<typeof MetaAdSetResponseSchema>[] = [];
      for (const adSet of allRawAdSets) {
        const result = MetaAdSetResponseSchema.safeParse(adSet);
        if (result.success) {
          validatedAdSets.push(result.data);
        } else {
          logger.warn('Invalid ad set data received from Meta API, skipping.', {
            error: result.error.format(),
            adSet,
            userId: authPayload.userId,
            params,
          });
        }
      }

      const response = { adSets: validatedAdSets };
      logger.info('Successfully retrieved ad sets', {
        userId: authPayload.userId,
        count: validatedAdSets.length,
        params,
      });

      return await createMcpSuccessResult(response);
    });
  }

  async createAdSet(authPayload: JWTPayload, params: CreateAdSetRequest) {
    logger.info('Executing create_adset', { userId: authPayload.userId, params });

    return await handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        params.adAccountId
      );

      const adSetData: Record<string, unknown> = {
        [MetaAdSetSDK.Fields.name]: params.name,
        [MetaAdSetSDK.Fields.campaign_id]: params.campaignId,
        [MetaAdSetSDK.Fields.status]: params.status || 'PAUSED',
        [MetaAdSetSDK.Fields.optimization_goal]: params.optimizationGoal,
        [MetaAdSetSDK.Fields.billing_event]: params.billingEvent,
        [MetaAdSetSDK.Fields.bid_amount]: params.bidAmount,
        [MetaAdSetSDK.Fields.daily_budget]: params.dailyBudget,
        [MetaAdSetSDK.Fields.lifetime_budget]: params.lifetimeBudget,
        [MetaAdSetSDK.Fields.start_time]: params.startTime,
        [MetaAdSetSDK.Fields.end_time]: params.endTime,
        [MetaAdSetSDK.Fields.targeting]: params.targeting,
        [MetaAdSetSDK.Fields.promoted_object]: params.promotedObject,
        [MetaAdSetSDK.Fields.attribution_spec]: params.attributionSpec,
      };

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

      const result = { adSetId };
      logger.info('Successfully created ad set', {
        userId: authPayload.userId,
        adAccountId,
        adSetId,
        name: params.name,
      });

      return await createMcpSuccessResult(
        result,
        `Successfully created ad set '${params.name}' (ID: ${adSetId}).`
      );
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

    return await handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

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

      const adSet = new MetaAdSetSDK(params.adSetId, {}, null, api);
      const updateResponse = await adSet.update([], updateData);

      // Treat response as unknown and validate
      const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
      if (!validationResult.success) {
        logger.warn('Invalid updateAdSet response from Meta API', {
          response: updateResponse,
          errors: validationResult.error.errors,
        });
        throw new ValidationError(
          'Meta API returned an invalid response after updating the ad set. The operation status is uncertain.'
        );
      }

      logger.info('Ad set updated successfully', { adSetId: params.adSetId });

      const result = {
        adSetId: params.adSetId,
        updatedFields: Object.keys(updateData),
      };

      return await createMcpSuccessResult(result, `Ad set ${params.adSetId} updated successfully`);
    });
  }

  async deleteAdSet(authPayload: JWTPayload, params: { adSetId: string }) {
    logger.info('Executing delete_adset', { userId: authPayload.userId, params });

    return await handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      const adSet = new MetaAdSetSDK(params.adSetId, {}, null, api);
      const deleteResponse = await adSet.delete([]);

      // Treat response as unknown and validate
      const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
      if (!validationResult.success) {
        logger.warn('Invalid deleteAdSet response from Meta API', {
          response: deleteResponse,
          errors: validationResult.error.errors,
        });
        throw new ValidationError(
          'Meta API returned an invalid response after deleting the ad set. The operation status is uncertain.'
        );
      }

      logger.info('Ad set deleted successfully', { adSetId: params.adSetId });

      const result = {
        adSetId: params.adSetId,
      };

      return await createMcpSuccessResult(result, `Ad set ${params.adSetId} deleted successfully`);
    });
  }
}
