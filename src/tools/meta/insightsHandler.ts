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
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

// Since our friendly names match the API field names, no mapping is needed

export class MetaInsightsHandler {
  private async fetchInsights(
    apiObject: MetaAdAccountSDK | MetaCampaignSDK | MetaAdSetSDK | MetaAdSDK,
    params: GetAdInsightsInput | GetAdAccountInsightsInput,
    userId: string
  ) {
    // The metrics and breakdowns are already validated by Zod
    const fields = params.metrics;

    // Build complete API parameters object using build-then-sanitize pattern
    const apiParams: Record<string, unknown> = {
      level: (params as GetAdInsightsInput).adId
        ? 'ad'
        : (params as GetAdInsightsInput).adSetId
          ? 'adset'
          : (params as GetAdInsightsInput).campaignId
            ? 'campaign'
            : 'account',
      limit: params.limit ?? 250,
      breakdowns: params.breakdowns && params.breakdowns.length > 0 ? params.breakdowns : undefined,
      time_range: params.timeRange,
      date_preset: params.timeRange ? undefined : params.datePreset || 'last_30d',
    };

    // Ensure no undefined values are passed to Meta API
    removeUndefinedProperties(apiParams);

    // Get insights using the SDK
    const insightsCursor = await apiObject.getInsights(fields, apiParams);

    // Use the common pagination utility to handle all edge cases
    const allRawInsights = await fetchAllPaginatedData<unknown>({
      cursor: insightsCursor,
      limit: env.META_MAX_INSIGHTS_TO_FETCH,
      entityName: 'insights',
      userId,
    });

    const validatedInsights: z.infer<typeof MetaAdsInsightsResponseSchema>[] = [];
    for (const insight of allRawInsights) {
      const result = MetaAdsInsightsResponseSchema.safeParse(insight);
      if (result.success) {
        validatedInsights.push(result.data);
      } else {
        logger.warn('Skipping invalid insight data from Meta API', {
          errors: result.error.format(),
        });
      }
    }
    return validatedInsights;
  }

  async getAdInsights(authPayload: JWTPayload, params: GetAdInsightsInput) {
    logger.info('Executing get_ad_insights', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const { campaignId, adSetId, adId } = params;

      let apiObject: MetaAdSDK | MetaAdSetSDK | MetaCampaignSDK;
      let objectName = '';
      if (adId) {
        apiObject = new MetaAdSDK(adId);
        objectName = `Ad (${adId})`;
      } else if (adSetId) {
        apiObject = new MetaAdSetSDK(adSetId);
        objectName = `Ad Set (${adSetId})`;
      } else if (campaignId) {
        apiObject = new MetaCampaignSDK(campaignId);
        objectName = `Campaign (${campaignId})`;
      } else {
        // This case is theoretically handled by Zod input validation,
        // but this provides a clear, consistent runtime error.
        throw new ValidationError(
          'Either campaignId, adSetId, or adId must be provided to fetch ad insights.'
        );
      }

      const insights = await this.fetchInsights(apiObject, params, authPayload.userId);
      return createMcpSuccessResult(
        { insights },
        `Retrieved ${insights.length} insight records for ${objectName}`
      );
    });
  }

  async getAdAccountInsights(authPayload: JWTPayload, params: GetAdAccountInsightsInput) {
    logger.info('Executing get_ad_account_insights', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        params.adAccountId
      );
      const apiObject = new MetaAdAccountSDK(adAccountId);

      const insights = await this.fetchInsights(apiObject, params, authPayload.userId);
      return createMcpSuccessResult(
        { insights },
        `Retrieved ${insights.length} insight records for Ad Account (${adAccountId})`
      );
    });
  }
}
