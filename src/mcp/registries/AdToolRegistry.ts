import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AdStatusSchema, MetaAdResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

/**
 * Ad Tool Registry
 *
 * Handles registration of individual ad-related MCP tools:
 * - get_ads: Retrieve ads for an ad account or ad set
 * - create_ad: Create a new ad linking creative to ad set
 * - update_ad: Update an existing ad
 * - delete_ad: Delete an ad
 */
export class AdToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAds.bind(this),
      this.registerCreateAd.bind(this),
      this.registerUpdateAd.bind(this),
      this.registerDeleteAd.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Ad';
  }

  /**
   * Register all ad-related MCP tools
   */
  public register(): void {
    logger.info('Registering Ad MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Ad MCP tools registered', { count: this.getToolCount() });
  }

  private registerGetAds(): void {
    const successDataSchema = z.object({
      ads: z
        .array(MetaAdResponseSchema)
        .describe('A list of ads with all available Meta API fields.'),
    });

    createMcpTool(
      this.server,
      'get_ads',
      {
        title: 'Get Ads',
        description:
          'Retrieves ads for a specific ad account or ad set. If no adAccountId is provided, uses the previously selected account or auto-selects if only one account is available.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          adSetId: z
            .string()
            .optional()
            .describe(
              'The ID of the ad set to filter ads by. If provided, only ads from this ad set are returned.'
            ),
          campaignId: z
            .string()
            .optional()
            .describe(
              'The ID of the campaign to filter ads by. If provided, only ads from this campaign are returned.'
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAds(authPayload, params),
      'Successfully retrieved ads.'
    );
  }

  private registerCreateAd(): void {
    const successDataSchema = z.object({
      adId: z.string(),
      name: z.string(),
      adsetId: z.string(),
      creativeId: z.string(),
      status: z.string(),
    });

    createMcpTool(
      this.server,
      'create_ad',
      {
        title: 'Create Ad',
        description: 'Creates a new ad by linking an ad creative to an ad set.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          adsetId: z.string().describe('The ID of the ad set to create the ad in.'),
          name: z.string().describe('The name of the ad.'),
          creativeId: z.string().describe('The ID of the ad creative to use for this ad.'),
          status: AdStatusSchema.default('PAUSED').describe('The status of the ad.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAd(authPayload, params),
      'Successfully created ad.'
    );
  }

  private registerUpdateAd(): void {
    const successDataSchema = z.object({
      adId: z.string(),
      updatedFields: z.array(z.string()),
    });

    createMcpTool(
      this.server,
      'update_ad',
      {
        title: 'Update Ad',
        description: 'Updates an existing ad.',
        inputSchema: {
          adId: z.string().describe('The ID of the ad to update.'),
          name: z.string().optional().describe('New name for the ad.'),
          status: AdStatusSchema.optional().describe('New status for the ad.'),
          creativeId: z.string().optional().describe('New creative ID for the ad.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAd(authPayload, params),
      'Successfully updated ad.'
    );
  }

  private registerDeleteAd(): void {
    const successDataSchema = z.object({
      adId: z.string(),
    });

    createMcpTool(
      this.server,
      'delete_ad',
      {
        title: 'Delete Ad',
        description: 'Permanently deletes an ad. This action cannot be undone.',
        inputSchema: {
          adId: z.string().describe('The ID of the ad to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Confirmation that you want to permanently delete this ad.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAd(authPayload, params),
      'Successfully deleted ad.'
    );
  }
}
