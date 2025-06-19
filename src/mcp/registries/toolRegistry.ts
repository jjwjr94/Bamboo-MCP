import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { accountManager } from '../../utils/accountManager.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import { createMcpSuccessResult } from '../responseHelper.js';
import { AdSetToolRegistry } from './AdSetToolRegistry.js';
import { CampaignToolRegistry } from './CampaignToolRegistry.js';

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

  public register() {
    const getAdAccountsOutputSchema = z.object({
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
    });

    this.server.registerTool(
      'get_ad_accounts',
      {
        title: 'Get Ad Accounts',
        description: 'Retrieves all ad accounts accessible by the user.',
        inputSchema: {},
        outputSchema: getAdAccountsOutputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          const result = await this.toolsHandler.getAdAccounts(authPayload, params);

          if (result?.structuredContent) {
            const validation = getAdAccountsOutputSchema.safeParse(result.structuredContent);
            if (!validation.success) {
              logger.error('Tool output validation failed for get_ad_accounts', {
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

    this.campaignToolRegistry.register();

    this.adSetToolRegistry.register();

    const selectAdAccountOutputSchema = z.object({
      success: z.boolean(),
      selectedAccount: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
    });

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
        outputSchema: selectAdAccountOutputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          const { adAccountId } = params;

          logger.info('Executing select_ad_account', { userId: authPayload.userId, adAccountId });

          await accountManager.selectAccount(authPayload.userId, adAccountId);

          const result = {
            success: true,
            selectedAccount: adAccountId,
            message: `Successfully selected ad account ${adAccountId}`,
          };

          const validation = selectAdAccountOutputSchema.safeParse(result);
          if (!validation.success) {
            logger.error('Tool output validation failed for select_ad_account', {
              errors: validation.error.format(),
            });
            return createMcpErrorResult(
              new Error('Internal error: Tool output failed validation.')
            );
          }

          return createMcpSuccessResult(result);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );

    logger.info('Registered main MCP tools', { count: 2 });
  }
}
