import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../auth/mcpAuthUtils.js';
import type { MetaToolsHandler } from '../tools/metaToolsHandler.js';
import { logger } from '../utils/logger.js';

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
        outputSchema: {
          campaigns: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                status: z.string(),
                effective_status: z.string(),
                objective: z.string(),
                created_time: z.string().optional(),
                updated_time: z.string().optional(),
                daily_budget: z.string().optional(),
                lifetime_budget: z.string().optional(),
                bid_strategy: z.string().optional(),
                budget_remaining: z.string().optional(),
                spend_cap: z.string().optional(),
                configured_status: z.string().optional(),
                start_time: z.string().optional(),
                stop_time: z.string().optional(),
              })
            )
            .describe('A list of campaigns.'),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.getCampaigns(authPayload, params);
      }
    );
  }

  private registerCreateCampaign(): void {
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
          objective: z
            .enum([
              'OUTCOME_TRAFFIC',
              'OUTCOME_ENGAGEMENT',
              'OUTCOME_LEADS',
              'OUTCOME_SALES',
              'OUTCOME_APP_PROMOTION',
              'OUTCOME_AWARENESS',
            ])
            .describe('The campaign objective.'),
          status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('The campaign status.'),
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
            .array(z.string())
            .optional()
            .describe('Special ad categories if applicable.'),
        },
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          name: z.string(),
          objective: z.string(),
          status: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.createCampaign(authPayload, params);
      }
    );
  }

  private registerUpdateCampaign(): void {
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
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          updatedFields: z.array(z.string()),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.updateCampaign(authPayload, params);
      }
    );
  }

  private registerDeleteCampaign(): void {
    this.server.registerTool(
      'delete_campaign',
      {
        title: 'Delete Campaign',
        description: 'Deletes a campaign (sets status to DELETED).',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to delete.'),
        },
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.deleteCampaign(authPayload, params);
      }
    );
  }
}
