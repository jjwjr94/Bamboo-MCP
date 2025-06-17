import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../auth/mcpAuthUtils.js';
import type { MetaToolsHandler } from '../tools/metaToolsHandler.js';
import { accountManager } from '../utils/accountManager.js';
import { logger } from '../utils/logger.js';
import { AdSetToolRegistry } from './AdSetToolRegistry.js';
import { CampaignToolRegistry } from './CampaignToolRegistry.js';

// Define the schema for the call_meta_api tool
const CallMetaApiSchema = z.object({
  endpoint: z.string().describe("API endpoint (e.g., 'me/adaccounts', 'act_123/campaigns')"),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
  fields: z.array(z.string()).optional().describe('Fields to retrieve (for GET requests)'),
  parameters: z.record(z.any()).optional().describe('Parameters or data to send'),
});

export class ToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private campaignToolRegistry: CampaignToolRegistry;
  private adSetToolRegistry: AdSetToolRegistry;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.campaignToolRegistry = new CampaignToolRegistry(server, toolsHandler);
    this.adSetToolRegistry = new AdSetToolRegistry(server, toolsHandler);
  }

  // --- Tool Registration ---
  public register() {
    // Register get_ad_accounts tool
    this.server.registerTool(
      'get_ad_accounts',
      {
        title: 'Get Ad Accounts',
        description: 'Retrieves all ad accounts accessible by the user.',
        inputSchema: {},
        outputSchema: {
          accounts: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                status: z.union([z.number(), z.string()]),
                currency: z.string(),
                timezone: z.string(),
                permissions: z.array(z.string()),
              })
            )
            .describe('A list of ad accounts.'),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.getAdAccounts(authPayload, params);
      }
    );

    // Delegate campaign tool registration to specialized registry
    this.campaignToolRegistry.register();

    // Delegate ad set tool registration to specialized registry
    this.adSetToolRegistry.register();

    // Register generic Meta API call tool
    this.server.registerTool(
      'call_meta_api',
      {
        title: 'Call Meta API',
        description: 'Make a generic call to the Meta Graph API for complete API coverage.',
        inputSchema: CallMetaApiSchema.shape,
        outputSchema: {
          responseData: z.any().describe('The JSON response from the Meta Graph API.'),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        return this.toolsHandler.callMetaApi(authPayload, params);
      }
    );

    // Register account selection tool
    this.server.registerTool(
      'select_ad_account',
      {
        title: 'Select Ad Account',
        description:
          'Select an ad account for subsequent operations. This allows you to set a default account for campaigns and other operations.',
        inputSchema: {
          adAccountId: z
            .string()
            .describe("The ID of the ad account to select (e.g., 'act_12345')"),
        },
        outputSchema: {
          success: z.boolean(),
          selectedAccount: z.string().optional(),
          message: z.string().optional(),
          error: z.string().optional(),
        },
      },
      async (params, extra) => {
        const authPayload = extractAuthPayload(extra);
        const { adAccountId } = params;

        logger.info('Executing select_ad_account', { userId: authPayload.userId, adAccountId });

        try {
          await accountManager.selectAccount(authPayload.userId, adAccountId);

          const result = {
            success: true,
            selectedAccount: adAccountId,
            message: `Successfully selected ad account ${adAccountId}`,
          };

          return {
            structuredContent: result,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const result = {
            success: false,
            error: error instanceof Error ? error.message : 'Account selection failed',
          };

          return {
            structuredContent: result,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    logger.info('Registered main MCP tools', { count: 3 });
  }

  // --- Helper Methods ---
}
