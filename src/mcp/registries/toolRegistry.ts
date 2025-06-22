import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { accountManager } from '../../utils/accountManager.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import { createMcpSuccessResult } from '../responseHelper.js';
import type { IToolRegistry } from '../types.js';
import { AdCreativeToolRegistry } from './AdCreativeToolRegistry.js';
import { AdSetToolRegistry } from './AdSetToolRegistry.js';
import { AdToolRegistry } from './AdToolRegistry.js';
import { AdsArchiveToolRegistry } from './AdsArchiveToolRegistry.js';
import { BusinessManagerToolRegistry } from './BusinessManagerToolRegistry.js';
import { CampaignToolRegistry } from './CampaignToolRegistry.js';
import { CustomAudienceToolRegistry } from './CustomAudienceToolRegistry.js';
import { InsightsToolRegistry } from './InsightsToolRegistry.js';
import { PagesToolRegistry } from './PagesToolRegistry.js';
import { TargetingToolRegistry } from './TargetingToolRegistry.js';

export class ToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private registries: IToolRegistry[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;

    // Initialize all registries in a consistent order
    this.registries = [
      new CampaignToolRegistry(server, toolsHandler),
      new AdSetToolRegistry(server, toolsHandler),
      new AdCreativeToolRegistry(server, toolsHandler),
      new AdToolRegistry(server, toolsHandler),
      new InsightsToolRegistry(server, toolsHandler),
      new CustomAudienceToolRegistry(server, toolsHandler),
      new PagesToolRegistry(server, toolsHandler),
      new BusinessManagerToolRegistry(server, toolsHandler),
      new AdsArchiveToolRegistry(server, toolsHandler),
      new TargetingToolRegistry(server, toolsHandler),
    ];
  }

  public register() {
    const getAdAccountsOutputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        accounts: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              status: z.string(),
              currency: z.string(),
              timezone: z.string(),
              businessId: z.string().optional(),
              permissions: z.array(z.string()),
            })
          )
          .describe('A list of ad accounts.'),
      }),
    });

    this.server.registerTool(
      'get_ad_accounts',
      {
        title: 'Get Ad Accounts',
        description:
          'Retrieves all ad accounts accessible by the user. This tool should be called first to initialize your session context and load expert guidance for Meta advertising operations.',
        inputSchema: {},
        outputSchema: getAdAccountsOutputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.getAdAccounts(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );

    // Register all tool registries using loop-based approach
    logger.info('Registering tool registries...');
    let totalToolsRegistered = 0;

    for (const registry of this.registries) {
      const registryName = registry.getRegistryName();
      try {
        logger.info(
          `Attempting to register ${registryName} registry (${registry.getToolCount()} tools)`
        );
        registry.register();
        totalToolsRegistered += registry.getToolCount();
      } catch (error) {
        logger.error(`Failed to register tool registry: ${registryName}`, {
          registry: registryName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue with next registry
      }
    }

    logger.info(
      `Registry registration complete. Total tools successfully registered: ${totalToolsRegistered}`
    );

    const selectAdAccountOutputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        selectedAccount: z.string(),
      }),
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
            selectedAccount: adAccountId,
          };

          return await createMcpSuccessResult(
            result,
            `Successfully selected ad account ${adAccountId}`
          );
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );

    logger.info('Registered main MCP tools', { count: 2 });
  }
}
