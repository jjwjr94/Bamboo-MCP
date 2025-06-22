import { desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { withUserContext } from '../../db/client.js';
import { adAccounts, oauthTokens, users } from '../../db/schema.js';
import { MetaAdAccountResponseSchema } from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import {
  discoverAndCacheBusinessContext,
  getBusinessIdForAdAccount,
} from '../../utils/businessContextManager.js';
import { env } from '../../utils/env.js';
import { TokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { validateBusinessContextForBatch } from '../../utils/metaBatchHelper.js';
import { AdAccountPermissionsProcessor } from './AdAccountPermissionsProcessor.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { GetAdAccountsResult } from './types.js';

export class MetaAdAccountHandler {
  private extractAccountData(acc: z.infer<typeof MetaAdAccountResponseSchema>) {
    // Basic field extraction with graceful fallbacks
    const id = String(acc.id ?? '');
    const name = String(acc.name ?? '');
    const status = acc.account_status != null ? String(acc.account_status) : 'UNKNOWN';
    const currency = String(acc.currency ?? 'USD');
    const timezone = String(acc.timezone_name ?? 'UTC');

    // Delegate detailed business-context semantics to a dedicated helper to keep
    // this method focused and under the cognitive-complexity threshold.
    const businessId = this.determineBusinessId(acc.business);

    return {
      id,
      name,
      status,
      currency,
      timezone,
      businessId, // ⚠️  CRITICAL: This value determines Meta API call behavior
    };
  }

  /**
   * Encapsulates the nuanced business-ID extraction logic.
   *
   * Business ID semantics are ESSENTIAL for Meta API compliance:
   *  • string   → Business-managed account (include `business` param)
   *  • null     → Confirmed non-business account (do NOT include param)
   *  • undefined→ Unknown context, triggers discovery
   *
   * ⚠️  DO NOT change these semantics without also updating:
   *   – createPermissionsFetchRequest() in metaBatchHelper.ts
   *   – validateBusinessContextForBatch() logic
   *   – All business context resolution functions
   */
  private determineBusinessId(business: unknown): string | null | undefined {
    if (business && typeof business === 'object' && 'id' in (business as Record<string, unknown>)) {
      const rawId = (business as { id?: unknown }).id;
      return rawId != null ? String(rawId) : undefined;
    }

    // If the business field is explicitly null, this is a non-business account.
    // Otherwise the context is unknown and a discovery process should follow.
    return business === null ? null : undefined;
  }

  /**
   * Retrieves all ad accounts for a user, validates them against the Zod schema
   * and converts them to our internal lightweight representation.
   */
  private async getExtractedAccounts(userId: string) {
    // Step 1: Fetch raw accounts from Meta API
    const api = await createMetaApiInstance(userId);

    const fields = [
      MetaAdAccountSDK.Fields.id,
      MetaAdAccountSDK.Fields.name,
      MetaAdAccountSDK.Fields.account_status,
      MetaAdAccountSDK.Fields.currency,
      MetaAdAccountSDK.Fields.timezone_name,
      MetaAdAccountSDK.Fields.business,
    ];

    const adAccountsCursor = await new MetaUserSDK('me', {}, null, api).getAdAccounts(fields);

    const allRawAccounts = await fetchAllPaginatedData<unknown>({
      cursor: adAccountsCursor,
      limit: env.META_MAX_AD_ACCOUNTS_TO_FETCH,
      entityName: 'ad accounts',
      userId,
    });

    // Step 2: Validate & extract
    const extracted: ReturnType<typeof this.extractAccountData>[] = [];
    for (const account of allRawAccounts) {
      const parsed = MetaAdAccountResponseSchema.safeParse(account);
      if (parsed.success) {
        extracted.push(this.extractAccountData(parsed.data));
      } else {
        logger.warn('Skipping invalid ad account data received from Meta API', {
          accountId: (account as { id?: string }).id || 'Unknown ID',
          errors: parsed.error.errors,
        });
      }
    }

    return extracted;
  }

  /**
   * Ensures that every account in the list has a business context. If it is missing
   * the function will trigger discovery & update the list in-place.
   */
  private async ensureBusinessContext(
    userId: string,
    accessToken: string,
    accounts: Array<ReturnType<typeof this.extractAccountData>>
  ) {
    const validation = validateBusinessContextForBatch(accounts);

    if (validation.isReady || validation.needsDiscovery.length === 0) {
      return; // Nothing to do
    }

    logger.info('Discovering business context for accounts with unknown context', {
      accountsNeedingDiscovery: validation.needsDiscovery,
    });

    await discoverAndCacheBusinessContext(userId, accessToken, validation.needsDiscovery);

    // Refresh business ID where needed
    for (const account of accounts) {
      if (account.businessId === undefined) {
        const resolved = await getBusinessIdForAdAccount(userId, account.id);
        account.businessId = resolved;
        logger.debug('Updated business context after discovery', {
          adAccountId: account.id,
          businessId: resolved,
        });
      }
    }
  }

  /**
   * Orchestrates the full flow of fetching ad accounts, ensuring business context
   * and attaching permissions. Designed to be called inside the Meta API error
   * handling wrapper.
   */
  private async gatherAccountsWithPermissions(
    userId: string,
    accessToken: string,
    metaUserId: string
  ) {
    const accounts = await this.getExtractedAccounts(userId);
    await this.ensureBusinessContext(userId, accessToken, accounts);
    const permissionsProcessor = new AdAccountPermissionsProcessor(userId, accessToken, metaUserId);
    return await permissionsProcessor.attachPermissions(accounts);
  }

  /**
   * Fetches and processes all ad account data from Meta API outside of database transactions.
   */
  private async fetchAndProcessAccountsFromMeta(
    userId: string,
    accessToken: string,
    metaUserId: string
  ) {
    return handleMetaApiCall(
      () => this.gatherAccountsWithPermissions(userId, accessToken, metaUserId),
      {
        toolName: 'get_ad_accounts',
        userId,
      }
    );
  }

  /**
   * Stores the final enriched account data in a single atomic database operation.
   * This method performs a bulk upsert operation that updates all account information
   * including permissions in one transaction to minimize database lock duration.
   *
   * @param userId - Local user ID for security context
   * @param accountsData - Array of enriched account data with permissions
   * @returns Promise resolving to the stored account data
   */
  private async storeFinalAccountData(
    userId: string,
    accountsData: Array<{
      id: string;
      name: string;
      status: string;
      currency: string;
      timezone: string;
      businessId: string | null | undefined;
      permissions: string[];
    }>
  ) {
    if (accountsData.length === 0) {
      return [];
    }

    return withUserContext(userId, async (tx) => {
      const dataToUpsert = accountsData.map((acc) => ({
        ...acc,
        // Ensure businessId is always string | null, never undefined
        businessId: acc.businessId ?? null,
        userId: userId,
      }));

      // Single, atomic bulk upsert operation with all data ready
      await tx
        .insert(adAccounts)
        .values(dataToUpsert)
        .onConflictDoUpdate({
          target: [adAccounts.id, adAccounts.userId],
          set: {
            name: sql`excluded.name`,
            status: sql`excluded.status`,
            currency: sql`excluded.currency`,
            timezone: sql`excluded.timezone`,
            businessId: sql`excluded.business_id`,
            permissions: sql`excluded.permissions`, // Crucially, update permissions here
          },
        });

      // Return the final data to be sent in the MCP response
      return dataToUpsert;
    });
  }

  async getAdAccounts(
    authPayload: JWTPayload,
    params: Record<string, unknown> = {}
  ): Promise<GetAdAccountsResult> {
    logger.info('Executing get_ad_accounts', { userId: authPayload.userId, params });

    // --- Step 1: DB Read (Minimal Transaction) ---
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

    // --- Step 2: All Network Operations (No Transaction) ---
    const finalAccountsData = await this.fetchAndProcessAccountsFromMeta(
      authPayload.userId,
      accessToken,
      metaUserId
    );

    // --- Step 3: DB Write (Minimal Transaction) ---
    const accountsToStore = await this.storeFinalAccountData(authPayload.userId, finalAccountsData);

    logger.info('Ad accounts retrieved and stored', { count: accountsToStore.length });
    return { adAccounts: accountsToStore };
  }
}
