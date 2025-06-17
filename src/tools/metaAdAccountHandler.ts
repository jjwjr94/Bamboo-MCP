import { sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import { db, withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import type { JWTPayload } from '../types/auth.js';
import type { MetaAdAccount } from '../types/meta.js';
import { logger } from '../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './metaApi.js';

export class MetaAdAccountHandler {
  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
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

      // The SDK does not ship with TypeScript definitions, so we cast here to a
      // minimal interface capturing only the properties we care about.
      const metaAccountsCursor = await new MetaUserSDK('me').getAdAccounts(fields);
      const metaAccounts = metaAccountsCursor as unknown as MetaAdAccount[];

      // Fetch permissions for each account
      const accountsToStore = await Promise.all(
        metaAccounts.map(
          async (acc: {
            id: string;
            name: string;
            account_status: string | number;
            currency: string;
            timezone_name: string;
          }) => {
            let permissions = ['UNKNOWN'];

            try {
              const usersCursor = await new MetaAdAccountSDK(acc.id).getUsers(['id', 'role']);
              const users = usersCursor as unknown as Array<{
                id: string;
                role: string;
              }>;
              const currentUser = await new MetaUserSDK('me').get(['id']);
              const userRole = users.find((u) => u.id === currentUser.id);

              if (userRole) {
                permissions = [userRole.role];
              }
            } catch (error) {
              logger.warn('Failed to fetch permissions for ad account', {
                accountId: acc.id,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }

            return {
              id: acc.id,
              name: acc.name,
              status: String(acc.account_status),
              currency: acc.currency,
              timezone: acc.timezone_name,
              permissions,
            };
          }
        )
      );

      // Store in database
      await withUserContext(authPayload.userId, async () => {
        await db
          .insert(adAccounts)
          .values(
            accountsToStore.map((acc) => ({
              ...acc,
              userId: authPayload.userId,
            }))
          )
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
        structuredContent: { accounts: accountsToStore },
        content: [{ type: 'text' as const, text: JSON.stringify(accountsToStore, null, 2) }],
      };
    });
  }
}
