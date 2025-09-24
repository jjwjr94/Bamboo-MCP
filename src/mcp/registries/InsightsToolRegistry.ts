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

// Comprehensive list of all available insight metrics from Meta Ads API
const VALID_METRICS: [InsightMetric, ...InsightMetric[]] = [
  'actions',
  'clicks',
  'conversions',
  'cost_per_conversion',
  'cost_per_inline_link_click',
  'cost_per_unique_click',
  'cpc',
  'cpm',
  'ctr',
  'frequency',
  'impressions',
  'inline_link_clicks',
  'outbound_clicks',
  'reach',
  'spend',
  'unique_clicks',
  'unique_ctr',
  'video_30_sec_watched_actions',
  'video_p100_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_thruplay_watched_actions',
];

// Default metrics for quick performance overview
const DEFAULT_METRICS: InsightMetric[] = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'reach', 'frequency'];

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
        .describe('List of metrics to retrieve. Available metrics: spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, conversions, cost_per_conversion, actions, inline_link_clicks, outbound_clicks, unique_clicks, unique_ctr, video_30_sec_watched_actions, video_p100_watched_actions, video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions, video_thruplay_watched_actions, cost_per_inline_link_click, cost_per_unique_click.'),
      breakdowns: z
        .array(AdsInsightsBreakdownsSchema)
        .optional()
        .describe('Breakdown dimensions for the insights. Available breakdowns: age, gender, country, region, city, device_platform, publisher_platform, placement, impression_device, hour, day, week, month, and many more.'),
      level: z
        .enum(['account', 'campaign', 'adset', 'ad'])
        .optional()
        .describe('The level at which to aggregate insights. If not specified, will be determined by the object type (ad, adset, or campaign).'),
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe('Maximum number of results to return (default: 250).'),
      sort: z
        .string()
        .optional()
        .describe('Sort results by a specific metric. Use format: "metric_name_ascending" or "metric_name_descending" (e.g., "spend_descending", "ctr_ascending").'),
      filtering: z
        .array(z.object({
          field: z.string().describe('The field to filter on (e.g., "ad.effective_status", "campaign.status").'),
          operator: z.enum(['IN', 'NOT_IN', 'EQUAL', 'NOT_EQUAL', 'GREATER_THAN', 'LESS_THAN']).describe('The comparison operator.'),
          value: z.union([z.string(), z.array(z.string())]).describe('The value(s) to filter by.')
        }))
        .optional()
        .describe('Filter results based on specific criteria.'),
      exportFormat: z
        .enum(['json', 'csv', 'excel'])
        .optional()
        .describe('Export format for the insights data. If not specified, returns JSON format.'),
    })
    .superRefine((data, ctx) => {
      // Validate that at least one target is specified, but only for non-account levels
      if (data.level !== 'account' && !data.campaignId && !data.adSetId && !data.adId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'You must provide at least one of campaignId, adSetId, or adId for non-account level insights.',
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
        .describe('List of metrics to retrieve. Available metrics: spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, conversions, cost_per_conversion, actions, inline_link_clicks, outbound_clicks, unique_clicks, unique_ctr, video_30_sec_watched_actions, video_p100_watched_actions, video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions, video_thruplay_watched_actions, cost_per_inline_link_click, cost_per_unique_click.'),
      breakdowns: z
        .array(AdsInsightsBreakdownsSchema)
        .optional()
        .describe('Breakdown dimensions for the insights. Available breakdowns: age, gender, country, region, city, device_platform, publisher_platform, placement, impression_device, hour, day, week, month, and many more.'),
      level: z
        .enum(['account', 'campaign', 'adset', 'ad'])
        .optional()
        .describe('The level at which to aggregate insights. If not specified, defaults to account level.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe('Maximum number of results to return (default: 250).'),
      sort: z
        .string()
        .optional()
        .describe('Sort results by a specific metric. Use format: "metric_name_ascending" or "metric_name_descending" (e.g., "spend_descending", "ctr_ascending").'),
      filtering: z
        .array(z.object({
          field: z.string().describe('The field to filter on (e.g., "ad.effective_status", "campaign.status").'),
          operator: z.enum(['IN', 'NOT_IN', 'EQUAL', 'NOT_EQUAL', 'GREATER_THAN', 'LESS_THAN']).describe('The comparison operator.'),
          value: z.union([z.string(), z.array(z.string())]).describe('The value(s) to filter by.')
        }))
        .optional()
        .describe('Filter results based on specific criteria.'),
      exportFormat: z
        .enum(['json', 'csv', 'excel'])
        .optional()
        .describe('Export format for the insights data. If not specified, returns JSON format.'),
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
      summary: z.object({
        totalRecords: z.number().describe('Total number of insight records returned.'),
        dateRange: z.object({
          start: z.string().optional().describe('Start date of the insights data.'),
          end: z.string().optional().describe('End date of the insights data.'),
        }).optional().describe('Date range of the insights data.'),
        metrics: z.array(z.string()).describe('List of metrics included in the response.'),
        breakdowns: z.array(z.string()).optional().describe('List of breakdown dimensions applied.'),
      }).describe('Summary information about the insights data.'),
      exportData: z.string().optional().describe('Exported data in the requested format (CSV/Excel). Only present when exportFormat is specified.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_insights',
      {
        title: 'Get Comprehensive Ad Insights Report',
        description:
          'Retrieves comprehensive performance metrics (insights) for campaigns, ad sets, ads, or account-level data. This enhanced tool provides detailed analytics data with advanced filtering, sorting, breakdowns, and export capabilities. Supports all Meta Ads API insights features including custom date ranges, multiple metrics, demographic/placement breakdowns, and data export in various formats. For account-level insights, set level to "account" and no specific IDs are required.',
        inputSchema: InsightsToolRegistry.GetAdInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdInsights(authPayload, params),
      'Successfully retrieved comprehensive ad insights report.'
    );
  }

  private registerGetAdAccountInsights(): string {
    const successDataSchema = z.object({
      insights: z.array(MetaAdsInsightsResponseSchema).describe('A list of insight data records.'),
      summary: z.object({
        totalRecords: z.number().describe('Total number of insight records returned.'),
        dateRange: z.object({
          start: z.string().optional().describe('Start date of the insights data.'),
          end: z.string().optional().describe('End date of the insights data.'),
        }).optional().describe('Date range of the insights data.'),
        metrics: z.array(z.string()).describe('List of metrics included in the response.'),
        breakdowns: z.array(z.string()).optional().describe('List of breakdown dimensions applied.'),
        accountId: z.string().describe('The ad account ID for this insights data.'),
      }).describe('Summary information about the insights data.'),
      exportData: z.string().optional().describe('Exported data in the requested format (CSV/Excel). Only present when exportFormat is specified.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_account_insights',
      {
        title: 'Get Comprehensive Ad Account Insights Report',
        description:
          'Retrieves comprehensive performance metrics (insights) for an entire ad account. This enhanced tool provides aggregated analytics data across all campaigns, ad sets, and ads in the account with advanced filtering, sorting, breakdowns, and export capabilities. Supports all Meta Ads API insights features including custom date ranges, multiple metrics, demographic/placement breakdowns, and data export in various formats.',
        inputSchema: InsightsToolRegistry.GetAdAccountInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdAccountInsights(authPayload, params),
      'Successfully retrieved comprehensive ad account insights report.'
    );
  }
}

// Export the inferred types for use in handlers
export type GetAdInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdInsightsInputSchema>;
export type GetAdAccountInsightsInput = z.infer<
  typeof InsightsToolRegistry.GetAdAccountInsightsInputSchema
>;
