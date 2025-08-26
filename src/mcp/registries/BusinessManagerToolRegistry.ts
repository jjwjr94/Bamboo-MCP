import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

// GetBusinessAccounts schema - single source of truth
export const GetBusinessAccountsInputSchema = z.object({});

// GetBusinessUsers schema - single source of truth
export const GetBusinessUsersInputSchema = z.object({
  businessId: z.string().describe('The ID of the business account.'),
});

// Export inferred types - single source of truth for TypeScript types
export type GetBusinessAccountsInput = z.infer<typeof GetBusinessAccountsInputSchema>;
export type GetBusinessUsersInput = z.infer<typeof GetBusinessUsersInputSchema>;

// GetBusinessAccounts success schema - Updated to match Meta API v22+ actual response
const GetBusinessAccountsSuccessSchema = z.object({
  businessAccounts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        created_time: z.string().optional().describe('ISO 8601 timestamp'),
        timezone_id: z.string().optional().describe('IANA timezone (e.g., "America/Los_Angeles")'),
        primary_page: z.string().optional().describe('ID of the primary Facebook Page'),
        vertical: z.string().optional().describe('Vertical/category of the business'),
        two_factor_type: z.string().optional().describe('2FA configuration'),
      })
    )
    .describe('List of business accounts owned by the user.'),
});

// GetBusinessUsers success schema - Updated to match Meta API v22+ actual response
const GetBusinessUsersSuccessSchema = z.object({
  businessUsers: z
    .array(
      z.object({
        id: z.string(),
        first_name: z.string().optional().describe('First name of the user'),
        last_name: z.string().optional().describe('Last name of the user'),
        email: z.string().optional().describe('Email address'),
        role: z.string().optional().describe("User's role in Business Manager"),
        title: z.string().optional().describe("User's business title"),
        work_email: z.string().optional().describe('Work email'),
        permissions: z.array(z.string()).optional().describe('List of specific permissions'),
        finance_permission: z.string().optional().describe('Finance permissions'),
        created_time: z.string().optional().describe('When user was added'),
      })
    )
    .describe('List of business users associated with the business.'),
});

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
    return createMcpTool(
      this.server,
      'get_business_accounts',
      {
        title: 'Get Business Accounts',
        description: 'Retrieves business accounts owned by the user.',
        inputSchema: GetBusinessAccountsInputSchema,
        successDataSchema: GetBusinessAccountsSuccessSchema,
      },
      (authPayload) => this.toolsHandler.getBusinessAccounts(authPayload),
      'Successfully retrieved business accounts.'
    );
  }

  private registerGetBusinessUsers(): string {
    return createMcpTool(
      this.server,
      'get_business_users',
      {
        title: 'Get Business Users',
        description: 'Retrieves users for a specific business account.',
        inputSchema: GetBusinessUsersInputSchema,
        successDataSchema: GetBusinessUsersSuccessSchema,
      },
      (authPayload, params) => this.toolsHandler.getBusinessUsers(authPayload, params),
      'Successfully retrieved business users.'
    );
  }
}
