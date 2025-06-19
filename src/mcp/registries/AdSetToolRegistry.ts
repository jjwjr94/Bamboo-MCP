import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
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
      adSets: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            effective_status: z.string().optional(),
            configured_status: z.string().optional(),
            created_time: z.string().optional(),
            updated_time: z.string().optional(),
            start_time: z.string().optional().nullable(),
            end_time: z.string().optional().nullable(),
            daily_budget: z.string().optional(),
            lifetime_budget: z.string().optional(),
            budget_remaining: z.string().optional(),
            billing_event: z.string().optional(),
            optimization_goal: z.string().optional(),
            bid_amount: z.number().optional().nullable(),
            targeting: z.unknown().optional(),
            attribution_spec: z.unknown().optional(),
            promoted_object: z.unknown().optional(),
          })
        )
        .describe('A list of ad sets.'),
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
          const result = await this.toolsHandler.getAdSets(authPayload, params);

          // Validate output schema
          if (result?.structuredContent) {
            const validation = outputSchema.safeParse(result.structuredContent);
            if (!validation.success) {
              logger.error('Tool output validation failed for get_adsets', {
                errors: validation.error.format(),
              });
              return createMcpErrorResult(
                new Error('Internal error: Tool output failed validation.')
              );
            }
          }

          return result;
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
      success: z.boolean(),
      adSetId: z.string(),
      name: z.string(),
      campaignId: z.string(),
      message: z.string(),
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
          billingEvent: z
            .enum(['LINK_CLICKS', 'IMPRESSIONS', 'REACH', 'THRUPLAY', 'LANDING_PAGE_VIEWS'])
            .describe('Billing event for the ad set.'),
          optimizationGoal: z
            .enum([
              'LINK_CLICKS',
              'IMPRESSIONS',
              'REACH',
              'LANDING_PAGE_VIEWS',
              'LEAD_GENERATION',
              'CONVERSIONS',
              'THRUPLAY',
            ])
            .describe('Optimization goal for the ad set.'),
          bidAmount: z.number().int().positive().optional().describe('Bid amount in cents.'),
          startTime: z.string().optional().describe('Start time in ISO format.'),
          endTime: z.string().optional().describe('End time in ISO format.'),
          status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('The ad set status.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          const result = await this.toolsHandler.createAdSet(authPayload, params);

          // Validate output schema
          if (result?.structuredContent) {
            const validation = outputSchema.safeParse(result.structuredContent);
            if (!validation.success) {
              logger.error('Tool output validation failed for create_adset', {
                errors: validation.error.format(),
              });
              return createMcpErrorResult(
                new Error('Internal error: Tool output failed validation.')
              );
            }
          }

          return result;
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
      success: z.boolean(),
      adSetId: z.string(),
      updatedFields: z.array(z.string()),
      message: z.string(),
    });

    this.server.registerTool(
      'update_adset',
      {
        title: 'Update Ad Set',
        description: 'Updates an existing ad set.',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to update.'),
          name: z.string().optional().describe('New name for the ad set.'),
          status: z
            .enum(['ACTIVE', 'PAUSED', 'DELETED'])
            .optional()
            .describe('New status for the ad set.'),
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
              genders: z.array(z.enum(['1', '2'])).optional(),
              interests: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              behaviors: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              customAudiences: z.array(z.object({ id: z.string() })).optional(),
              excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
            })
            .optional()
            .describe('New targeting criteria for the ad set.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          const result = await this.toolsHandler.updateAdSet(authPayload, params);

          // Validate output schema
          if (result?.structuredContent) {
            const validation = outputSchema.safeParse(result.structuredContent);
            if (!validation.success) {
              logger.error('Tool output validation failed for update_adset', {
                errors: validation.error.format(),
              });
              return createMcpErrorResult(
                new Error('Internal error: Tool output failed validation.')
              );
            }
          }

          return result;
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
      success: z.boolean(),
      adSetId: z.string(),
      message: z.string(),
    });

    this.server.registerTool(
      'delete_adset',
      {
        title: 'Delete Ad Set',
        description: 'Deletes an ad set (sets status to DELETED).',
        inputSchema: {
          adSetId: z.string().describe('The ID of the ad set to delete.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          const result = await this.toolsHandler.deleteAdSet(authPayload, params);

          // Validate output schema
          if (result?.structuredContent) {
            const validation = outputSchema.safeParse(result.structuredContent);
            if (!validation.success) {
              logger.error('Tool output validation failed for delete_adset', {
                errors: validation.error.format(),
              });
              return createMcpErrorResult(
                new Error('Internal error: Tool output failed validation.')
              );
            }
          }

          return result;
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
