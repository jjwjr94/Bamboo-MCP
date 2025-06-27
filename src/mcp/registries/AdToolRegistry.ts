import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AdStatusSchema, MetaAdResponseSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// CreateAd schema - single source of truth for ad creation
export const CreateAdSchema = z.object({
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
  creativeFeaturesSpec: z
    .object({
      standardEnhancements: z
        .object({
          enrollStatus: z
            .enum(['OPT_IN', 'OPT_OUT'])
            .optional()
            .describe('Enrollment status for standard enhancements.'),
        })
        .optional()
        .describe('Standard enhancement settings for Advantage+ Creative features.'),
    })
    .optional()
    .describe(
      'Specification for Advantage+ creative features. Required in Meta API v22 if using any Advantage+ features. Individual features must be explicitly opted into.'
    ),
});

// UpdateAd schema - single source of truth for ad updates
export const UpdateAdSchema = z.object({
  adId: z.string().describe('The ID of the ad to update.'),
  name: z.string().optional().describe('New name for the ad.'),
  status: AdStatusSchema.optional().describe('New status for the ad.'),
  creativeId: z.string().optional().describe('New creative ID for the ad.'),
});

// Export inferred types - single source of truth for TypeScript types
export type CreateAdRequest = z.infer<typeof CreateAdSchema>;
export type UpdateAdRequest = z.infer<typeof UpdateAdSchema>;

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
  private readonly registrationMethods: (() => string)[];

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

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetAds(): string {
    const successDataSchema = z.object({
      ads: z.array(MetaAdResponseSchema).describe('A list of ads.'),
    });

    return createMcpTool(
      this.server,
      'get_ads',
      {
        title: 'Get Ads',
        description: 'Retrieves ads for an ad account, ad set, or campaign.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          adSetId: z.string().optional().describe('The ID of the ad set to get ads from.'),
          campaignId: z.string().optional().describe('The ID of the campaign to get ads from.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAds(authPayload, params),
      'Successfully retrieved ads.'
    );
  }

  private registerCreateAd(): string {
    const successDataSchema = z.object({
      adId: z.string(),
      name: z.string(),
      adSetId: z.string(),
      adCreativeId: z.string(),
    });

    return createMcpTool(
      this.server,
      'create_ad',
      {
        title: 'Create Ad',
        description: 'Creates a new ad within an ad set.',
        inputSchema: CreateAdSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAd(authPayload, params),
      'Successfully created ad.'
    );
  }

  private registerUpdateAd(): string {
    const successDataSchema = z.object({
      adId: z.string(),
      updatedFields: z.array(z.string()),
    });

    return createMcpTool(
      this.server,
      'update_ad',
      {
        title: 'Update Ad',
        description: 'Updates an existing ad.',
        inputSchema: UpdateAdSchema.shape,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAd(authPayload, params),
      'Successfully updated ad.'
    );
  }

  private registerDeleteAd(): string {
    const successDataSchema = z.object({
      adId: z.string(),
    });

    return createMcpTool(
      this.server,
      'delete_ad',
      {
        title: 'Delete Ad',
        description:
          'Permanently deletes an ad. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: {
          adId: z.string().describe('The ID of the ad to delete.'),
          confirmPermanentDelete: DeletionConfirmationSchema.describe(
            'Must be set to true to confirm permanent deletion.'
          ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAd(authPayload, params),
      'Successfully deleted ad.'
    );
  }
}
