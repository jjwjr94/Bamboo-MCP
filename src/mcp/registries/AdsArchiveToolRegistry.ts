import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MetaAdsArchiveResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

export class AdsArchiveToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  // Input schema for general ads archive search
  public static readonly SearchAdsArchiveInputSchema = z.object({
    searchTerms: z.string().optional().describe('Keywords to search for in ad content.'),
    searchPageIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Facebook Page IDs to filter ads by (maximum 10 pages).'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where ads were published.'),
    adReachedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/, 'Must be a two-letter ISO country code'))
      .min(1, 'At least one country must be specified')
      .max(50, 'Maximum 50 countries allowed')
      .default(['US'])
      .describe('Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .optional()
      .describe('Maximum number of results to return (default: 250).'),
  });

  // Input schema for political ads search
  public static readonly GetPoliticalAdsInputSchema = z.object({
    searchTerms: z.string().optional().describe('Keywords to search for in ad content.'),
    searchPageIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Facebook Page IDs to filter ads by (maximum 10 pages).'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where ads were published.'),
    adReachedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/, 'Must be a two-letter ISO country code'))
      .min(1, 'At least one country must be specified')
      .max(50, 'Maximum 50 countries allowed')
      .default(['US'])
      .describe('Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .optional()
      .describe('Maximum number of results to return (default: 250).'),
  });

  // Input schema for page-specific ads search
  public static readonly GetPageArchiveAdsInputSchema = z.object({
    pageIds: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe('Facebook Page IDs to search ads for (1-10 pages required).'),
    searchTerms: z
      .string()
      .optional()
      .describe('Keywords to search for in ad content from specified pages.'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where ads from these pages were published.'),
    adReachedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/, 'Must be a two-letter ISO country code'))
      .min(1, 'At least one country must be specified')
      .max(50, 'Maximum 50 countries allowed')
      .default(['US'])
      .describe('Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .optional()
      .describe('Maximum number of results to return (default: 250).'),
  });

  // Input schema for enhanced insights search
  public static readonly GetAdsArchiveInsightsInputSchema = z.object({
    searchTerms: z.string().optional().describe('Keywords to search for in ad content.'),
    searchPageIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Facebook Page IDs to filter ads by (maximum 10 pages).'),
    adType: z
      .enum(['ALL', 'POLITICAL_AND_ISSUE_ADS'])
      .optional()
      .describe('Type of ads to search for (default: ALL).'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where ads were published.'),
    adReachedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/, 'Must be a two-letter ISO country code'))
      .min(1, 'At least one country must be specified')
      .max(50, 'Maximum 50 countries allowed')
      .default(['US'])
      .describe('Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'),
    includeRegionalData: z
      .boolean()
      .optional()
      .describe('Include regional distribution data for ads (default: false).'),
    includeDemographicData: z
      .boolean()
      .optional()
      .describe('Include demographic distribution data for ads (default: false).'),
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .optional()
      .describe('Maximum number of results to return (default: 250).'),
  });

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerSearchAdsArchive.bind(this),
      this.registerGetPoliticalAds.bind(this),
      this.registerGetPageArchiveAds.bind(this),
      this.registerGetAdsArchiveInsights.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'AdsArchive';
  }

  /**
   * Register all ads archive-related MCP tools
   */
  public register(): void {
    logger.info('Registering Ads Archive MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Ads Archive MCP tools registered', { count: this.getToolCount() });
  }

  private registerSearchAdsArchive(): void {
    const successDataSchema = z.object({
      ads: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('A list of archived ads matching the search criteria.'),
    });

    createMcpTool(
      this.server,
      'search_ads_archive',
      {
        title: 'Search Ads Archive',
        description:
          'Search the Meta Ads Archive (Ad Library) for public archived ads. Useful for competitive intelligence, research, and transparency reporting. Returns general archived ads from Facebook and Instagram.',
        inputSchema: AdsArchiveToolRegistry.SearchAdsArchiveInputSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchAdsArchive(authPayload, params),
      'Successfully retrieved archived ads.'
    );
  }

  private registerGetPoliticalAds(): void {
    const successDataSchema = z.object({
      political_ads: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('A list of political and social issue ads with transparency data.'),
    });

    createMcpTool(
      this.server,
      'get_political_ads',
      {
        title: 'Get Political & Issue Ads',
        description:
          'Search for political and social issue ads in the Meta Ads Archive. Returns ads with enhanced transparency data including funding entities, demographic targeting, and regional distribution. Essential for political advertising compliance and research.',
        inputSchema: AdsArchiveToolRegistry.GetPoliticalAdsInputSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getPoliticalAds(authPayload, params),
      'Successfully retrieved political and issue ads.'
    );
  }

  private registerGetPageArchiveAds(): void {
    const successDataSchema = z.object({
      page_ads: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('A list of archived ads from specified Facebook pages.'),
    });

    createMcpTool(
      this.server,
      'get_page_archive_ads',
      {
        title: 'Get Page Archive Ads',
        description:
          'Search archived ads from specific Facebook pages. Returns ads published by the specified pages along with engagement metrics and historical data. Useful for competitive analysis and brand monitoring.',
        inputSchema: AdsArchiveToolRegistry.GetPageArchiveAdsInputSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getPageArchiveAds(authPayload, params),
      'Successfully retrieved page archive ads.'
    );
  }

  private registerGetAdsArchiveInsights(): void {
    const successDataSchema = z.object({
      ads_insights: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('Enhanced archived ads data with demographic and regional insights.'),
    });

    createMcpTool(
      this.server,
      'get_ads_archive_insights',
      {
        title: 'Get Ads Archive Insights',
        description:
          'Advanced search for archived ads with enhanced demographic and regional data. Returns detailed insights including age and gender targeting, regional distribution, and estimated spend ranges for transparency reporting.',
        inputSchema: AdsArchiveToolRegistry.GetAdsArchiveInsightsInputSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdsArchiveInsights(authPayload, params),
      'Successfully retrieved ads archive insights.'
    );
  }
}

// Export input types for use in handler
export type SearchAdsArchiveInput = z.infer<
  typeof AdsArchiveToolRegistry.SearchAdsArchiveInputSchema
>;
export type GetPoliticalAdsInput = z.infer<
  typeof AdsArchiveToolRegistry.GetPoliticalAdsInputSchema
>;
export type GetPageArchiveAdsInput = z.infer<
  typeof AdsArchiveToolRegistry.GetPageArchiveAdsInputSchema
>;
export type GetAdsArchiveInsightsInput = z.infer<
  typeof AdsArchiveToolRegistry.GetAdsArchiveInsightsInputSchema
>;
