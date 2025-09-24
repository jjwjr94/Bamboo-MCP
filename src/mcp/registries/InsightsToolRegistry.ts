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

  // Base schema for common insights parameters (without superRefine to allow extend)
  private static readonly BaseInsightsSchema = z.object({
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
      .describe('Breakdown dimensions for the insights. Available breakdowns: age, gender, country, region, city, device_platform, publisher_platform, placement, impression_device, day, month, week, hour, and many more.'),
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
  });

  // Schema for ad account insights
  public static readonly GetAdAccountInsightsInputSchema = InsightsToolRegistry.BaseInsightsSchema.extend({
    adAccountId: z
      .string()
      .optional()
      .describe("The ID of the ad account (e.g., 'act_12345'). Optional if previously selected."),
    level: z
      .enum(['account', 'campaign', 'adset', 'ad'])
      .optional()
      .describe('The level at which to aggregate insights. If not specified, defaults to account level.'),
  }).superRefine((data, ctx) => {
    // Validate that datePreset and timeRange are mutually exclusive
    if (data.datePreset && data.timeRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You can only use 'datePreset' or 'timeRange', not both.",
        path: ['datePreset'],
      });
    }
  });

  // Schema for campaign insights
  public static readonly GetCampaignInsightsInputSchema = InsightsToolRegistry.BaseInsightsSchema.extend({
    campaignId: z
      .string()
      .optional()
      .describe('The ID of the campaign to get insights for. If not provided, will get insights for all campaigns in the account.'),
    adAccountId: z
      .string()
      .optional()
      .describe("The ID of the ad account (e.g., 'act_12345'). Required if campaignId is not provided."),
  }).superRefine((data, ctx) => {
    // Validate that datePreset and timeRange are mutually exclusive
    if (data.datePreset && data.timeRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You can only use 'datePreset' or 'timeRange', not both.",
        path: ['datePreset'],
      });
    }
    // Validate that either campaignId or adAccountId is provided
    if (!data.campaignId && !data.adAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must provide either campaignId (for specific campaign) or adAccountId (for all campaigns).',
        path: ['campaignId'],
      });
    }
  });

  // Schema for ad set insights
  public static readonly GetAdSetInsightsInputSchema = InsightsToolRegistry.BaseInsightsSchema.extend({
    adSetId: z
      .string()
      .optional()
      .describe('The ID of the ad set to get insights for. If not provided, will get insights for all ad sets in the account/campaign.'),
    campaignId: z
      .string()
      .optional()
      .describe('The ID of the campaign to get ad set insights for. If not provided with adSetId, will get all ad sets in the account.'),
    adAccountId: z
      .string()
      .optional()
      .describe("The ID of the ad account (e.g., 'act_12345'). Required if adSetId and campaignId are not provided."),
  }).superRefine((data, ctx) => {
    // Validate that datePreset and timeRange are mutually exclusive
    if (data.datePreset && data.timeRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You can only use 'datePreset' or 'timeRange', not both.",
        path: ['datePreset'],
      });
    }
    // Validate that at least one identifier is provided
    if (!data.adSetId && !data.campaignId && !data.adAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must provide at least one of: adSetId, campaignId, or adAccountId.',
        path: ['adSetId'],
      });
    }
  });

  // Schema for ad insights
  public static readonly GetAdInsightsInputSchema = InsightsToolRegistry.BaseInsightsSchema.extend({
    adId: z
      .string()
      .optional()
      .describe('The ID of the ad to get insights for. If not provided, will get insights for all ads in the specified scope.'),
    adSetId: z
      .string()
      .optional()
      .describe('The ID of the ad set to get ad insights for. If not provided with adId, will get all ads in the campaign/account.'),
    campaignId: z
      .string()
      .optional()
      .describe('The ID of the campaign to get ad insights for. If not provided with adId/adSetId, will get all ads in the account.'),
    adAccountId: z
      .string()
      .optional()
      .describe("The ID of the ad account (e.g., 'act_12345'). Required if adId, adSetId, and campaignId are not provided."),
  }).superRefine((data, ctx) => {
    // Validate that datePreset and timeRange are mutually exclusive
    if (data.datePreset && data.timeRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You can only use 'datePreset' or 'timeRange', not both.",
        path: ['datePreset'],
      });
    }
    // Validate that at least one identifier is provided
    if (!data.adId && !data.adSetId && !data.campaignId && !data.adAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must provide at least one of: adId, adSetId, campaignId, or adAccountId.',
        path: ['adId'],
      });
    }
  });

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAdAccountInsights.bind(this),
      this.registerGetCampaignInsights.bind(this),
      this.registerGetAdSetInsights.bind(this),
      this.registerGetAdInsights.bind(this),
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
        title: 'Get Ad Account Insights Report',
        description:
          'Retrieves performance metrics (insights) for an entire ad account. This tool provides aggregated analytics data across all campaigns, ad sets, and ads in the account with advanced filtering, sorting, breakdowns, and export capabilities. Use the level parameter to get campaign, ad set, or ad-level data aggregated at the account level.',
        inputSchema: InsightsToolRegistry.GetAdAccountInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdAccountInsights(authPayload, params),
      'Successfully retrieved ad account insights report.'
    );
  }

  private registerGetCampaignInsights(): string {
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
        campaignId: z.string().optional().describe('The campaign ID for this insights data (if specific campaign).'),
      }).describe('Summary information about the insights data.'),
      exportData: z.string().optional().describe('Exported data in the requested format (CSV/Excel). Only present when exportFormat is specified.'),
    });

    return createMcpTool(
      this.server,
      'get_campaign_insights',
      {
        title: 'Get Campaign Insights Report',
        description:
          'Retrieves performance metrics (insights) for campaigns. Provide a specific campaignId to get insights for one campaign, or provide adAccountId to get insights for all campaigns in the account. Supports advanced filtering, sorting, breakdowns, and export capabilities.',
        inputSchema: InsightsToolRegistry.GetCampaignInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getCampaignInsights(authPayload, params),
      'Successfully retrieved campaign insights report.'
    );
  }

  private registerGetAdSetInsights(): string {
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
        adSetId: z.string().optional().describe('The ad set ID for this insights data (if specific ad set).'),
        campaignId: z.string().optional().describe('The campaign ID for this insights data (if specific campaign).'),
      }).describe('Summary information about the insights data.'),
      exportData: z.string().optional().describe('Exported data in the requested format (CSV/Excel). Only present when exportFormat is specified.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_set_insights',
      {
        title: 'Get Ad Set Insights Report',
        description:
          'Retrieves performance metrics (insights) for ad sets. Provide a specific adSetId to get insights for one ad set, campaignId to get insights for all ad sets in a campaign, or adAccountId to get insights for all ad sets in the account. Supports advanced filtering, sorting, breakdowns, and export capabilities.',
        inputSchema: InsightsToolRegistry.GetAdSetInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdSetInsights(authPayload, params),
      'Successfully retrieved ad set insights report.'
    );
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
        adId: z.string().optional().describe('The ad ID for this insights data (if specific ad).'),
        adSetId: z.string().optional().describe('The ad set ID for this insights data (if specific ad set).'),
        campaignId: z.string().optional().describe('The campaign ID for this insights data (if specific campaign).'),
      }).describe('Summary information about the insights data.'),
      exportData: z.string().optional().describe('Exported data in the requested format (CSV/Excel). Only present when exportFormat is specified.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_insights',
      {
        title: 'Get Ad Insights Report',
        description:
          'Retrieves performance metrics (insights) for individual ads. Provide a specific adId to get insights for one ad, adSetId to get insights for all ads in an ad set, campaignId to get insights for all ads in a campaign, or adAccountId to get insights for all ads in the account. Supports advanced filtering, sorting, breakdowns, and export capabilities.',
        inputSchema: InsightsToolRegistry.GetAdInsightsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdInsights(authPayload, params),
      'Successfully retrieved ad insights report.'
    );
  }
}

// Export types for use in other modules
export type GetAdAccountInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdAccountInsightsInputSchema>;
export type GetCampaignInsightsInput = z.infer<typeof InsightsToolRegistry.GetCampaignInsightsInputSchema>;
export type GetAdSetInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdSetInsightsInputSchema>;
export type GetAdInsightsInput = z.infer<typeof InsightsToolRegistry.GetAdInsightsInputSchema>;
