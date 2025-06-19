import { desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { db, withUserContext } from '../../db/client.js';
import { adAccounts, oauthTokens, users } from '../../db/schema.js';
import { MetaAdAccountResponseSchema } from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { AuthenticationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { MetaApiService } from './ApiService.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

export class MetaAdAccountHandler {
  private extractAccountData(acc: z.infer<typeof MetaAdAccountResponseSchema>) {
    // Extract and validate required fields from the flexible schema
    const id = typeof acc.id === 'string' ? acc.id : String(acc.id ?? '');
    const name = typeof acc.name === 'string' ? acc.name : String(acc.name ?? '');
    const accountStatus =
      typeof acc.account_status === 'string' || typeof acc.account_status === 'number'
        ? String(acc.account_status)
        : 'UNKNOWN';
    const currency = typeof acc.currency === 'string' ? acc.currency : 'USD';
    const timezoneName = typeof acc.timezone_name === 'string' ? acc.timezone_name : 'UTC';

    // Handle business object which might be complex
    let businessId: string | undefined;
    if (acc.business && typeof acc.business === 'object' && 'id' in acc.business) {
      businessId =
        typeof acc.business.id === 'string' ? acc.business.id : String(acc.business.id ?? '');
    }

    return {
      id,
      name,
      status: accountStatus,
      currency,
      timezone: timezoneName,
      businessId,
    };
  }

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
        MetaAdAccountSDK.Fields.business,
      ];

      // The SDK does not ship with TypeScript definitions, so we cast here to unknown
      // and validate using Zod schemas
      const metaAccountsCursor = await new MetaUserSDK('me').getAdAccounts(fields);
      const rawAccounts = metaAccountsCursor as unknown;

      // Validate each account using the auto-generated schema
      const validatedAccounts: z.infer<typeof MetaAdAccountResponseSchema>[] = [];
      if (Array.isArray(rawAccounts)) {
        for (const account of rawAccounts) {
          const result = MetaAdAccountResponseSchema.safeParse(account);
          if (result.success) {
            validatedAccounts.push(result.data);
          } else {
            logger.warn('Skipping invalid ad account data received from Meta API', {
              accountId: (account as { id?: string }).id || 'Unknown ID',
              errors: result.error.errors,
            });
          }
        }
      }

      const accountsToStore = await Promise.all(
        validatedAccounts.map(async (acc) => {
          const accountData = this.extractAccountData(acc);

          const permissions = await MetaApiService.fetchAdAccountPermissions(
            accountData.id,
            accessToken,
            metaUserId,
            authPayload.userId
          );

          return {
            ...accountData,
            permissions,
          };
        })
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
              businessId: sql`excluded.businessId`,
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
