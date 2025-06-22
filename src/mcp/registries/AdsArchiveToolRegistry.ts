import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import { MetaAdsArchiveResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import type { IToolRegistry } from '../types.js';

export class AdsArchiveToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  // Input schema for general ads archive search
  public static readonly SearchAdsArchiveInputSchema = z.object({
    searchTerms: z.string().optional().describe('Keywords to search for in ad creative content.'),
    searchPageIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Facebook Page IDs to filter ads by (maximum 10 pages).'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where ads were published.'),
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
    searchTerms: z.string().optional().describe('Keywords to search for in political ad content.'),
    searchPageIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Facebook Page IDs to filter political ads by (maximum 10 pages).'),
    publisherPlatforms: z
      .array(z.enum(['FACEBOOK', 'INSTAGRAM', 'MESSENGER', 'AUDIENCE_NETWORK']))
      .optional()
      .describe('Platforms where political ads were published.'),
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
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        ads: z
          .array(MetaAdsArchiveResponseSchema)
          .describe('A list of archived ads matching the search criteria.'),
      }),
    });

    this.server.registerTool(
      'search_ads_archive',
      {
        title: 'Search Ads Archive',
        description:
          'Search the Meta Ads Archive (Ad Library) for public archived ads. Useful for competitive intelligence, research, and transparency reporting. Returns general archived ads from Facebook and Instagram.',
        inputSchema: AdsArchiveToolRegistry.SearchAdsArchiveInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.searchAdsArchive(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetPoliticalAds(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        political_ads: z
          .array(MetaAdsArchiveResponseSchema)
          .describe('A list of political and social issue ads with transparency data.'),
      }),
    });

    this.server.registerTool(
      'get_political_ads',
      {
        title: 'Get Political & Issue Ads',
        description:
          'Search for political and social issue ads in the Meta Ads Archive. Returns ads with enhanced transparency data including funding entities, demographic targeting, and regional distribution. Essential for political advertising compliance and research.',
        inputSchema: AdsArchiveToolRegistry.GetPoliticalAdsInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getPoliticalAds(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetPageArchiveAds(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        page_ads: z
          .array(MetaAdsArchiveResponseSchema)
          .describe('A list of archived ads from the specified Facebook Pages.'),
      }),
    });

    this.server.registerTool(
      'get_page_archive_ads',
      {
        title: 'Get Page Archive Ads',
        description:
          'Retrieve archived ads from specific Facebook Pages. Search up to 10 pages at once to analyze their advertising history, creative strategies, and campaign patterns. Ideal for competitive analysis and brand monitoring.',
        inputSchema: AdsArchiveToolRegistry.GetPageArchiveAdsInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getPageArchiveAds(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetAdsArchiveInsights(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        ads_insights: z
          .array(MetaAdsArchiveResponseSchema)
          .describe('A list of archived ads with enhanced insights and distribution data.'),
      }),
    });

    this.server.registerTool(
      'get_ads_archive_insights',
      {
        title: 'Get Ads Archive Insights',
        description:
          'Advanced ads archive search with optional demographic and regional distribution data. Configure whether to include detailed targeting insights, geographic breakdowns, and enhanced transparency information. Perfect for comprehensive market research and compliance reporting.',
        inputSchema: AdsArchiveToolRegistry.GetAdsArchiveInsightsInputSchema.shape,
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getAdsArchiveInsights(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
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
