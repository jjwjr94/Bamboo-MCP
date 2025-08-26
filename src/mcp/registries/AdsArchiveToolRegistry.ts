import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MetaAdsArchiveResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

export class AdsArchiveToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

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
      .describe(
        'Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'
      ),
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
      .describe(
        'Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'
      ),
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
      .describe(
        'Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'
      ),
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
      .describe(
        'Countries where ads were delivered (two-letter ISO codes, e.g., ["US", "GB"]). Defaults to ["US"] if omitted.'
      ),
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
    return 'Ads Archive';
  }

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerSearchAdsArchive(): string {
    const successDataSchema = z.object({
      ads: z.array(MetaAdsArchiveResponseSchema).describe('A list of ads from Meta Ad Library.'),
    });

    return createMcpTool(
      this.server,
      'search_ads_archive',
      {
        title: 'Search Ads Archive',
        description:
          'Searches Meta Ad Library for active and inactive ads to research competitors, trends, and best practices.',
        inputSchema: AdsArchiveToolRegistry.SearchAdsArchiveInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchAdsArchive(authPayload, params),
      'Successfully searched ads archive.'
    );
  }

  private registerGetPoliticalAds(): string {
    const successDataSchema = z.object({
      ads: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('A list of political ads from Meta Ad Library.'),
    });

    return createMcpTool(
      this.server,
      'get_political_ads',
      {
        title: 'Get Political Ads',
        description:
          'Retrieves political ads from the Meta Ad Library with enhanced transparency data.',
        inputSchema: AdsArchiveToolRegistry.GetPoliticalAdsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getPoliticalAds(authPayload, params),
      'Successfully retrieved political ads.'
    );
  }

  private registerGetPageArchiveAds(): string {
    const successDataSchema = z.object({
      ads: z.array(MetaAdsArchiveResponseSchema).describe('A list of ads from a specific page.'),
    });

    return createMcpTool(
      this.server,
      'get_page_archive_ads',
      {
        title: 'Get Page Archive Ads',
        description: 'Retrieves all ads from a specific Facebook Page via the Ad Library.',
        inputSchema: AdsArchiveToolRegistry.GetPageArchiveAdsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getPageArchiveAds(authPayload, params),
      'Successfully retrieved page archive ads.'
    );
  }

  private registerGetAdsArchiveInsights(): string {
    const successDataSchema = z.object({
      insights: z
        .array(MetaAdsArchiveResponseSchema)
        .describe('Aggregated insights data from Ad Library.'),
    });

    return createMcpTool(
      this.server,
      'get_ads_archive_insights',
      {
        title: 'Get Ads Archive Insights',
        description:
          'Retrieves aggregated insights about ad spending and delivery from the Meta Ad Library.',
        inputSchema: AdsArchiveToolRegistry.GetAdsArchiveInsightsInputSchema,
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
