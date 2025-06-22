import { desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { withUserContext } from '../../db/client.js';
import { adAccounts, oauthTokens, users } from '../../db/schema.js';
import { MetaAdAccountResponseSchema } from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { MetaAdAccountAssignedUsersResponse } from '../../types/meta.js';
import {
  discoverAndCacheBusinessContext,
  getBusinessIdForAdAccount,
} from '../../utils/businessContextManager.js';
import { env } from '../../utils/env.js';
import { TokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  classifyMetaPermissionError,
  createPermissionsFetchRequest,
  executeLargeBatchRequests,
  validateBusinessContextForBatch,
} from '../../utils/metaBatchHelper.js';
import type { BatchResponse } from '../../utils/metaBatchHelper.js';
import { MetaApiService } from './ApiService.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

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

  private parseJson<T>(json: string): T | null {
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  private logInvalidBatchResponse(response: BatchResponse | undefined, adAccountId: string) {
    const errorDetails: Record<string, unknown> = {
      adAccountId,
      responseCode: response?.code,
    };

    if (response?.body) {
      const parsedBody = this.parseJson<{
        error?: { code?: number; error_subcode?: number; type?: string; message?: string };
      }>(response.body);
      if (parsedBody?.error) {
        errorDetails.metaErrorCode = parsedBody.error.code;
        errorDetails.metaErrorSubcode = parsedBody.error.error_subcode;
        errorDetails.metaErrorType = parsedBody.error.type;
        errorDetails.metaErrorMessage = parsedBody.error.message;
      } else {
        errorDetails.rawErrorBody = response.body.substring(0, 500);
      }
    }

    logger.error('Failed batch request for ad account permissions', errorDetails);
  }

  private extractPermissionsFromBatchResponse(
    response: BatchResponse | undefined,
    metaUserId: string,
    adAccountId: string
  ): string[] {
    const defaultPermissions = ['UNKNOWN'];

    if (!response || response.code !== 200 || !response.body) {
      this.logInvalidBatchResponse(response, adAccountId);
      return defaultPermissions;
    }

    const permissionData = this.parseJson<MetaAdAccountAssignedUsersResponse>(response.body);
    if (!permissionData) {
      logger.error('Failed to parse permissions from batch response', {
        adAccountId,
        responseBodyPreview: response.body.substring(0, 200),
      });
      return defaultPermissions;
    }

    const userPermissions = permissionData.data?.find((user) => user.id === metaUserId);

    if (userPermissions?.tasks?.length) {
      return userPermissions.tasks;
    }

    logger.warn('User not found in batch permissions response or no tasks assigned', {
      adAccountId,
      metaUserId,
      availableUsers:
        permissionData.data?.map((u) => ({ id: u.id, taskCount: u.tasks?.length ?? 0 })) ?? [],
      totalUsersInResponse: permissionData.data?.length ?? 0,
    });

    return defaultPermissions;
  }

  /**
   * Handles business parameter errors with intelligent retry using individual API calls
   * This method is called when batch requests fail due to missing business parameters
   *
   * @param adAccountId - Ad account ID that failed
   * @param accessToken - Meta access token
   * @param userId - Local user ID
   * @param metaUserId - Meta user ID
   * @returns Promise resolving to permissions array
   */
  private async handleBusinessParameterError(
    adAccountId: string,
    accessToken: string,
    userId: string,
    metaUserId: string
  ): Promise<string[]> {
    logger.warn('Retrying permission fetch with business context discovery', {
      adAccountId,
      userId,
      strategy: 'individual_api_call',
    });

    try {
      // Force business context rediscovery
      await discoverAndCacheBusinessContext(userId, accessToken, [adAccountId]);

      // Retry with fresh context using the more robust individual API service
      return await MetaApiService.fetchAdAccountPermissions(
        adAccountId,
        accessToken,
        metaUserId,
        userId,
        undefined // Force fresh lookup
      );
    } catch (error) {
      logger.error('Business parameter error recovery failed', {
        adAccountId,
        userId,
        metaUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return ['UNKNOWN'];
    }
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
   * Processes the permissions for a single account, handling special business parameter
   * error cases when encountered.
   */
  private async processAccountPermissions(
    accountData: ReturnType<typeof this.extractAccountData>,
    responseMap: Map<string, BatchResponse>,
    accessToken: string,
    userId: string,
    metaUserId: string
  ) {
    const response = responseMap.get(accountData.id);

    // Retry path when business parameter is required
    if (response && response.code === 400) {
      const errorBody = this.parseJson<{ error?: { code?: number; message?: string } }>(
        response.body || '{}'
      );
      if (classifyMetaPermissionError(errorBody?.error) === 'business_required') {
        logger.warn('Business parameter required error detected, attempting recovery', {
          adAccountId: accountData.id,
          userId,
        });

        const recoveredPermissions = await this.handleBusinessParameterError(
          accountData.id,
          accessToken,
          userId,
          metaUserId
        );

        return { ...accountData, permissions: recoveredPermissions };
      }
    }

    // Default path
    const permissions = this.extractPermissionsFromBatchResponse(
      response,
      metaUserId,
      accountData.id
    );
    return { ...accountData, permissions };
  }

  /**
   * Attaches permissions to every account using Meta batch APIs while gracefully
   * handling partial failures.
   */
  private async attachPermissions(
    accounts: Array<ReturnType<typeof this.extractAccountData>>,
    accessToken: string,
    userId: string,
    metaUserId: string
  ) {
    if (accounts.length === 0) return [];

    const permissionRequests = accounts.map((a) =>
      createPermissionsFetchRequest(a.id, a.businessId)
    );

    const batchResponses = await executeLargeBatchRequests(permissionRequests, accessToken);
    const responseMap = new Map(
      batchResponses.map((res) => [res.id.replace('permissions_', ''), res])
    );

    const promises = accounts.map((acc) =>
      this.processAccountPermissions(acc, responseMap, accessToken, userId, metaUserId)
    );
    const settled = await Promise.allSettled(promises);

    const final: Array<ReturnType<typeof this.extractAccountData> & { permissions: string[] }> = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        final.push(result.value);
      } else {
        logger.error('Failed to process permissions for an ad account', {
          userId,
          reason: result.reason instanceof Error ? result.reason.message : result.reason,
        });
      }
    }

    return final;
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
    return await this.attachPermissions(accounts, accessToken, userId, metaUserId);
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

  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
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
    return await createMcpSuccessResult(
      { accounts: accountsToStore },
      `Retrieved ${accountsToStore.length} ad accounts`,
      { attachPrompts: true }
    );
  }
}
