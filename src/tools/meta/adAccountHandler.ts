import { desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import { db, withUserContext } from '../../db/client.js';
import { adAccounts, oauthTokens, users } from '../../db/schema.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { MetaAdAccount } from '../../types/meta.js';
import { AuthenticationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { MetaApiService } from './ApiService.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

export class MetaAdAccountHandler {
  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
    logger.info('Executing get_ad_accounts', { userId: authPayload.userId, params });

    await initializeMetaApi(authPayload.userId);

    // Fetch the user's most recent access token and their Meta ID
    const tokenAndMetaId = await withUserContext(authPayload.userId, async (tx) => {
      return await tx
        .select({
          accessToken: oauthTokens.accessToken,
          metaUserId: users.facebookUserId,
        })
        .from(oauthTokens)
        .innerJoin(users, eq(oauthTokens.userId, users.id))
        .where(eq(oauthTokens.userId, authPayload.userId))
        .orderBy(desc(oauthTokens.createdAt))
        .limit(1);
    });

    // Validate that the required information was found
    if (!tokenAndMetaId.length || !tokenAndMetaId[0].accessToken || !tokenAndMetaId[0].metaUserId) {
      throw new AuthenticationError(
        'Could not find a valid Meta access token or Meta User ID for the user.'
      );
    }
    const { accessToken, metaUserId } = tokenAndMetaId[0];

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
            // Fetch real permissions using the new MetaApiService method
            const permissions = await MetaApiService.fetchAdAccountPermissions(
              acc.id,
              accessToken,
              metaUserId
            );

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
      return createMcpSuccessResult(
        { accounts: accountsToStore },
        `Retrieved ${accountsToStore.length} ad accounts`
      );
    });
  }
}
