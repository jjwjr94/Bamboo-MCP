import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import {
  CampaignObjectiveSchema,
  CampaignSpecialAdCategoriesSchema,
  CampaignStatusSchema,
  MetaCampaignResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

/**
 * Campaign Tool Registry
 *
 * Handles registration of campaign-related MCP tools:
 * - get_campaigns: Retrieve campaigns for an ad account
 * - create_campaign: Create a new advertising campaign
 * - update_campaign: Update an existing campaign
 * - delete_campaign: Delete a campaign (set status to DELETED)
 */
export class CampaignToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  /**
   * Register all campaign-related MCP tools
   */
  public register(): void {
    logger.info('Registering Campaign MCP tools');

    this.registerGetCampaigns();
    this.registerCreateCampaign();
    this.registerUpdateCampaign();
    this.registerDeleteCampaign();

    logger.info('Campaign MCP tools registered', { count: 4 });
  }

  private registerGetCampaigns(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        campaigns: z
          .array(MetaCampaignResponseSchema)
          .describe('A list of campaigns with all available Meta API fields.'),
      }),
    });

    this.server.registerTool(
      'get_campaigns',
      {
        title: 'Get Campaigns',
        description:
          'Retrieves all campaigns for a specific ad account. If no adAccountId is provided, uses the previously selected account or auto-selects if only one account is available.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.getCampaigns(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCreateCampaign(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        campaignId: z.string(),
        name: z.string(),
        objective: z.string(),
        status: z.string(),
      }),
    });

    this.server.registerTool(
      'create_campaign',
      {
        title: 'Create Campaign',
        description: 'Creates a new advertising campaign.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          name: z.string().describe('The name of the campaign.'),
          objective: CampaignObjectiveSchema.describe('The campaign objective.'),
          status: CampaignStatusSchema.default('PAUSED').describe('The campaign status.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Lifetime budget in cents (e.g., 10000 = $100.00).'),
          specialAdCategories: z
            .array(CampaignSpecialAdCategoriesSchema)
            .default(['NONE'])
            .describe(
              "An array of special ad categories for the campaign. Required by Meta policy. Defaults to ['NONE'] for standard campaigns. Setting a special category (e.g., 'HOUSING') will restrict targeting options. Valid values: 'CREDIT', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS', 'NONE', 'ONLINE_GAMBLING_AND_GAMING'."
            ),
          specialAdCategoryCountry: z
            .array(z.string().length(2, 'Country codes must be 2-letter ISO format.'))
            .optional()
            .describe(
              "Required for special ad categories. An array of ISO 3166-1 alpha-2 country codes (e.g., ['US']). Must be provided when specialAdCategories is not ['NONE']."
            ),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.createCampaign(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerUpdateCampaign(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        campaignId: z.string(),
        updatedFields: z.array(z.string()),
      }),
    });

    this.server.registerTool(
      'update_campaign',
      {
        title: 'Update Campaign',
        description: 'Updates an existing campaign.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to update.'),
          name: z.string().optional().describe('New name for the campaign.'),
          status: z
            .enum(['ACTIVE', 'PAUSED', 'DELETED'])
            .optional()
            .describe('New status for the campaign.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New lifetime budget in cents (e.g., 10000 = $100.00).'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.updateCampaign(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerDeleteCampaign(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        success: z.boolean(),
      }),
    });

    this.server.registerTool(
      'delete_campaign',
      {
        title: 'Delete Campaign',
        description:
          'Archives a campaign by setting its status to DELETED. The campaign data is preserved but the campaign becomes inactive.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to delete.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.deleteCampaign(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
