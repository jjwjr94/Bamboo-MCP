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

import { createMcpTool } from './registryHelper.js';

// Schemas for main tools
export const GetAdAccountsInputSchema = z.object({
  adAccountId: z.string().optional().describe('Optional specific ad account ID to retrieve'),
});

export const SelectAdAccountInputSchema = z.object({
  adAccountId: z.string().describe("The ID of the ad account to select (e.g., 'act_12345')"),
});

export const GetToolManifestInputSchema = z.object({});

// Export inferred types
export type GetAdAccountsRequest = z.infer<typeof GetAdAccountsInputSchema>;
export type SelectAdAccountRequest = z.infer<typeof SelectAdAccountInputSchema>;
export type GetToolManifestRequest = z.infer<typeof GetToolManifestInputSchema>;

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

    ];
  }

  public register(): string[] {
    const subRegistryToolNames = this.registerSubRegistries();
    const mainToolNames = this.getMainToolNames();
    this.validateNoDuplicateMainTools(subRegistryToolNames, mainToolNames);

    const allToolNames = [...mainToolNames, ...subRegistryToolNames];
    this.registerMainTools(allToolNames);

    logger.info('Registered main MCP tools', { count: mainToolNames.length });
    return allToolNames;
  }

  private registerSubRegistries(): string[] {
    const allRegisteredToolNames = new Set<string>();
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

        this.checkForDuplicateTools(registeredNames, allRegisteredToolNames, registryName);
        subRegistryToolNames.push(...registeredNames);
        totalToolsRegistered += registry.getToolCount();
      } catch (error) {
        logger.error(`Failed to register tool registry: ${registryName}`, {
          registry: registryName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error; // Re-throw to prevent partial initialization
      }
    }

    logger.info(
      `Registry registration complete. Total sub-tools registered: ${totalToolsRegistered}`
    );
    return subRegistryToolNames;
  }

  private checkForDuplicateTools(
    registeredNames: string[],
    allRegisteredToolNames: Set<string>,
    registryName: string
  ): void {
    for (const name of registeredNames) {
      if (allRegisteredToolNames.has(name)) {
        throw new Error(`Duplicate tool name detected: '${name}' from registry '${registryName}'.`);
      }
      allRegisteredToolNames.add(name);
    }
  }

  private getMainToolNames(): string[] {
    return ['get_ad_accounts', 'select_ad_account', 'get_tool_manifest'];
  }

  private validateNoDuplicateMainTools(
    subRegistryToolNames: string[],
    mainToolNames: string[]
  ): void {
    const subToolSet = new Set(subRegistryToolNames);
    for (const mainTool of mainToolNames) {
      if (subToolSet.has(mainTool)) {
        throw new Error(`Main tool name '${mainTool}' conflicts with a sub-registry tool.`);
      }
    }
  }

  private registerMainTools(allToolNames: string[]): void {
    this.registerGetAdAccounts(allToolNames);
    this.registerSelectAdAccount();
    this.registerGetToolManifest(allToolNames);
  }

  private registerGetAdAccounts(allToolNames: string[]): void {
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
        inputSchema: GetAdAccountsInputSchema,
        successDataSchema: getAdAccountsSuccessDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdAccounts(authPayload, params),
      'Successfully retrieved ad accounts with permissions and context.',
      { attachPrompts: true, toolNames: allToolNames }
    );
  }

  private registerSelectAdAccount(): void {
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
        inputSchema: SelectAdAccountInputSchema,
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
  }

  private registerGetToolManifest(allToolNames: string[]): void {
    const getToolManifestSuccessDataSchema = z.object({
      tools: z.array(z.string()).describe('A list of all available tool names.'),
      totalCount: z.number().describe('Total number of available tools.'),
    });

    createMcpTool(
      this.server,
      'get_tool_manifest',
      {
        title: 'Get Tool Manifest',
        description: 'Retrieves a comprehensive list of all available tools that can be called.',
        inputSchema: GetToolManifestInputSchema,
        successDataSchema: getToolManifestSuccessDataSchema,
      },
      async () => {
        const sortedToolNames = allToolNames.sort();
        return {
          tools: sortedToolNames,
          totalCount: sortedToolNames.length,
        };
      },
      'Successfully retrieved the tool manifest.'
    );
  }
}
