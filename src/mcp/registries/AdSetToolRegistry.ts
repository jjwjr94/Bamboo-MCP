import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import {
  AdSetBillingEventSchema,
  AdSetOptimizationGoalSchema,
  AdSetStatusSchema,
  MetaAdSetResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

/**
 * Ad Set Tool Registry
 *
 * Handles registration of ad set-related MCP tools:
 * - get_adsets: Retrieve ad sets for a campaign or ad account
 * - create_adset: Create a new advertising ad set
 * - update_adset: Update an existing ad set
 * - delete_adset: Delete an ad set
 */
export class AdSetToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  /**
   * Register all ad set-related MCP tools
   */
  public register(): void {
    logger.info('Registering Ad Set MCP tools');
    this.registerGetAdSets();
    this.registerCreateAdSet();
    this.registerUpdateAdSet();
    this.registerDeleteAdSet();
    logger.info('Ad Set MCP tools registered', { count: 4 });
  }

  /**
   * Register the get_adsets tool
   */
  private registerGetAdSets(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adSets: z.array(MetaAdSetResponseSchema).describe('A list of ad sets.'),
      }),
    });

    this.server.registerTool(
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
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.getAdSets(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  /**
   * Register the create_adset tool
   */
  private registerCreateAdSet(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adSetId: z.string(),
        name: z.string(),
        campaignId: z.string(),
      }),
    });

    this.server.registerTool(
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
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.createAdSet(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  /**
   * Register the update_adset tool
   */
  private registerUpdateAdSet(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adSetId: z.string(),
        updatedFields: z.array(z.string()),
      }),
    });

    this.server.registerTool(
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
          startTime: z.string().optional().describe('New start time in ISO format.'),
          endTime: z.string().optional().describe('New end time in ISO format.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.updateAdSet(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  /**
   * Register the delete_adset tool
   */
  private registerDeleteAdSet(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adSetId: z.string(),
      }),
    });

    this.server.registerTool(
      'delete_adset',
      {
        title: 'Delete Ad Set',
        description:
          'Archives an ad set by setting its status to DELETED. The ad set data is preserved but the ad set becomes inactive.',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to delete.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.deleteAdSet(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
