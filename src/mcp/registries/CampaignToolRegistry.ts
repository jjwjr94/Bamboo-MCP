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
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// Campaign Budget Schema with internal XOR validation
const CampaignBudgetSchema = z
  .object({
    daily: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Daily budget in cents (e.g., 1000 = $10.00)'),
    lifetime: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Lifetime budget in cents (e.g., 10000 = $100.00)'),
  })
  .refine(
    ({ daily, lifetime }) => !!daily !== !!lifetime, // XOR: exactly one should be defined
    {
      message: 'A campaign must have either a daily or lifetime budget, but not both.',
      path: ['daily'],
    }
  );

// Special Ad Category Schema with business logic validation
const SpecialAdSchema = z
  .object({
    categories: z
      .array(CampaignSpecialAdCategoriesSchema)
      .default(['NONE'])
      .describe(
        "An array of special ad categories for the campaign. Required by Meta policy. Defaults to ['NONE'] for standard campaigns. Setting a special category (e.g., 'HOUSING') will restrict targeting options. Valid values: 'CREDIT', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS', 'NONE', 'ONLINE_GAMBLING_AND_GAMING'."
      ),
    country: z
      .array(z.string().length(2, 'Country codes must be 2-letter ISO format.'))
      .optional()
      .describe(
        "Required for special ad categories. An array of ISO 3166-1 alpha-2 country codes (e.g., ['US']). Must be provided when categories is not ['NONE']."
      ),
  })
  .superRefine((data, ctx) => {
    // Special Ad Category Validation: Ensure country is provided when special categories are used.
    const hasSpecialCategory = data.categories.some((cat) => cat !== 'NONE');
    if (hasSpecialCategory && (!data.country || data.country.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The 'country' parameter is required when 'categories' contains values other than 'NONE'.",
        path: ['country'],
      });
    }
  });

// CreateCampaign schema - single source of truth for campaign creation
export const CreateCampaignSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe(
      "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
    ),
  name: z.string().describe('The name of the campaign.'),
  objective: CampaignObjectiveSchema.describe('The campaign objective.'),
  buying_type: z
    .enum(['AUCTION', 'RESERVED'])
    .default('AUCTION')
    .describe(
      "The buying type for the campaign. Defaults to 'AUCTION'. RESERVED is for guaranteed delivery campaigns."
    ),
  status: CampaignStatusSchema.default('PAUSED').describe('The campaign status.'),
  budget: CampaignBudgetSchema.describe(
    'Budget configuration for the campaign. Provide either daily or lifetime budget.'
  ),
  specialAd: SpecialAdSchema.describe('Special ad category configuration.'),
});

// UpdateCampaign schema - single source of truth for campaign updates
export const UpdateCampaignSchema = z.object({
  campaignId: z.string().describe('The ID of the campaign to update.'),
  name: z.string().optional().describe('New name for the campaign.'),
  status: CampaignStatusSchema.optional().describe('New status for the campaign.'),
  budget: z
    .object({
      daily: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('New daily budget in cents (e.g., 1000 = $10.00)'),
      lifetime: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('New lifetime budget in cents (e.g., 10000 = $100.00)'),
    })
    .optional()
    .refine((budget) => !budget || !(budget.daily && budget.lifetime), {
      message: 'Provide either daily or lifetime budget for an update, but not both.',
      path: ['daily'],
    })
    .describe(
      'New budget for the campaign. If provided, specify either daily or lifetime, not both.'
    ),
});

// Export inferred types - single source of truth for TypeScript types
export type CreateCampaignRequest = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignSchema>;

/**
 * Handles registration of campaign-related MCP tools:
 * - get_campaigns: Retrieve campaigns for an ad account
 * - create_campaign: Create a new advertising campaign
 * - update_campaign: Update an existing campaign
 * - delete_campaign: Delete a campaign (set status to DELETED)
 */
export class CampaignToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

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

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetCampaigns(): string {
    const successDataSchema = z.object({
      campaigns: z
        .array(MetaCampaignResponseSchema)
        .describe('A list of campaigns with all available Meta API fields.'),
    });

    return createMcpTool(
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

  private registerCreateCampaign(): string {
    const successDataSchema = z.object({
      campaignId: z.string(),
      name: z.string(),
      objective: z.string(),
      status: z.string(),
    });

    return createMcpTool(
      this.server,
      'create_campaign',
      {
        title: 'Create Campaign',
        description: 'Creates a new advertising campaign.',
        inputSchema: CreateCampaignSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createCampaign(authPayload, params),
      'Successfully created campaign.'
    );
  }

  private registerUpdateCampaign(): string {
    const successDataSchema = z.object({
      campaignId: z.string(),
      updatedFields: z.array(z.string()),
    });

    return createMcpTool(
      this.server,
      'update_campaign',
      {
        title: 'Update Campaign',
        description: 'Updates an existing campaign.',
        inputSchema: UpdateCampaignSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateCampaign(authPayload, params),
      'Successfully updated campaign.'
    );
  }

  private registerDeleteCampaign(): string {
    const successDataSchema = z.object({
      campaignId: z.string(),
    });

    return createMcpTool(
      this.server,
      'delete_campaign',
      {
        title: 'Delete Campaign',
        description:
          'Permanently deletes a campaign by setting its status to DELETED. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to delete.'),
          confirmPermanentDelete: DeletionConfirmationSchema.describe(
            'Must be set to true to confirm permanent deletion.'
          ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteCampaign(authPayload, params),
      'Successfully deleted campaign.'
    );
  }
}
