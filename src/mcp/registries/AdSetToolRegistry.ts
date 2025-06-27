import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdSetBidStrategySchema,
  AdSetBillingEventSchema,
  AdSetOptimizationGoalSchema,
  AdSetStatusSchema,
  MetaAdSetResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// Base targeting schema definition
const BaseTargetingSchema = z.object({
  geoLocations: z.object({
    countries: z
      .array(
        z
          .string()
          .toUpperCase()
          .regex(
            /^[A-Z]{2}$/,
            "Must be a 2-letter uppercase ISO 3166-1 alpha-2 country code (e.g., 'US', 'CA', 'GB')"
          )
      )
      .optional(),
    regions: z.array(z.object({ key: z.string() })).optional(),
    cities: z.array(z.object({ key: z.string() })).optional(),
  }),
  ageMin: z.number().int().min(13).max(65).optional(),
  ageMax: z.number().int().min(13).max(65).optional(),
  genders: z
    .array(z.union([z.literal(1), z.literal(2)]))
    .optional()
    .describe('1 = male, 2 = female'),
  interests: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
  behaviors: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
  customAudiences: z.array(z.object({ id: z.string() })).optional(),
  excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
  flexibleSpec: z
    .array(
      z.object({
        interests: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
        behaviors: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
      })
    )
    .optional(),
  devicePlatforms: z.array(z.enum(['mobile', 'desktop'])).optional(),
  publisherPlatforms: z
    .array(z.enum(['facebook', 'instagram', 'messenger', 'audience_network']))
    .optional(),
});

// Required targeting schema for create operations
const CreateTargetingSchema = BaseTargetingSchema;

// Optional targeting schema for update operations
const UpdateTargetingSchema = BaseTargetingSchema.optional();

/**
 * Ad Set Tool Registry
 *
 * Handles registration of ad set-related MCP tools:
 * - get_adsets: Retrieve ad sets for a campaign or ad account
 * - create_adset: Create a new advertising ad set
 * - update_adset: Update an existing ad set
 * - delete_adset: Delete an ad set
 */
export class AdSetToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAdSets.bind(this),
      this.registerCreateAdSet.bind(this),
      this.registerUpdateAdSet.bind(this),
      this.registerDeleteAdSet.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Ad Set';
  }

  /**
   * Register all ad set-related MCP tools
   */
  public register(): void {
    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }
  }

  /**
   * Register the get_adsets tool
   */
  private registerGetAdSets(): void {
    const successDataSchema = z.object({
      adSets: z.array(MetaAdSetResponseSchema).describe('A list of ad sets.'),
    });

    createMcpTool(
      this.server,
      'get_adsets',
      {
        title: 'Get Ad Sets',
        description: 'Retrieves ad sets for a campaign or ad account.',
        inputSchema: {
          campaignId: z.string().optional().describe('The ID of the campaign to get ad sets from.'),
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdSets(authPayload, params),
      'Successfully retrieved ad sets.'
    );
  }

  /**
   * Register the create_adset tool
   */
  private registerCreateAdSet(): void {
    const successDataSchema = z.object({
      adSetId: z.string(),
      name: z.string(),
      campaignId: z.string(),
    });

    // Define modern attribution spec schema for v22
    const ModernAttributionSpecSchema = z
      .array(
        z.object({
          event_type: z
            .enum(['CLICK_THROUGH', 'VIEW_THROUGH'])
            .describe("The event type for attribution. Use 'CLICK_THROUGH' or 'VIEW_THROUGH'."),
          window_days: z
            .union([z.literal(1), z.literal(7)])
            .describe(
              'The attribution window in days. Valid values are 1 or 7 due to iOS 14.5+ restrictions.'
            ),
        })
      )
      .optional()
      .describe(
        'Modern attribution spec for the ad set. Required for some optimization goals. Post-iOS 14.5 only supports 1-day and 7-day windows.'
      );

    createMcpTool(
      this.server,
      'create_adset',
      {
        title: 'Create Ad Set',
        description: 'Creates a new ad set within a campaign.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to create the ad set in.'),
          name: z.string().describe('The name of the ad set.'),
          budget: z
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
              ({ daily, lifetime }) => !!daily !== !!lifetime, // true = only-one-defined
              {
                message: 'Provide **either** daily **or** lifetime (one is required, not both).',
                path: ['daily'],
              }
            ),
          targeting: CreateTargetingSchema.refine(
            (data) =>
              data &&
              (data.geoLocations?.countries?.length ||
                data.geoLocations?.regions?.length ||
                data.geoLocations?.cities?.length),
            {
              message:
                'Geographic targeting (geoLocations) is required and must specify at least one of countries, regions, or cities.',
              path: ['geoLocations'],
            }
          ).describe(
            'Targeting criteria for the ad set. Geographic targeting (geoLocations) is required.'
          ),
          billingEvent: AdSetBillingEventSchema.describe(
            'Billing event for the ad set. Must be compatible with optimization goal.'
          ),
          optimizationGoal: AdSetOptimizationGoalSchema.describe(
            'Optimization goal for the ad set. APP_INSTALLS requires promotedObject.application_id, LEAD_GENERATION requires promotedObject.page_id.'
          ),
          bidStrategy: AdSetBidStrategySchema.optional().describe(
            'The bid strategy for the ad set. If not specified, defaults to LOWEST_COST_WITHOUT_CAP.'
          ),
          bidAmount: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Bid amount in cents. Required for certain bid strategies like LOWEST_COST_WITH_BID_CAP.'
            ),
          startTime: z.string().optional().describe('Start time in ISO format.'),
          endTime: z.string().optional().describe('End time in ISO format.'),
          status: AdSetStatusSchema.default('PAUSED').describe('The ad set status.'),
          attributionSpec: ModernAttributionSpecSchema,
          promotedObject: z
            .record(z.string(), z.any())
            .optional()
            .describe(
              'Promoted object for the ad set (e.g., { page_id, application_id, product_catalog_id }). Required for some objectives: APP_INSTALLS needs application_id, LEAD_GENERATION needs page_id.'
            ),
          isSacCfcaTermsCertified: z
            .boolean()
            .optional()
            .describe(
              "Certifies CCPA compliance. Required for Special Ad Category campaigns targeting California with optimization goals like 'VALUE', 'LEAD_GENERATION', or 'CONVERSIONS'."
            ),
          isEligibleForSacCampaigns: z
            .boolean()
            .optional()
            .describe(
              "Confirms eligibility for Special Ad Category campaigns. Required for all SAC campaigns from January 2025 as part of Meta's enhanced compliance framework."
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAdSet(authPayload, params),
      'Successfully created ad set.'
    );
  }

  /**
   * Register the update_adset tool
   */
  private registerUpdateAdSet(): void {
    const successDataSchema = z.object({
      adSetId: z.string(),
      updatedFields: z.array(z.string()),
    });

    createMcpTool(
      this.server,
      'update_adset',
      {
        title: 'Update Ad Set',
        description: 'Updates an existing ad set.',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to update.'),
          name: z.string().optional().describe('New name for the ad set.'),
          status: AdSetStatusSchema.optional().describe('New status for the ad set.'),
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
              message:
                'Provide **either** daily **or** lifetime budget for an update, but not both.',
              path: ['daily'],
            })
            .describe(
              'New budget for the ad set. If provided, specify either daily or lifetime, not both.'
            ),
          bidAmount: z.number().int().positive().optional().describe('New bid amount in cents.'),
          targeting: UpdateTargetingSchema.describe(
            'New targeting criteria for the ad set. When provided, this will completely overwrite the existing targeting settings.'
          ),
          startTime: z.string().optional().describe('New start time in ISO format.'),
          endTime: z.string().optional().describe('New end time in ISO format.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAdSet(authPayload, params),
      'Successfully updated ad set.'
    );
  }

  /**
   * Register the delete_adset tool
   */
  private registerDeleteAdSet(): void {
    const successDataSchema = z.object({
      adSetId: z.string(),
    });

    createMcpTool(
      this.server,
      'delete_adset',
      {
        title: 'Delete Ad Set',
        description:
          'Permanently deletes an ad set. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to delete.'),
          confirmPermanentDelete: DeletionConfirmationSchema.describe(
            'Must be set to true to confirm permanent deletion.'
          ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAdSet(authPayload, params),
      'Successfully deleted ad set.'
    );
  }
}
