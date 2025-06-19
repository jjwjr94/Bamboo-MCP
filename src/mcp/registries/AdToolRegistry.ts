import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import { AdStatusSchema, MetaAdResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

/**
 * Ad Tool Registry
 *
 * Handles registration of individual ad-related MCP tools:
 * - get_ads: Retrieve ads for an ad account or ad set
 * - create_ad: Create a new ad linking creative to ad set
 * - update_ad: Update an existing ad
 * - delete_ad: Delete an ad
 */
export class AdToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  /**
   * Register all ad-related MCP tools
   */
  public register(): void {
    logger.info('Registering Ad MCP tools');

    this.registerGetAds();
    this.registerCreateAd();
    this.registerUpdateAd();
    this.registerDeleteAd();

    logger.info('Ad MCP tools registered', { count: 4 });
  }

  private registerGetAds(): void {
    const outputSchema = z.object({
      ads: z
        .array(MetaAdResponseSchema)
        .describe('A list of ads with all available Meta API fields.'),
    });

    this.server.registerTool(
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
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.getAds(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCreateAd(): void {
    const outputSchema = z.object({
      success: z.boolean(),
      adId: z.string(),
      name: z.string(),
      adsetId: z.string(),
      creativeId: z.string(),
      status: z.string(),
      message: z.string(),
    });

    this.server.registerTool(
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
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.createAd(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerUpdateAd(): void {
    const outputSchema = z.object({
      success: z.boolean(),
      adId: z.string(),
      updatedFields: z.array(z.string()),
      message: z.string(),
    });

    this.server.registerTool(
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
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.updateAd(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerDeleteAd(): void {
    const outputSchema = z.object({
      success: z.boolean(),
      adId: z.string(),
      message: z.string(),
    });

    this.server.registerTool(
      'delete_ad',
      {
        title: 'Delete Ad',
        description: 'Permanently deletes an ad. This action cannot be undone.',
        inputSchema: {
          adId: z.string().describe('The ID of the ad to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Must be set to true to confirm permanent deletion of the ad.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.deleteAd(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
