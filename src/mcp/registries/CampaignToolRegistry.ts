import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CampaignObjectiveSchema,
  CampaignSpecialAdCategoriesSchema,
  CampaignStatusSchema,
  MetaCampaignResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

/**
 * Campaign Tool Registry
 *
 * Handles registration of campaign-related MCP tools:
 * - get_campaigns: Retrieve campaigns for an ad account
 * - create_campaign: Create a new advertising campaign
 * - update_campaign: Update an existing campaign
 * - delete_campaign: Delete a campaign (set status to DELETED)
 */
export class CampaignToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetCampaigns.bind(this),
      this.registerCreateCampaign.bind(this),
      this.registerUpdateCampaign.bind(this),
      this.registerDeleteCampaign.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Campaign';
  }

  /**
   * Register all campaign-related MCP tools
   */
  public register(): void {
    logger.info('Registering Campaign MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Campaign MCP tools registered', { count: this.getToolCount() });
  }

  private registerGetCampaigns(): void {
    const successDataSchema = z.object({
      campaigns: z
        .array(MetaCampaignResponseSchema)
        .describe('A list of campaigns with all available Meta API fields.'),
    });

    createMcpTool(
      this.server,
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
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getCampaigns(authPayload, params),
      'Successfully retrieved campaigns.'
    );
  }

  private registerCreateCampaign(): void {
    const successDataSchema = z.object({
      campaignId: z.string(),
      name: z.string(),
      objective: z.string(),
      status: z.string(),
    });

    createMcpTool(
      this.server,
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
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createCampaign(authPayload, params),
      'Successfully created campaign.'
    );
  }

  private registerUpdateCampaign(): void {
    const successDataSchema = z.object({
      campaignId: z.string(),
      updatedFields: z.array(z.string()),
    });

    createMcpTool(
      this.server,
      'update_campaign',
      {
        title: 'Update Campaign',
        description: 'Updates an existing campaign.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to update.'),
          name: z.string().optional().describe('New name for the campaign.'),
          status: CampaignStatusSchema.optional().describe('New status for the campaign.'),
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
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateCampaign(authPayload, params),
      'Successfully updated campaign.'
    );
  }

  private registerDeleteCampaign(): void {
    const successDataSchema = z.object({
      campaignId: z.string(),
    });

    createMcpTool(
      this.server,
      'delete_campaign',
      {
        title: 'Delete Campaign',
        description:
          'Permanently deletes a campaign by setting its status to DELETED. This action cannot be undone.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Confirmation that you want to permanently delete this campaign.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteCampaign(authPayload, params),
      'Successfully deleted campaign.'
    );
  }
}
