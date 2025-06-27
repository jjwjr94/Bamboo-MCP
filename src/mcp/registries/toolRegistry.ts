import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { accountManager } from '../../utils/accountManager.js';
import { logger } from '../../utils/logger.js';
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
import { createMcpTool } from './registryHelper.js';

export class ToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private registries: IToolRegistry[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;

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
    // Step 1: Register all sub-registries and collect their tool names
    const subRegistryToolNames: string[] = [];
    logger.info('Registering tool registries and collecting tool names...');
    let totalToolsRegistered = 0;

    for (const registry of this.registries) {
      const registryName = registry.getRegistryName();
      try {
        logger.info(
          `Attempting to register ${registryName} registry (${registry.getToolCount()} tools)`
        );
        const registeredNames = registry.register();
        subRegistryToolNames.push(...registeredNames);
        totalToolsRegistered += registry.getToolCount();
      } catch (error) {
        logger.error(`Failed to register tool registry: ${registryName}`, {
          registry: registryName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    logger.info(
      `Registry registration complete. Total sub-tools registered: ${totalToolsRegistered}`
    );

    // Step 2: Define main tool names and create complete tool list
    const mainToolNames = ['get_ad_accounts', 'select_ad_account'];
    const allToolNames = [...mainToolNames, ...subRegistryToolNames];

    // Step 3: Register main tools with complete tool list
    const getAdAccountsSuccessDataSchema = z.object({
      adAccounts: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            currency: z.string(),
            timezone: z.string(),
            businessId: z.string().nullable(),
            permissions: z.array(z.string()),
          })
        )
        .describe('A list of ad accounts.'),
    });

    createMcpTool(
      this.server,
      'get_ad_accounts',
      {
        title: 'Get Meta Ad Accounts',
        description:
          'Retrieve all accessible ad accounts with details including permissions. This is usually the first call to make.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe('Optional specific ad account ID to retrieve'),
        },
        successDataSchema: getAdAccountsSuccessDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdAccounts(authPayload, params),
      'Successfully retrieved ad accounts with permissions and context.',
      { attachPrompts: true, toolNames: allToolNames }
    );

    const selectAdAccountSuccessDataSchema = z.object({
      selectedAccount: z.string(),
    });

    createMcpTool(
      this.server,
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
        successDataSchema: selectAdAccountSuccessDataSchema,
      },
      async (authPayload, params) => {
        const { adAccountId } = params;

        logger.info('Executing select_ad_account', { userId: authPayload.userId, adAccountId });

        await accountManager.selectAccount(authPayload.userId, adAccountId);

        return {
          selectedAccount: adAccountId,
        };
      },
      'Successfully selected ad account.'
    );

    logger.info('Registered main MCP tools', { count: 2 });
  }
}
