import {
  AdAccount as MetaAdAccountSDK,
  Ad as MetaAdSDK,
  AdSet as MetaAdSetSDK,
  Campaign as MetaCampaignSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { MetaAdsInsightsResponseSchema } from '../../generated/schemas.js';
import type {
  GetAdAccountInsightsInput,
  GetAdInsightsInput,
} from '../../mcp/registries/InsightsToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { GetAdAccountInsightsResult, GetAdInsightsResult } from './types.js';

// Define a lightweight interface for SDK objects that support the getInsights call
interface InsightsGetter {
  getInsights(fields: string[], params: Record<string, unknown>): Promise<unknown>;
}

export class MetaInsightsHandler {
  /**
   * Retrieves insights for ads, ad sets, campaigns, or ad accounts.
   * The type of insight depends on which ID parameter is provided.
   */
  async getAdInsights(
    authPayload: JWTPayload,
    params: GetAdInsightsInput
  ): Promise<GetAdInsightsResult> {
    logger.info('Executing get_ad_insights', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        // Use metrics from the typed input, which has a default from the registry schema
        const insightsFields = params.metrics;

        // Prepare insights parameters
        const insightsParams: Record<string, unknown> = {
          fields: insightsFields,
          time_range: params.timeRange,
          date_preset: params.datePreset || 'last_30d',
          level: 'ad', // Fixed level for this method
          breakdowns: params.breakdowns,
        };

        // Remove undefined properties in-place to prevent Meta API errors
        removeUndefinedProperties(insightsParams);

        let insightsCursor: unknown;

        // Determine which object to get insights from based on provided parameters
        if (params.adId) {
          const apiObject = new MetaAdSDK(params.adId, {}, null, api) as unknown as InsightsGetter;
          insightsCursor = await apiObject.getInsights([], insightsParams);
        } else if (params.adSetId) {
          const apiObject = new MetaAdSetSDK(
            params.adSetId,
            {},
            null,
            api
          ) as unknown as InsightsGetter;
          insightsCursor = await apiObject.getInsights([], insightsParams);
        } else if (params.campaignId) {
          const apiObject = new MetaCampaignSDK(
            params.campaignId,
            {},
            null,
            api
          ) as unknown as InsightsGetter;
          insightsCursor = await apiObject.getInsights([], insightsParams);
        } else {
          // This case should not occur due to validation in the registry, but handle gracefully
          throw new ValidationError(
            'At least one of adId, adSetId, or campaignId must be provided.'
          );
        }

        // Use the common pagination utility to handle all edge cases
        const allRawInsights = await fetchAllPaginatedData<unknown>({
          cursor: insightsCursor,
          limit: env.META_MAX_INSIGHTS_TO_FETCH,
          entityName: 'insights',
          userId: authPayload.userId,
          apiContext: params,
        });
        const validatedInsights: z.infer<typeof MetaAdsInsightsResponseSchema>[] = [];
        for (const insight of allRawInsights) {
          const result = MetaAdsInsightsResponseSchema.safeParse(insight);
          if (result.success) {
            validatedInsights.push(result.data);
          } else {
            logger.warn('Invalid insights data received from Meta API, skipping.', {
              error: result.error.format(),
              insight,
              userId: authPayload.userId,
              params,
            });
          }
        }

        const response = { insights: validatedInsights };
        logger.info('Successfully retrieved insights', {
          userId: authPayload.userId,
          count: validatedInsights.length,
          params,
        });

        return response;
      },
      {
        toolName: 'get_ad_insights',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Retrieves account-level insights.
   */
  async getAdAccountInsights(
    authPayload: JWTPayload,
    params: GetAdAccountInsightsInput
  ): Promise<GetAdAccountInsightsResult> {
    logger.info('Executing get_ad_account_insights', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        // Use metrics from the typed input, which has a default from the registry schema
        const insightsFields = params.metrics;

        // Prepare insights parameters
        const insightsParams: Record<string, unknown> = {
          fields: insightsFields,
          time_range: params.timeRange,
          date_preset: params.datePreset || 'last_30d',
          level: 'account',
        };

        // Remove undefined properties in-place to prevent Meta API errors
        removeUndefinedProperties(insightsParams);

        const apiObject = new MetaAdAccountSDK(
          adAccountId,
          {},
          null,
          api
        ) as unknown as InsightsGetter;
        const insightsCursor = await apiObject.getInsights([], insightsParams);

        // Use the common pagination utility to handle all edge cases
        const allRawInsights = await fetchAllPaginatedData<unknown>({
          cursor: insightsCursor,
          limit: env.META_MAX_INSIGHTS_TO_FETCH,
          entityName: 'account insights',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });
        const validatedInsights: z.infer<typeof MetaAdsInsightsResponseSchema>[] = [];
        for (const insight of allRawInsights) {
          const result = MetaAdsInsightsResponseSchema.safeParse(insight);
          if (result.success) {
            validatedInsights.push(result.data);
          } else {
            logger.warn('Invalid account insights data received from Meta API, skipping.', {
              error: result.error.format(),
              insight,
              userId: authPayload.userId,
              adAccountId,
            });
          }
        }

        const response = { insights: validatedInsights };
        logger.info('Successfully retrieved account insights', {
          userId: authPayload.userId,
          adAccountId,
          count: validatedInsights.length,
        });

        return response;
      },
      {
        toolName: 'get_ad_account_insights',
        userId: authPayload.userId,
      }
    );
  }
}
