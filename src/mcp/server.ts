import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { JWTPayload } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { env } from '../utils/env.js';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { NotFoundError, AuthenticationError } from '../utils/errors.js';
import { initializeMetaApi, handleMetaApiCall } from '../tools/metaApi.js';
import { User as MetaUserSDK, AdAccount as MetaAdAccountSDK, Campaign as MetaCampaignSDK } from 'facebook-nodejs-business-sdk';

// Use import.meta.url to safely resolve file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDir = path.resolve(__dirname, '../prompts');

class BambooMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
    this.registerResources();
    this.registerTools();
  }

  // --- Resource Registration ---
  private registerResources() {
    // Register system prompt resource
    this.server.resource(
      'system-prompt',
      'bamboo://prompts/system',
      {
        description: "The system prompt for the AI agent",
        mimeType: "text/plain"
      },
      async (uri, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Reading system prompt resource', { userId: authPayload.userId, uri: uri.href });
        
        try {
          const text = await fs.readFile(path.join(promptsDir, 'system_prompt.txt'), 'utf-8');
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'text/plain',
              text
            }]
          };
        } catch (error) {
          logger.error('Failed to read system prompt', { error });
          throw new NotFoundError('System prompt resource');
        }
      }
    );
    
    // Register best practices resource
    this.server.resource(
      'best-practices',
      'bamboo://prompts/best-practices',
      {
        description: "Meta Ads best practices document",
        mimeType: "text/markdown"
      },
      async (uri, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Reading best practices resource', { userId: authPayload.userId, uri: uri.href });
        
        try {
          const text = await fs.readFile(path.join(promptsDir, 'best_practices.md'), 'utf-8');
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'text/markdown',
              text
            }]
          };
        } catch (error) {
          logger.error('Failed to read best practices', { error });
          throw new NotFoundError('Best practices resource');
        }
      }
    );
    
    logger.info('MCP resources registered using modern API', { count: 2 });
  }

  // --- Tool Registration ---
  private registerTools() {
    // Register get_ad_accounts tool
    this.server.registerTool(
      'get_ad_accounts',
      {
        description: 'Retrieves all ad accounts accessible by the user.',
        inputSchema: {},
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Executing get_ad_accounts', { userId: authPayload.userId, params });
        
        await initializeMetaApi(authPayload.userId);

        return await handleMetaApiCall(async () => {
          const fields = [
            MetaAdAccountSDK.Fields.id,
            MetaAdAccountSDK.Fields.name,
            MetaAdAccountSDK.Fields.account_status,
            MetaAdAccountSDK.Fields.currency,
            MetaAdAccountSDK.Fields.timezone_name,
          ];
          
          const metaAccounts = await new MetaUserSDK('me').getAdAccounts(fields);

          // Fetch permissions for each account
          const accountsToStore = await Promise.all(
            metaAccounts.map(async (acc: any) => {
              let permissions = ['UNKNOWN'];
              
              try {
                // Get the current user's role on this ad account
                const users = await new MetaAdAccountSDK(acc.id).getUsers(['id', 'role']);
                const currentUser = await new MetaUserSDK('me').get(['id']);
                const userRole = users.find((u: any) => u.id === currentUser.id);
                
                if (userRole) {
                  permissions = [userRole.role];
                }
              } catch (error) {
                logger.warn('Failed to fetch permissions for ad account', { 
                  accountId: acc.id, 
                  error: error instanceof Error ? error.message : 'Unknown error' 
                });
              }
              
              return {
                id: acc.id,
                name: acc.name,
                status: acc.account_status,
                currency: acc.currency,
                timezone: acc.timezone_name,
                permissions,
              };
            })
          );

          // Store in database  
          await withUserContext(authPayload.userId, async () => {
            await db.insert(adAccounts)
              .values(accountsToStore.map(acc => ({
                ...acc,
                userId: authPayload.userId,
              })))
              .onConflictDoUpdate({
                target: [adAccounts.id, adAccounts.userId],
                set: {
                  name: sql`excluded.name`,
                  status: sql`excluded.status`,
                  currency: sql`excluded.currency`,
                  timezone: sql`excluded.timezone`,
                  permissions: sql`excluded.permissions`,
                },
              });
          });

          logger.info('Ad accounts retrieved and stored', { count: accountsToStore.length });
          return {
            content: [{ type: 'text', text: JSON.stringify(accountsToStore, null, 2) }],
          };
        });
      }
    );

    // Register get_campaigns tool
    this.server.registerTool(
      'get_campaigns',
      {
        description: 'Retrieves all campaigns for a specific ad account.',
        inputSchema: {
          adAccountId: z.string().describe("The ID of the ad account (e.g., 'act_12345')."),
        },
      },
      async (params, extra) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Executing get_campaigns', { userId: authPayload.userId, params });
        
        await initializeMetaApi(authPayload.userId);

        return await handleMetaApiCall(async () => {
          const fields = [
            MetaCampaignSDK.Fields.id,
            MetaCampaignSDK.Fields.name,
            MetaCampaignSDK.Fields.status,
            MetaCampaignSDK.Fields.effective_status,
            MetaCampaignSDK.Fields.objective,
            MetaCampaignSDK.Fields.created_time,
            MetaCampaignSDK.Fields.updated_time,
            MetaCampaignSDK.Fields.daily_budget,
            MetaCampaignSDK.Fields.lifetime_budget,
            MetaCampaignSDK.Fields.bid_strategy,
            MetaCampaignSDK.Fields.budget_remaining,
            MetaCampaignSDK.Fields.spend_cap,
            MetaCampaignSDK.Fields.configured_status,
            MetaCampaignSDK.Fields.start_time,
            MetaCampaignSDK.Fields.stop_time,
          ];

          const campaigns = await new MetaAdAccountSDK(params.adAccountId).getCampaigns(fields);

          const campaignData = campaigns.map((campaign: any) => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            effective_status: campaign.effective_status,
            objective: campaign.objective,
            created_time: campaign.created_time,
            updated_time: campaign.updated_time,
            daily_budget: campaign.daily_budget,
            lifetime_budget: campaign.lifetime_budget,
            bid_strategy: campaign.bid_strategy,
            budget_remaining: campaign.budget_remaining,
            spend_cap: campaign.spend_cap,
            configured_status: campaign.configured_status,
            start_time: campaign.start_time,
            stop_time: campaign.stop_time,
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify(campaignData, null, 2) }],
          };
        });
      }
    );

    logger.info('MCP tools registered using modern API', { count: 2 });
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
      // This should not happen in normal operation as auth is handled in transport
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
  bambooServer.runStdio().catch(error => {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  });
} 