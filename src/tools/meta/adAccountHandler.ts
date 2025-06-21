import { and, desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { withUserContext } from '../../db/client.js';
import { adAccounts, oauthTokens, users } from '../../db/schema.js';
import { MetaAdAccountResponseSchema } from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { MetaAdAccountAssignedUsersResponse } from '../../types/meta.js';
import { env } from '../../utils/env.js';
import { TokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  createPermissionsFetchRequest,
  executeBatchRequests,
} from '../../utils/metaBatchHelper.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { BatchResponse } from '../../utils/metaBatchHelper.js';

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

  private extractPermissionsFromBatchResponse(
    response: BatchResponse | undefined,
    metaUserId: string,
    adAccountId: string
  ): string[] {
    const defaultPermissions = ['UNKNOWN'];

    if (!response || response.code !== 200 || !response.body) {
      logger.error('Failed batch request for ad account permissions', {
        adAccountId,
        responseCode: response?.code,
      });
      return defaultPermissions;
    }

    try {
      const permissionData = JSON.parse(response.body) as MetaAdAccountAssignedUsersResponse;
      const userPermissions = permissionData.data?.find((user) => user.id === metaUserId);

      if (userPermissions?.tasks && userPermissions.tasks.length > 0) {
        return userPermissions.tasks;
      }

      logger.warn('User not found in batch permissions response or no tasks assigned', {
        adAccountId,
        metaUserId,
      });
      return defaultPermissions;
    } catch (error) {
      logger.error('Failed to parse permissions from batch response', {
        adAccountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return defaultPermissions;
    }
  }

  private async handleAccountPermissionUpdate(
    tx: any,
    accountData: { id: string; [key: string]: unknown },
    response: BatchResponse | undefined,
    metaUserId: string,
    userId: string
  ) {
    const permissions = this.extractPermissionsFromBatchResponse(
      response,
      metaUserId,
      accountData.id
    );

    // Update the permissions for the specific ad account within the transaction.
    await tx
      .update(adAccounts)
      .set({ permissions })
      .where(and(eq(adAccounts.id, accountData.id), eq(adAccounts.userId, userId)));

    return {
      ...accountData,
      permissions,
    };
  }

  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
    logger.info('Executing get_ad_accounts', { userId: authPayload.userId, params });

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
      throw new TokenError(
        'Could not find a valid Meta access token or Meta User ID for the user.'
      );
    }
    const { accessToken, metaUserId } = tokenAndMetaId[0];

    return await handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      const fields = [
        MetaAdAccountSDK.Fields.id,
        MetaAdAccountSDK.Fields.name,
        MetaAdAccountSDK.Fields.account_status,
        MetaAdAccountSDK.Fields.currency,
        MetaAdAccountSDK.Fields.timezone_name,
        MetaAdAccountSDK.Fields.business,
      ];

      // Get ad accounts using the SDK with proper pagination and request-scoped API instance
      const adAccountsCursor = await new MetaUserSDK('me', {}, null, api).getAdAccounts(fields);

      // Use the common pagination utility to handle all edge cases
      const allRawAccounts = await fetchAllPaginatedData<unknown>({
        cursor: adAccountsCursor,
        limit: env.META_MAX_AD_ACCOUNTS_TO_FETCH,
        entityName: 'ad accounts',
        userId: authPayload.userId,
      });

      // Validate each account using the auto-generated schema
      const validatedAccounts: z.infer<typeof MetaAdAccountResponseSchema>[] = [];
      for (const account of allRawAccounts) {
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

      const accountsToStore = await withUserContext(authPayload.userId, async (tx) => {
        if (validatedAccounts.length === 0) {
          return [];
        }

        // Extract data once to use in both phases
        const extractedAccounts = validatedAccounts.map((acc) => this.extractAccountData(acc));

        // --- Phase 1: Insert/Update basic account info ---
        // This phase is critical for resolving a circular dependency. Some ad accounts
        // are business-managed and require a 'business' parameter to fetch permissions.
        // By first storing the basic account info (including businessId), we ensure
        // the business context is available in our database for the next phase.
        const basicAccountData = extractedAccounts.map((acc) => ({
          ...acc,
          userId: authPayload.userId,
        }));

        await tx
          .insert(adAccounts)
          .values(basicAccountData)
          .onConflictDoUpdate({
            target: [adAccounts.id, adAccounts.userId],
            set: {
              name: sql`excluded.name`,
              status: sql`excluded.status`,
              currency: sql`excluded.currency`,
              timezone: sql`excluded.timezone`,
              businessId: sql`excluded.business_id`,
              // Note: `permissions` are NOT updated here
            },
          });

        // --- Phase 2: Fetch and update permissions (Optimized with Batching) ---
        // With the basic account info, including businessId, now stored in the database
        // (within this transaction), we can process all accounts with a single batch request.
        // This eliminates the N+1 query problem and dramatically improves performance.

        // 1. Create a batch request for each account's permissions.
        const permissionRequests = extractedAccounts.map((account) =>
          createPermissionsFetchRequest(account.id, account.businessId || undefined)
        );

        // 2. Execute the batch request to fetch all permissions in one API call.
        const batchResponses = await executeBatchRequests(permissionRequests, accessToken);

        // 3. Create a lookup map for efficient response processing.
        const responseMap = new Map(
          batchResponses.map((res) => [
            res.id.replace('permissions_', ''), // Key by ad account ID
            res,
          ])
        );

        // 4. Process each account (ensuring all accounts are included even if permission fetch failed).
        const finalAccountUpdatePromises = extractedAccounts.map((accountData) =>
          this.handleAccountPermissionUpdate(
            tx,
            accountData,
            responseMap.get(accountData.id),
            metaUserId,
            authPayload.userId
          )
        );

        // Await all parallel database operations to complete using Promise.allSettled for resilience
        const permissionUpdateResults = await Promise.allSettled(finalAccountUpdatePromises);

        const finalAccountsWithPermissions = [];
        for (const result of permissionUpdateResults) {
          if (result.status === 'fulfilled') {
            finalAccountsWithPermissions.push(result.value);
          } else {
            // Log the failure for the specific account but don't fail the whole operation
            logger.error('Failed to process permissions for an ad account', {
              userId: authPayload.userId,
              reason: result.reason instanceof Error ? result.reason.message : result.reason,
            });
          }
        }

        return finalAccountsWithPermissions;
      });

      logger.info('Ad accounts retrieved and stored', { count: accountsToStore.length });
      return await createMcpSuccessResult(
        { accounts: accountsToStore },
        `Retrieved ${accountsToStore.length} ad accounts`,
        { attachPrompts: true }
      );
    });
  }
}
