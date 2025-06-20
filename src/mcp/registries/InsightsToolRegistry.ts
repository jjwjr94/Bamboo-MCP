import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import {
  AdsInsightsBreakdownsSchema,
  AdsInsightsDatePresetSchema,
  MetaAdsInsightsResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { InsightMetric } from '../../types/meta.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

const VALID_METRICS: [InsightMetric, ...InsightMetric[]] = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'reach',
  'frequency',
  'conversions',
  'cost_per_conversion',
  'actions',
];

// Use the generated breakdown schema instead of hardcoded values
const VALID_BREAKDOWNS = AdsInsightsBreakdownsSchema.options;

export class InsightsToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  // Define the base schema as a static property for reuse and inference
  private static readonly BaseInsightsInputSchema = z.object({
    metrics: z
      .array(z.enum(VALID_METRICS))
      .min(1)
      .describe('A list of metrics to retrieve (e.g., spend, impressions, clicks).'),
    breakdowns: z
      .array(z.enum(VALID_BREAKDOWNS))
      .optional()
      .describe('How to break down the data (e.g., by age, gender, country).'),
    datePreset: AdsInsightsDatePresetSchema.optional().describe(
      'Predefined date range for the insights (e.g., "last_7d", "last_30d", "this_month").'
    ),
    timeRange: z
      .object({
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.'),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.'),
      })
      .optional()
      .describe("A custom date range. Use this or 'datePreset', but not both."),
    limit: z
      .number()
      .int()
      .positive()
      .max(1000)
      .default(250)
      .optional()
      .describe('Maximum number of results to return (default: 250).'),
  });

  // Define the specific tool schemas by extending the base
  public static readonly GetAdInsightsInputSchema =
    InsightsToolRegistry.BaseInsightsInputSchema.extend({
      campaignId: z.string().optional().describe('The ID of the campaign to get insights for.'),
      adSetId: z.string().optional().describe('The ID of the ad set to get insights for.'),
      adId: z.string().optional().describe('The ID of the ad to get insights for.'),
    });

  public static readonly GetAdAccountInsightsInputSchema =
    InsightsToolRegistry.BaseInsightsInputSchema.extend({
      adAccountId: z
        .string()
        .optional()
        .describe("The ID of the ad account (e.g., 'act_12345'). Optional if previously selected."),
    });

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  public register(): void {
    logger.info('Registering Insights MCP tools');
    this.registerGetAdInsights();
    this.registerGetAdAccountInsights();
    logger.info('Insights MCP tools registered', { count: 2 });
  }

  private registerGetAdInsights(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        insights: z
          .array(MetaAdsInsightsResponseSchema)
          .describe('A list of insight data records.'),
      }),
    });

    this.server.registerTool(
      'get_ad_insights',
      {
        title: 'Get Ad Insights',
        description:
          'Retrieves performance metrics (insights) for a specific campaign, ad set, or ad. Provides detailed analytics data including spend, impressions, clicks, conversions, and more.',
        inputSchema: InsightsToolRegistry.GetAdInsightsInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);

          // Validate that at least one of campaignId, adSetId, or adId is provided
          if (!params.campaignId && !params.adSetId && !params.adId) {
            throw new ValidationError(
              'You must provide at least one of campaignId, adSetId, or adId.'
            );
          }

          // Validate that both datePreset and timeRange are not provided
          if (params.datePreset && params.timeRange) {
            throw new ValidationError("You can only use 'datePreset' or 'timeRange', not both.");
          }

          return await this.toolsHandler.getAdInsights(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetAdAccountInsights(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        insights: z
          .array(MetaAdsInsightsResponseSchema)
          .describe('A list of insight data records.'),
      }),
    });

    this.server.registerTool(
      'get_ad_account_insights',
      {
        title: 'Get Ad Account Insights',
        description:
          'Retrieves performance metrics (insights) for an entire ad account. Provides aggregated analytics data across all campaigns, ad sets, and ads in the account.',
        inputSchema: InsightsToolRegistry.GetAdAccountInsightsInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);

          // Validate that both datePreset and timeRange are not provided
          if (params.datePreset && params.timeRange) {
            throw new ValidationError("You can only use 'datePreset' or 'timeRange', not both.");
          }

          return await this.toolsHandler.getAdAccountInsights(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}

// Export the inferred types for use in handlers
export type GetAdInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdInsightsInputSchema>;
export type GetAdAccountInsightsInput = z.infer<
  typeof InsightsToolRegistry.GetAdAccountInsightsInputSchema
>;
