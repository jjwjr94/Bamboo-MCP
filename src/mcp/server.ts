import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs/promises';
import { z } from 'zod';

import { eq } from 'drizzle-orm';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { MetaToolsHandler } from '../tools/metaToolsHandler.js';
import type { JWTPayload } from '../types/index.js';
import { accountManager } from '../utils/accountManager.js';
import { env } from '../utils/env.js';
import { AuthenticationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Use import.meta.url to safely resolve file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDir = path.resolve(__dirname, '../prompts');

// Define the schema for the call_meta_api tool
const CallMetaApiSchema = z.object({
  endpoint: z.string().describe("API endpoint (e.g., 'me/adaccounts', 'act_123/campaigns')"),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
  fields: z.array(z.string()).optional().describe('Fields to retrieve (for GET requests)'),
  parameters: z.record(z.any()).optional().describe('Parameters or data to send'),
});

class BambooMCPServer {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor() {
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      { capabilities: { tools: {}, resources: { subscribe: false } } }
    );
    this.toolsHandler = new MetaToolsHandler();
    this.registerResources();
    this.registerTools();
  }

  // --- Resource Registration ---
  private registerResources() {
    // Register system prompt resource
    this.server.registerResource(
      'system-prompt',
      'bamboo://prompts/system',
      {
        title: 'System Prompt',
        description: 'The system prompt for the AI agent',
        mimeType: 'text/plain',
      },
      async (uri: any, extra: any) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Reading system prompt resource', {
          userId: authPayload.userId,
          uri: uri.href,
        });

        try {
          const text = await fs.readFile(path.join(promptsDir, 'system_prompt.txt'), 'utf-8');
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'text/plain',
                text,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to read system prompt', { error });
          throw new NotFoundError('System prompt resource');
        }
      }
    );

    // Register best practices resource
    this.server.registerResource(
      'best-practices',
      'bamboo://prompts/best-practices',
      {
        title: 'Best Practices',
        description: 'Meta Ads best practices document',
        mimeType: 'text/markdown',
      },
      async (uri: any, extra: any) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Reading best practices resource', {
          userId: authPayload.userId,
          uri: uri.href,
        });

        try {
          const text = await fs.readFile(path.join(promptsDir, 'best_practices.md'), 'utf-8');
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'text/markdown',
                text,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to read best practices', { error });
          throw new NotFoundError('Best practices resource');
        }
      }
    );

    // Register dynamic ad account resource template
    this.server.registerResource(
      'ad-account',
      new ResourceTemplate('bamboo://ad-accounts/{accountId}', {
        list: async (extra: any) => {
          const authPayload = this.extractAuthPayload(extra);
          logger.info('Listing ad account resources', { userId: authPayload.userId });

          try {
            // Fetch user's ad accounts from database
            const userAdAccounts = await withUserContext(authPayload.userId, () =>
              db.select().from(adAccounts)
            );

            return {
              resources: userAdAccounts.map((account) => ({
                uri: `bamboo://ad-accounts/${account.id}`,
                name: 'ad-account',
                title: `Ad Account: ${account.name}`,
                description: `Data for ad account: ${account.name} (${account.id})`,
                mimeType: 'application/json',
              })),
            };
          } catch (error) {
            logger.error('Failed to list ad account resources', { error });
            return { resources: [] };
          }
        },
      }),
      {
        title: 'Ad Account',
        description: 'Data for an individual ad account',
        mimeType: 'application/json',
      },
      async (uri: any, variables: any, extra: any) => {
        const authPayload = this.extractAuthPayload(extra);
        const { accountId } = variables;

        logger.info('Reading ad account resource', {
          userId: authPayload.userId,
          accountId,
          uri: uri.href,
        });

        try {
          // Fetch the specific ad account from database
          const account = await withUserContext(authPayload.userId, async () => {
            const result = await db
              .select()
              .from(adAccounts)
              .where(eq(adAccounts.id, accountId as string))
              .limit(1);
            return result[0];
          });

          if (!account) {
            throw new NotFoundError(`Ad account ${accountId} not found`);
          }

          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify(account, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to read ad account resource', {
            accountId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          throw new NotFoundError(`Ad account resource ${accountId}`);
        }
      }
    );

    logger.info('MCP resources registered using modern API', { count: 3 });
  }

  // --- Tool Registration ---
  private registerTools() {
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
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.getAdAccounts(authPayload, params);
      }
    );

    // Register get_campaigns tool
    this.server.registerTool(
      'get_campaigns',
      {
        title: 'Get Campaigns',
        description:
          'Retrieves all campaigns for a specific ad account. If no adAccountId is provided, uses the previously selected account or auto-selects if only one account is available.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        },
        outputSchema: {
          campaigns: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                status: z.string(),
                effective_status: z.string(),
                objective: z.string(),
                created_time: z.string().optional(),
                updated_time: z.string().optional(),
                daily_budget: z.string().optional(),
                lifetime_budget: z.string().optional(),
                bid_strategy: z.string().optional(),
                budget_remaining: z.string().optional(),
                spend_cap: z.string().optional(),
                configured_status: z.string().optional(),
                start_time: z.string().optional(),
                stop_time: z.string().optional(),
              })
            )
            .describe('A list of campaigns.'),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.getCampaigns(authPayload, params);
      }
    );

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
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.callMetaApi(authPayload, params);
      }
    );

    // Register create campaign tool
    this.server.registerTool(
      'create_campaign',
      {
        title: 'Create Campaign',
        description: 'Creates a new advertising campaign.',
        inputSchema: z.object({
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          name: z.string().describe('The name of the campaign.'),
          objective: z
            .enum([
              'OUTCOME_TRAFFIC',
              'OUTCOME_ENGAGEMENT',
              'OUTCOME_LEADS',
              'OUTCOME_SALES',
              'OUTCOME_APP_PROMOTION',
              'OUTCOME_AWARENESS',
            ])
            .describe('The campaign objective.'),
          status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('The campaign status.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Lifetime budget in cents (e.g., 10000 = $100.00).'),
          specialAdCategories: z
            .array(z.string())
            .optional()
            .describe('Special ad categories if applicable.'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          name: z.string(),
          objective: z.string(),
          status: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.createCampaign(authPayload, params);
      }
    );

    // Register update campaign tool
    this.server.registerTool(
      'update_campaign',
      {
        title: 'Update Campaign',
        description: 'Updates an existing campaign.',
        inputSchema: z.object({
          campaignId: z.string().describe('The ID of the campaign to update.'),
          name: z.string().optional().describe('New name for the campaign.'),
          status: z
            .enum(['ACTIVE', 'PAUSED', 'DELETED'])
            .optional()
            .describe('New status for the campaign.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New lifetime budget in cents (e.g., 10000 = $100.00).'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          updatedFields: z.array(z.string()),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.updateCampaign(authPayload, params);
      }
    );

    // Register delete campaign tool
    this.server.registerTool(
      'delete_campaign',
      {
        title: 'Delete Campaign',
        description: 'Deletes a campaign (sets status to DELETED).',
        inputSchema: z.object({
          campaignId: z.string().describe('The ID of the campaign to delete.'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          campaignId: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.deleteCampaign(authPayload, params);
      }
    );

    // Register get ad sets tool
    this.server.registerTool(
      'get_adsets',
      {
        title: 'Get Ad Sets',
        description: 'Retrieves ad sets for a campaign or ad account.',
        inputSchema: z.object({
          campaignId: z.string().optional().describe('The ID of the campaign to get ad sets from.'),
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        }).shape,
        outputSchema: {
          adSets: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                status: z.string(),
                effective_status: z.string().optional(),
                configured_status: z.string().optional(),
                created_time: z.string().optional(),
                updated_time: z.string().optional(),
                start_time: z.string().optional().nullable(),
                end_time: z.string().optional().nullable(),
                daily_budget: z.string().optional(),
                lifetime_budget: z.string().optional(),
                budget_remaining: z.string().optional(),
                billing_event: z.string().optional(),
                optimization_goal: z.string().optional(),
                bid_amount: z.number().optional().nullable(),
                targeting: z.any().optional(),
                attribution_spec: z.any().optional(),
                promoted_object: z.any().optional(),
              })
            )
            .describe('A list of ad sets.'),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.getAdSets(authPayload, params);
      }
    );

    // Register create ad set tool
    this.server.registerTool(
      'create_adset',
      {
        title: 'Create Ad Set',
        description: 'Creates a new ad set within a campaign.',
        inputSchema: z.object({
          campaignId: z.string().describe('The ID of the campaign to create the ad set in.'),
          name: z.string().describe('The name of the ad set.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Lifetime budget in cents (e.g., 10000 = $100.00).'),
          targeting: z
            .object({
              geoLocations: z
                .object({
                  countries: z.array(z.string()).optional(),
                  regions: z.array(z.object({ key: z.string() })).optional(),
                  cities: z.array(z.object({ key: z.string() })).optional(),
                })
                .optional(),
              ageMin: z.number().int().min(13).max(65).optional(),
              ageMax: z.number().int().min(13).max(65).optional(),
              genders: z
                .array(z.enum(['1', '2']))
                .optional()
                .describe('1 = male, 2 = female'),
              interests: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              behaviors: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              customAudiences: z.array(z.object({ id: z.string() })).optional(),
              excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
            })
            .describe('Targeting criteria for the ad set.'),
          billingEvent: z
            .enum(['LINK_CLICKS', 'IMPRESSIONS', 'REACH', 'THRUPLAY', 'LANDING_PAGE_VIEWS'])
            .describe('Billing event for the ad set.'),
          optimizationGoal: z
            .enum([
              'LINK_CLICKS',
              'IMPRESSIONS',
              'REACH',
              'LANDING_PAGE_VIEWS',
              'LEAD_GENERATION',
              'CONVERSIONS',
              'THRUPLAY',
            ])
            .describe('Optimization goal for the ad set.'),
          bidAmount: z.number().int().positive().optional().describe('Bid amount in cents.'),
          startTime: z.string().optional().describe('Start time in ISO format.'),
          endTime: z.string().optional().describe('End time in ISO format.'),
          status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('The ad set status.'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          adSetId: z.string(),
          name: z.string(),
          campaignId: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.createAdSet(authPayload, params);
      }
    );

    // Register update ad set tool
    this.server.registerTool(
      'update_adset',
      {
        title: 'Update Ad Set',
        description: 'Updates an existing ad set.',
        inputSchema: z.object({
          adSetId: z.string().describe('The ID of the ad set to update.'),
          name: z.string().optional().describe('New name for the ad set.'),
          status: z
            .enum(['ACTIVE', 'PAUSED', 'DELETED'])
            .optional()
            .describe('New status for the ad set.'),
          dailyBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New daily budget in cents (e.g., 1000 = $10.00).'),
          lifetimeBudget: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('New lifetime budget in cents (e.g., 10000 = $100.00).'),
          bidAmount: z.number().int().positive().optional().describe('New bid amount in cents.'),
          startTime: z.string().optional().describe('New start time in ISO format.'),
          endTime: z.string().optional().describe('New end time in ISO format.'),
          targeting: z
            .object({
              geoLocations: z
                .object({
                  countries: z.array(z.string()).optional(),
                  regions: z.array(z.object({ key: z.string() })).optional(),
                  cities: z.array(z.object({ key: z.string() })).optional(),
                })
                .optional(),
              ageMin: z.number().int().min(13).max(65).optional(),
              ageMax: z.number().int().min(13).max(65).optional(),
              genders: z.array(z.enum(['1', '2'])).optional(),
              interests: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              behaviors: z
                .array(z.object({ id: z.string(), name: z.string().optional() }))
                .optional(),
              customAudiences: z.array(z.object({ id: z.string() })).optional(),
              excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
            })
            .optional()
            .describe('New targeting criteria for the ad set.'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          adSetId: z.string(),
          updatedFields: z.array(z.string()),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.updateAdSet(authPayload, params);
      }
    );

    // Register delete ad set tool
    this.server.registerTool(
      'delete_adset',
      {
        title: 'Delete Ad Set',
        description: 'Deletes an ad set (sets status to DELETED).',
        inputSchema: z.object({
          adSetId: z.string().describe('The ID of the ad set to delete.'),
        }).shape,
        outputSchema: {
          success: z.boolean(),
          adSetId: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        return this.toolsHandler.deleteAdSet(authPayload, params);
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
        const authPayload = this.extractAuthPayload(extra);
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

    logger.info('MCP tools registered using modern API', { count: 10 });
  }

  // --- Helper Methods ---
  private extractAuthPayload(extra: any): JWTPayload {
    // Extract auth payload from the request context
    const authInfo = extra?.authInfo;
    if (authInfo?.extra?.authPayload) {
      return authInfo.extra.authPayload as JWTPayload;
    }

    // Development mode fallback
    if (env.NODE_ENV === 'development') {
      logger.warn('No auth payload found, using development fallback');

      throw new AuthenticationError('Authentication required');
    }

    throw new AuthenticationError('Authorization required');
  }

  // --- Server Management ---
  public getServer(): McpServer {
    return this.server;
  }

  public async runStdio() {
    logger.info('Starting MCP server in stdio mode');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server stdio transport connected');
  }
}

// Create and export server instance
const bambooServer = new BambooMCPServer();
export { bambooServer };

// --- Stdio entry point ---
if (import.meta.url === `file://${process.argv[1]}`) {
  bambooServer.runStdio().catch((error) => {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  });
}
