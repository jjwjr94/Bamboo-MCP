import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eq } from 'drizzle-orm';
import { extractAuthPayload } from '../auth/mcpAuthUtils.js';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class ResourceRegistry {
  private server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  public register() {
    // Register dynamic ad account resource template
    this.server.registerResource(
      'ad-account',
      new ResourceTemplate('bamboo://ad-accounts/{accountId}', {
        list: async (extra: unknown) => {
          const authPayload = extractAuthPayload(extra);
          logger.info('Listing ad account resources', { userId: authPayload.userId });

          try {
            // Fetch user's ad accounts from database
            const userAdAccounts = await withUserContext(authPayload.userId, () =>
              db.select().from(adAccounts)
            );

            return {
              resources: userAdAccounts.map((account) => ({
                uri: `bamboo://ad-accounts/${account.id}`,
                name: `ad-account-${account.id}`,
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

        const authPayload = extractAuthPayload(extra);
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

    logger.info('MCP resources registered using modern API', { count: 1 });
  }
}
