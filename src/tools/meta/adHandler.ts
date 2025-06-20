import {
  AdAccount as MetaAdAccountSDK,
  Ad as MetaAdSDK,
  AdSet as MetaAdSetSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaAdResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

export class MetaAdHandler {
  async getAds(
    authPayload: JWTPayload,
    params: { adAccountId?: string; adSetId?: string; campaignId?: string }
  ) {
    logger.info('Executing get_ads', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const fields = [
        MetaAdSDK.Fields.id,
        MetaAdSDK.Fields.name,
        MetaAdSDK.Fields.status,
        MetaAdSDK.Fields.effective_status,
        MetaAdSDK.Fields.configured_status,
        MetaAdSDK.Fields.created_time,
        MetaAdSDK.Fields.updated_time,
        MetaAdSDK.Fields.adset_id,
        MetaAdSDK.Fields.campaign_id,
        MetaAdSDK.Fields.creative,
        MetaAdSDK.Fields.bid_amount,
        MetaAdSDK.Fields.bid_type,
        MetaAdSDK.Fields.tracking_specs,
      ];

      let adsCursor: unknown;
      if (params.adSetId) {
        // Get ads from a specific ad set
        logger.info('Fetching ads for ad set', { adSetId: params.adSetId });
        adsCursor = await new MetaAdSetSDK(params.adSetId).getAds(fields);
      } else if (params.campaignId) {
        // Get ads from a specific campaign
        logger.info('Fetching ads for campaign', { campaignId: params.campaignId });
        adsCursor = await new MetaAdSetSDK(params.campaignId).getAds(fields);
      } else {
        // Get ads from ad account
        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));
        logger.info('Fetching ads for ad account', { adAccountId });

        // Meta API handles business context automatically via ad account
        adsCursor = await new MetaAdAccountSDK(adAccountId).getAds(fields);
      }

      // The Meta SDK cursor is an array-like object for the first page.
      // We'll process the first page and then loop if more pages exist.
      let currentCursor = adsCursor as any; // Cast to any to access pagination methods
      const allRawAds: any[] = [];

      while (currentCursor && currentCursor.length > 0) {
        allRawAds.push(...currentCursor);

        // Safety limit to prevent resource exhaustion
        if (allRawAds.length >= env.META_MAX_ADS_TO_FETCH) {
          logger.warn('Reached maximum ads limit, truncating results', {
            limit: env.META_MAX_ADS_TO_FETCH,
          });
          break;
        }

        if (currentCursor.hasNext()) {
          currentCursor = await currentCursor.next();
        } else {
          break;
        }
      }

      const validatedAds: z.infer<typeof MetaAdResponseSchema>[] = [];
      // Use allRawAds which contains results from all pages
      for (const ad of allRawAds) {
        const result = MetaAdResponseSchema.safeParse(ad);
        if (result.success) {
          validatedAds.push(result.data);
        } else {
          logger.warn('Skipping invalid ad data from Meta API', {
            adId: (ad as { id?: string }).id || 'Unknown ID',
            errors: result.error.format(),
          });
        }
      }

      return createMcpSuccessResult({ ads: validatedAds }, `Retrieved ${validatedAds.length} ads`);
    });
  }

  async createAd(authPayload: JWTPayload, params: CreateAdRequest & { adAccountId?: string }) {
    logger.info('Executing create_ad', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const adData: Record<string, unknown> = {
        [MetaAdSDK.Fields.name]: params.name,
        [MetaAdSDK.Fields.adset_id]: params.adsetId,
        [MetaAdSDK.Fields.creative]: { creative_id: params.creativeId },
        [MetaAdSDK.Fields.status]: params.status,
      };

      // Meta API handles business context automatically via ad account
      removeUndefinedProperties(adData);

      const ad = await new MetaAdAccountSDK(adAccountId).createAd([], adData);

      // Treat response as unknown and validate
      const validationResult = MetaCreateSuccessResponseSchema.safeParse(ad);
      if (!validationResult.success) {
        const errorMessage = 'Failed to create ad: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const adId = validationResult.data.id;
      const result = {
        adId: adId,
        name: params.name,
        adsetId: params.adsetId,
        creativeId: params.creativeId,
        status: params.status,
      };
      return createMcpSuccessResult(
        result,
        `Ad "${params.name}" created successfully with ID: ${adId}`
      );
    });
  }

  async updateAd(
    authPayload: JWTPayload,
    params: {
      adId: string;
      name?: string;
      status?: string;
      creativeId?: string;
    }
  ) {
    logger.info('Executing update_ad', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const updateData: Record<string, unknown> = {
        [MetaAdSDK.Fields.name]: params.name,
        [MetaAdSDK.Fields.status]: params.status,
        [MetaAdSDK.Fields.creative]: params.creativeId
          ? { creative_id: params.creativeId }
          : undefined,
      };

      removeUndefinedProperties(updateData);

      const ad = new MetaAdSDK(params.adId);
      const updateResponse = await ad.update([], updateData);

      // Treat response as unknown and validate
      const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
      if (!validationResult.success) {
        const errorMessage = 'Failed to update ad: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const result = {
        adId: params.adId,
        updatedFields: Object.keys(updateData),
      };
      return createMcpSuccessResult(result, `Ad ${params.adId} updated successfully`);
    });
  }

  async deleteAd(
    authPayload: JWTPayload,
    params: { adId: string; confirmPermanentDelete?: boolean }
  ) {
    logger.info('Executing delete_ad', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      // Safety check: require explicit confirmation for permanent deletion
      if (!params.confirmPermanentDelete) {
        throw new ValidationError(
          'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
        );
      }

      const ad = new MetaAdSDK(params.adId);
      const deleteResponse = await ad.delete([]);

      // Treat response as unknown and validate
      const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
      if (!validationResult.success) {
        const errorMessage = 'Failed to delete ad: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const result = {
        adId: params.adId,
      };
      return createMcpSuccessResult(result, `Ad ${params.adId} deleted successfully`);
    });
  }
}
