import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

/**
 * Business Manager Tool Registry
 *
 * Handles registration of business manager-related MCP tools:
 * - get_business_accounts: List business manager accounts
 * - get_business_users: List users in a business manager
 */
export class BusinessManagerToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetBusinessAccounts.bind(this),
      this.registerGetBusinessUsers.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Business Manager';
  }

  /**
   * Register all business manager-related MCP tools
   */
  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetBusinessAccounts(): string {
    const successDataSchema = z.object({
      businessAccounts: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            verification_status: z.string().optional(),
            timezone_id: z.number().optional(),
            created_time: z.string().optional(),
          })
        )
        .describe('List of business accounts owned by the user.'),
    });

    return createMcpTool(
      this.server,
      'get_business_accounts',
      {
        title: 'Get Business Accounts',
        description: 'Retrieves business accounts owned by the user.',
        inputSchema: {},
        successDataSchema,
      },
      (authPayload) => this.toolsHandler.getBusinessAccounts(authPayload),
      'Successfully retrieved business accounts.'
    );
  }

  private registerGetBusinessUsers(): string {
    const successDataSchema = z.object({
      businessUsers: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().optional(),
            role: z.string().optional(),
            permissions: z.array(z.string()).optional(),
          })
        )
        .describe('List of users in the business account.'),
    });

    return createMcpTool(
      this.server,
      'get_business_users',
      {
        title: 'Get Business Users',
        description: 'Retrieves users for a specific business account.',
        inputSchema: {
          businessId: z.string().describe('The ID of the business account.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getBusinessUsers(authPayload, params),
      'Successfully retrieved business users.'
    );
  }
}

// Export the inferred types for use in handlers
export type GetBusinessAccountsInput = Record<string, unknown>;
export type GetBusinessUsersInput = {
  businessId: string;
};
