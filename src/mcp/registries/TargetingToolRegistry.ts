import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
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
  private readonly registrationMethods: (() => string)[];

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
    return 'Targeting';
  }

  /**
   * Register all targeting-related MCP tools
   */
  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  /**
   * Register the search_interests tool
   */
  private registerSearchInterests(): string {
    const successDataSchema = z.object({
      interests: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            audience_size: z.number().optional(),
            path: z.array(z.string()).optional(),
            description: z.string().optional(),
          })
        )
        .describe('A list of interest targeting options.'),
    });

    return createMcpTool(
      this.server,
      'search_interests',
      {
        title: 'Search Interest Targeting',
        description: 'Searches for interest-based targeting options to use in ad sets.',
        inputSchema: {
          query: z.string().describe('Search query for interests (e.g., "fitness", "cooking").'),
          limit: z
            .number()
            .int()
            .positive()
            .max(100)
            .default(25)
            .describe('Maximum number of results to return (default: 25, max: 100).'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchInterests(authPayload, params),
      'Successfully retrieved interest targeting options.'
    );
  }

  /**
   * Register the search_behaviors tool
   */
  private registerSearchBehaviors(): string {
    const successDataSchema = z.object({
      behaviors: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            audience_size: z.number().optional(),
            path: z.array(z.string()).optional(),
            description: z.string().optional(),
          })
        )
        .describe('A list of behavior targeting options.'),
    });

    return createMcpTool(
      this.server,
      'search_behaviors',
      {
        title: 'Search Behavior Targeting',
        description: 'Searches for behavior-based targeting options to use in ad sets.',
        inputSchema: {
          query: z.string().describe('Search query for behaviors (e.g., "frequent travelers").'),
          limit: z
            .number()
            .int()
            .positive()
            .max(100)
            .default(25)
            .describe('Maximum number of results to return (default: 25, max: 100).'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchBehaviors(authPayload, params),
      'Successfully retrieved behavior targeting options.'
    );
  }

  /**
   * Register the search_locations tool
   */
  private registerSearchLocations(): string {
    const successDataSchema = z.object({
      locations: z
        .array(
          z.object({
            key: z.string(),
            name: z.string(),
            type: z.string(),
            country_code: z.string().optional(),
            country_name: z.string().optional(),
            region: z.string().optional(),
            region_id: z.string().optional(),
            supports_region: z.boolean().optional(),
            supports_city: z.boolean().optional(),
          })
        )
        .describe('A list of location targeting options.'),
    });

    return createMcpTool(
      this.server,
      'search_locations',
      {
        title: 'Search Location Targeting',
        description: 'Searches for geographic targeting options to use in ad sets.',
        inputSchema: {
          query: z
            .string()
            .describe('Search query for locations (e.g., "New York", "California").'),
          type: z
            .enum(['country', 'region', 'city'])
            .optional()
            .describe('Type of location to search for.'),
          limit: z
            .number()
            .int()
            .positive()
            .max(100)
            .default(25)
            .describe('Maximum number of results to return (default: 25, max: 100).'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.searchLocations(authPayload, params),
      'Successfully retrieved location targeting options.'
    );
  }

  /**
   * Register the validate_targeting_options tool
   */
  private registerValidateTargetingOptions(): string {
    const successDataSchema = z.object({
      validTargetingOptions: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            is_valid: z.boolean(),
          })
        )
        .describe('Validation results for targeting options.'),
    });

    return createMcpTool(
      this.server,
      'validate_targeting_options',
      {
        title: 'Validate Targeting Options',
        description: 'Validates whether targeting option IDs are still active and usable.',
        inputSchema: {
          targetingOptionIds: z
            .array(z.string())
            .describe('Array of targeting option IDs to validate.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.validateTargetingOptions(authPayload, params),
      'Successfully validated targeting options.'
    );
  }
}
