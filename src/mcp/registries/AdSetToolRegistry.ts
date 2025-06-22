import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdSetBillingEventSchema,
  AdSetOptimizationGoalSchema,
  AdSetStatusSchema,
  MetaAdSetResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

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
    logger.info('Registering Ad Set MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Ad Set MCP tools registered', { count: this.getToolCount() });
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

    createMcpTool(
      this.server,
      'create_adset',
      {
        title: 'Create Ad Set',
        description: 'Creates a new ad set within a campaign.',
        inputSchema: {
          campaignId: z.string().describe('The ID of the campaign to create the ad set in.'),
          name: z.string().describe('The name of the ad set.'),
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
          targeting: z
            .object({
              geoLocations: z
                .object({
                  countries: z.array(z.string()).optional(),
                  regions: z.array(z.object({ key: z.string() })).optional(),
                  cities: z.array(z.object({ key: z.string() })).optional(),
                })
                .optional(),
              ageMin: z.number().int().min(13).max(65).optional(),
              ageMax: z.number().int().min(13).max(65).optional(),
              genders: z
                .array(z.enum(['1', '2']))
                .optional()
                .describe('1 = male, 2 = female'),
              interests: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              behaviors: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              customAudiences: z.array(z.object({ id: z.string() })).optional(),
              excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
            })
            .describe('Targeting criteria for the ad set.'),
          billingEvent: AdSetBillingEventSchema.describe('Billing event for the ad set.'),
          optimizationGoal: AdSetOptimizationGoalSchema.describe(
            'Optimization goal for the ad set.'
          ),
          bidAmount: z.number().int().positive().optional().describe('Bid amount in cents.'),
          startTime: z.string().optional().describe('Start time in ISO format.'),
          endTime: z.string().optional().describe('End time in ISO format.'),
          status: AdSetStatusSchema.default('PAUSED').describe('The ad set status.'),
          attributionSpec: z
            .array(
              z.object({
                event_type: z
                  .string()
                  .describe('Event type for attribution (e.g., IMPRESSION, CLICK)'),
                window_days: z.number().int().positive().describe('Attribution window in days'),
              })
            )
            .optional()
            .describe(
              'Attribution spec for the ad set. Required when using certain optimization goals.'
            ),
          promotedObject: z
            .record(z.string(), z.any())
            .optional()
            .describe(
              'Promoted object for the ad set (e.g., { page_id, application_id, product_catalog_id }). Required for some objectives.'
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
          bidAmount: z.number().int().positive().optional().describe('New bid amount in cents.'),
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
        description: 'Permanently deletes an ad set. This action cannot be undone.',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Confirmation that you want to permanently delete this ad set.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAdSet(authPayload, params),
      'Successfully deleted ad set.'
    );
  }
}
