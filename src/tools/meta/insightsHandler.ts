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
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

const MAX_INSIGHTS_TO_FETCH = 10000; // Insights can have many data points, so higher limit

// Since our friendly names match the API field names, no mapping is needed

export class MetaInsightsHandler {
  private async fetchInsights(
    apiObject: MetaAdAccountSDK | MetaCampaignSDK | MetaAdSetSDK | MetaAdSDK,
    params: GetAdInsightsInput | GetAdAccountInsightsInput
  ) {
    // The metrics and breakdowns are already validated by Zod
    const fields = params.metrics;
    const breakdowns = params.breakdowns;

    const apiParams: Record<string, unknown> = {
      level: (params as GetAdInsightsInput).adId
        ? 'ad'
        : (params as GetAdInsightsInput).adSetId
          ? 'adset'
          : (params as GetAdInsightsInput).campaignId
            ? 'campaign'
            : 'account',
      limit: params.limit,
    };

    if (breakdowns && breakdowns.length > 0) {
      apiParams.breakdowns = breakdowns;
    }

    if (params.timeRange) {
      apiParams.time_range = params.timeRange;
    } else {
      apiParams.date_preset = params.datePreset || 'last_30d';
    }

    // Get insights using the SDK
    let insightsCursor = await apiObject.getInsights(fields, apiParams);
    const allRawInsights: unknown[] = [];

    // Handle pagination - fetch all pages with safety limit
    while (insightsCursor && Array.isArray(insightsCursor) && insightsCursor.length > 0) {
      allRawInsights.push(...insightsCursor);

      // Safety limit to prevent excessive data retrieval
      if (allRawInsights.length >= MAX_INSIGHTS_TO_FETCH) {
        logger.warn('Reached maximum insights limit, truncating results', {
          limit: MAX_INSIGHTS_TO_FETCH,
        });
        break;
      }

      // Check if there's more data using the cursor's next method
      if (
        typeof (insightsCursor as any).hasNext === 'function' &&
        (insightsCursor as any).hasNext()
      ) {
        insightsCursor = await (insightsCursor as any).next();
      } else {
        break;
      }
    }

    // If insightsCursor is not an array, treat it as a single page
    if (insightsCursor && !Array.isArray(insightsCursor)) {
      allRawInsights.push(insightsCursor);
    }

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
        // This case is handled by the initial check, but satisfies TypeScript.
        throw new Error('Unreachable code');
      }

      const insights = await this.fetchInsights(apiObject, params);
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

      const insights = await this.fetchInsights(apiObject, params);
      return createMcpSuccessResult(
        { insights },
        `Retrieved ${insights.length} insight records for Ad Account (${adAccountId})`
      );
    });
  }
}
