import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import type { IToolRegistry } from '../types.js';

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
  private readonly registrationMethods: (() => void)[];

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
  public register(): void {
    logger.info('Registering Business Manager MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Business Manager MCP tools registered', { count: this.getToolCount() });
  }

  private registerGetBusinessAccounts(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        businesses: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            created_time: z.string().optional(),
            link: z.string().optional(),
            verification_status: z.string().optional(),
            vertical: z.string().optional(),
            timezone_id: z.number().optional(),
          })
        ),
      }),
    });

    this.server.registerTool(
      'get_business_accounts',
      {
        title: 'Get Business Accounts',
        description:
          'List business manager accounts that the user has access to. Requires business_management permission.',
        inputSchema: {},
        outputSchema: outputSchema.shape,
      },
      async (_params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getBusinessAccounts(authPayload);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetBusinessUsers(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        users: z.array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            email: z.string().optional(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            role: z.string().optional(),
            title: z.string().optional(),
            finance_permission: z.string().optional(),
            ip_permission: z.string().optional(),
            two_fac_status: z.string().optional(),
            pending_email: z.string().optional(),
          })
        ),
        businessId: z.string(),
      }),
    });

    this.server.registerTool(
      'get_business_users',
      {
        title: 'Get Business Users',
        description:
          'List users associated with a specific business manager. Requires business_management permission. For best performance, call `get_business_accounts` first to find the correct `businessId` to use.',
        inputSchema: {
          businessId: z
            .string()
            .describe(
              'The ID of the business to get users for. Use get_business_accounts first to find available business IDs.'
            ),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getBusinessUsers(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}

// Export the inferred types for use in handlers
export type GetBusinessAccountsInput = Record<string, unknown>;
export type GetBusinessUsersInput = {
  businessId: string;
};
