import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

/**
 * Targeting Tool Registry
 *
 * Handles registration of targeting-related MCP tools:
 * - search_interests: Search for advertising interests.
 * - search_behaviors: Search for advertising behaviors.
 * - search_locations: Search for geographic locations for targeting.
 * - validate_targeting_options: Validate the status of given targeting option IDs.
 */
export class TargetingToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerSearchInterests.bind(this),
      this.registerSearchBehaviors.bind(this),
      this.registerSearchLocations.bind(this),
      this.registerValidateTargetingOptions.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Targeting Search';
  }

  /**
   * Register all targeting-related MCP tools
   */
  public register(): void {
    logger.info('Registering Targeting Search MCP tools');
    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }
    logger.info('Targeting Search MCP tools registered', { count: this.getToolCount() });
  }

  /**
   * Register the search_interests tool
   */
  private registerSearchInterests(): void {
    const successDataSchema = z.object({
      interests: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          audienceSize: z.number(),
          path: z.array(z.string()),
        })
      ),
      query: z.string(),
      total: z.number(),
    });

    createMcpTool(
      this.server,
      'search_interests',
      {
        title: 'Search for Targeting Interests',
        description:
          'Searches for advertising interests based on a query string (e.g., "sports", "technology").',
        inputSchema: {
          query: z.string().describe('The keyword to search for.'),
          limit: z
            .number()
            .int()
            .positive()
            .optional()
            .default(100)
            .describe('Maximum number of results to return. Defaults to 100.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchInterests(authPayload, params),
      'Successfully retrieved targeting interests.'
    );
  }

  /**
   * Register the search_behaviors tool
   */
  private registerSearchBehaviors(): void {
    const successDataSchema = z.object({
      behaviors: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          audienceSize: z.number(),
          path: z.array(z.string()),
        })
      ),
      query: z.string(),
      total: z.number(),
    });

    createMcpTool(
      this.server,
      'search_behaviors',
      {
        title: 'Search for Targeting Behaviors',
        description:
          'Searches for advertising behaviors based on a query string (e.g., "engaged shoppers").',
        inputSchema: {
          query: z.string().describe('The keyword to search for.'),
          limit: z
            .number()
            .int()
            .positive()
            .optional()
            .default(25)
            .describe('Maximum number of results to return. Defaults to 25.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchBehaviors(authPayload, params),
      'Successfully retrieved targeting behaviors.'
    );
  }

  /**
   * Register the search_locations tool
   */
  private registerSearchLocations(): void {
    const successDataSchema = z.object({
      locations: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          type: z.string(),
          countryCode: z.string(),
          countryName: z.string(),
        })
      ),
      query: z.string(),
      total: z.number(),
    });

    createMcpTool(
      this.server,
      'search_locations',
      {
        title: 'Search for Geographic Locations',
        description:
          'Searches for geographic locations to target (e.g., countries, regions, cities).',
        inputSchema: {
          query: z
            .string()
            .describe('The location name to search for (e.g., "California", "France").'),
          limit: z
            .number()
            .int()
            .positive()
            .optional()
            .default(25)
            .describe('Maximum number of results to return. Defaults to 25.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchLocations(authPayload, params),
      'Successfully retrieved geographic locations.'
    );
  }

  /**
   * Register the validate_targeting_options tool
   */
  private registerValidateTargetingOptions(): void {
    const successDataSchema = z.object({
      validationResults: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          isValid: z.boolean(),
          status: z.string(),
        })
      ),
      totalValidated: z.number(),
      validCount: z.number(),
    });

    createMcpTool(
      this.server,
      'validate_targeting_options',
      {
        title: 'Validate Targeting Options',
        description:
          'Checks if a list of targeting option IDs (interests, behaviors, etc.) are still valid for use in ads.',
        inputSchema: {
          targetingOptionIds: z
            .array(z.string())
            .describe('A list of targeting option IDs to validate.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.validateTargetingOptions(authPayload, params),
      'Successfully validated targeting options.'
    );
  }
}
