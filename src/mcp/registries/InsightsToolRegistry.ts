import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdsInsightsBreakdownsSchema,
  MetaAdsInsightsResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { InsightMetric } from '../../types/meta.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

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

const DEFAULT_METRICS: InsightMetric[] = ['spend', 'impressions', 'clicks', 'ctr', 'cpc'];

export class InsightsToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

  // Static schema definitions remain here
  public static readonly GetAdInsightsInputSchema = z
    .object({
      adId: z.string().optional().describe('The ID of the ad to get insights for.'),
      adSetId: z.string().optional().describe('The ID of the ad set to get insights for.'),
      campaignId: z.string().optional().describe('The ID of the campaign to get insights for.'),
      datePreset: z
        .enum([
          'today',
          'yesterday',
          'this_month',
          'last_month',
          'this_quarter',
          'maximum',
          'data_maximum',
          'last_3d',
          'last_7d',
          'last_14d',
          'last_28d',
          'last_30d',
          'last_90d',
          'last_week_mon_sun',
          'last_week_sun_sat',
          'last_quarter',
          'last_year',
          'this_week_mon_today',
          'this_week_sun_today',
          'this_year',
        ])
        .optional()
        .describe('A predefined date range for the insights.'),
      timeRange: z
        .object({
          since: z.string().describe('Start date in YYYY-MM-DD format.'),
          until: z.string().describe('End date in YYYY-MM-DD format.'),
        })
        .optional()
        .describe('Custom date range for the insights.'),
      metrics: z
        .array(z.enum(VALID_METRICS))
        .default(DEFAULT_METRICS)
        .describe('List of metrics to retrieve.'),
      breakdowns: z
        .array(AdsInsightsBreakdownsSchema)
        .optional()
        .describe('Breakdown dimensions for the insights.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe('Maximum number of results to return (default: 250).'),
    })
    .superRefine((data, ctx) => {
      // Validate that at least one target is specified
      if (!data.campaignId && !data.adSetId && !data.adId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'You must provide at least one of campaignId, adSetId, or adId.',
          path: ['campaignId'],
        });
      }

      // Validate that datePreset and timeRange are mutually exclusive
      if (data.datePreset && data.timeRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "You can only use 'datePreset' or 'timeRange', not both.",
          path: ['datePreset'],
        });
      }
    });

  public static readonly GetAdAccountInsightsInputSchema = z
    .object({
      adAccountId: z
        .string()
        .optional()
        .describe("The ID of the ad account (e.g., 'act_12345'). Optional if previously selected."),
      datePreset: z
        .enum([
          'today',
          'yesterday',
          'this_month',
          'last_month',
          'this_quarter',
          'maximum',
          'data_maximum',
          'last_3d',
          'last_7d',
          'last_14d',
          'last_28d',
          'last_30d',
          'last_90d',
          'last_week_mon_sun',
          'last_week_sun_sat',
          'last_quarter',
          'last_year',
          'this_week_mon_today',
          'this_week_sun_today',
          'this_year',
        ])
        .optional()
        .describe('A predefined date range for the insights.'),
      timeRange: z
        .object({
          since: z.string().describe('Start date in YYYY-MM-DD format.'),
          until: z.string().describe('End date in YYYY-MM-DD format.'),
        })
        .optional()
        .describe('Custom date range for the insights.'),
      metrics: z
        .array(z.enum(VALID_METRICS))
        .default(DEFAULT_METRICS)
        .describe('List of metrics to retrieve.'),
      breakdowns: z
        .array(AdsInsightsBreakdownsSchema)
        .optional()
        .describe('Breakdown dimensions for the insights.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe('Maximum number of results to return (default: 250).'),
    })
    .superRefine((data, ctx) => {
      // Validate that datePreset and timeRange are mutually exclusive
      if (data.datePreset && data.timeRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "You can only use 'datePreset' or 'timeRange', not both.",
          path: ['datePreset'],
        });
      }
    });

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAdInsights.bind(this),
      this.registerGetAdAccountInsights.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Insights';
  }

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetAdInsights(): string {
    const successDataSchema = z.object({
      insights: z.array(MetaAdsInsightsResponseSchema).describe('A list of insight data records.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_insights',
      {
        title: 'Get Ad Insights',
        description:
          'Retrieves performance metrics (insights) for a specific campaign, ad set, or ad. Provides detailed analytics data including spend, impressions, clicks, conversions, and more.',
        inputSchema: InsightsToolRegistry.GetAdInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdInsights(authPayload, params),
      'Successfully retrieved ad insights.'
    );
  }

  private registerGetAdAccountInsights(): string {
    const successDataSchema = z.object({
      insights: z.array(MetaAdsInsightsResponseSchema).describe('A list of insight data records.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_account_insights',
      {
        title: 'Get Ad Account Insights',
        description:
          'Retrieves performance metrics (insights) for an entire ad account. Provides aggregated analytics data across all campaigns, ad sets, and ads in the account.',
        inputSchema: InsightsToolRegistry.GetAdAccountInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdAccountInsights(authPayload, params),
      'Successfully retrieved ad account insights.'
    );
  }
}

// Export the inferred types for use in handlers
export type GetAdInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdInsightsInputSchema>;
export type GetAdAccountInsightsInput = z.infer<
  typeof InsightsToolRegistry.GetAdAccountInsightsInputSchema
>;
