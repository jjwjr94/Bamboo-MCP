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
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
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
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Use metrics from the typed input, which has a default from the registry schema
        const insightsFields = params.metrics;

        // Prepare insights parameters
        const insightsParams: Record<string, unknown> = {
          fields: insightsFields,
          time_range: params.timeRange,
          date_preset: params.datePreset || 'last_30d',
          level: params.level || 'ad', // Use provided level or default to 'ad'
          breakdowns: params.breakdowns,
          limit: params.limit || 25,
          sort: params.sort,
          filtering: params.filtering,
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
        } else if (params.level === 'account') {
          // Handle account-level insights - use provided adAccountId
          // This bypasses database access which is causing ECONNREFUSED errors
          const adAccountId = params.adAccountId;
          if (!adAccountId) {
            throw new ValidationError(
              'adAccountId is required for account-level insights. Please provide the Meta Ads account ID (format: act_XXXXXXXXX).'
            );
          }
          const apiObject = new MetaAdAccountSDK(
            adAccountId,
            {},
            null,
            api
          ) as unknown as InsightsGetter;
          insightsCursor = await apiObject.getInsights([], insightsParams);
        } else {
          // This case should not occur due to validation in the registry, but handle gracefully
          throw new ValidationError(
            'At least one of adId, adSetId, or campaignId must be provided for non-account level insights.'
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

        // Create enhanced response with summary and export capabilities
        const response = {
          insights: validatedInsights,
          summary: {
            totalRecords: validatedInsights.length,
            dateRange: validatedInsights.length > 0 ? {
              start: validatedInsights[0].date_start as string | undefined,
              end: validatedInsights[0].date_stop as string | undefined,
            } : undefined,
            metrics: insightsFields,
            breakdowns: params.breakdowns,
          },
          exportData: params.exportFormat ? this.formatExportData(validatedInsights, params.exportFormat) : undefined,
        };

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
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required for get_ad_account_insights. Please provide the Meta Ads account ID (format: act_XXXXXXXXX)');
        }

        // Use metrics from the typed input, which has a default from the registry schema
        const insightsFields = params.metrics;

        // Prepare insights parameters
        const insightsParams: Record<string, unknown> = {
          fields: insightsFields,
          time_range: params.timeRange,
          date_preset: params.datePreset || 'last_30d',
          level: params.level || 'account',
          breakdowns: params.breakdowns,
          limit: params.limit || 25,
          sort: params.sort,
          filtering: params.filtering,
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

        // Create enhanced response with summary and export capabilities
        const response = {
          insights: validatedInsights,
          summary: {
            totalRecords: validatedInsights.length,
            dateRange: validatedInsights.length > 0 ? {
              start: validatedInsights[0].date_start as string | undefined,
              end: validatedInsights[0].date_stop as string | undefined,
            } : undefined,
            metrics: insightsFields,
            breakdowns: params.breakdowns,
            accountId: adAccountId,
          },
          exportData: params.exportFormat ? this.formatExportData(validatedInsights, params.exportFormat) : undefined,
        };

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

  /**
   * Formats insights data for export in various formats
   */
  private formatExportData(insights: z.infer<typeof MetaAdsInsightsResponseSchema>[], format: 'csv' | 'excel' | 'json'): string {
    if (format === 'json') {
      return JSON.stringify(insights, null, 2);
    }

    if (format === 'csv') {
      if (insights.length === 0) return '';
      
      // Get all unique keys from all insights records
      const allKeys = new Set<string>();
      insights.forEach(insight => {
        Object.keys(insight).forEach(key => allKeys.add(key));
      });
      
      const headers = Array.from(allKeys);
      const csvRows = [headers.join(',')];
      
      insights.forEach(insight => {
        const values = headers.map(header => {
          const value = insight[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value).replace(/,/g, ';'); // Replace commas to avoid CSV issues
        });
        csvRows.push(values.join(','));
      });
      
      return csvRows.join('\n');
    }

    if (format === 'excel') {
      // For Excel format, we'll return a simplified CSV that can be opened in Excel
      // In a production environment, you might want to use a library like 'xlsx' to create proper Excel files
      return this.formatExportData(insights, 'csv');
    }

    return JSON.stringify(insights, null, 2);
  }
}
