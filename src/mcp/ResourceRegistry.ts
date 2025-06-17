import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eq } from 'drizzle-orm';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import type { JWTPayload } from '../types/index.js';
import { env } from '../utils/env.js';
import { AuthenticationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Use import.meta.url to safely resolve file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDir = path.resolve(__dirname, '../prompts');

export class ResourceRegistry {
  private server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  private extractAuthPayload(extra: unknown): JWTPayload {
    // Extract auth payload from the request context in a type-safe way
    const authPayload = (extra as { authInfo?: { extra?: { authPayload?: JWTPayload } } })?.authInfo
      ?.extra?.authPayload;

    if (authPayload) {
      return authPayload;
    }

    // Development mode fallback
    if (env.NODE_ENV === 'development') {
      logger.warn('No auth payload found, using development fallback');
      throw new AuthenticationError('Authentication required');
    }

    throw new AuthenticationError('Authorization required');
  }

  public register() {
    // Register system prompt resource
    this.server.registerResource(
      'system-prompt',
      'bamboo://prompts/system',
      {
        title: 'System Prompt',
        description: 'The system prompt for the AI agent',
        mimeType: 'text/plain',
      },
      async (uri: URL, extra: unknown) => {
        const authPayload = this.extractAuthPayload(extra);
        logger.info('Reading system prompt resource', {
          userId: authPayload.userId,
          uri: uri.href,
        });

        try {
          const text = await fs.readFile(path.join(promptsDir, 'system_prompt.md'), 'utf-8');
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
      async (uri: URL, extra: unknown) => {
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
        list: async (extra: unknown) => {
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
      async (uri: URL, ...rest: unknown[]) => {
        // Support both (uri, extra) and (uri, variables, extra) signatures
        let variables: Record<string, string> | undefined;
        let extra: unknown;

        if (rest.length === 1) {
          // Signature: (uri, extra)
          [extra] = rest;
        } else {
          // Signature: (uri, variables, extra)
          [variables, extra] = rest as [Record<string, string>, unknown];
        }

        const authPayload = this.extractAuthPayload(extra);
        const accountId = variables?.accountId;

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
}
