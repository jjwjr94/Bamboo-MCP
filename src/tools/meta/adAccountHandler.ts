import { and, desc, eq, sql } from 'drizzle-orm';
import { AdAccount as MetaAdAccountSDK, User as MetaUserSDK } from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import { type DbTransaction, withUserContext } from '../../db/client.js';
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
  executeBatchRequests,
  validateBusinessContextForBatch,
} from '../../utils/metaBatchHelper.js';
import type { BatchResponse } from '../../utils/metaBatchHelper.js';
import { MetaApiService } from './ApiService.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

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

    // ⚠️  CRITICAL: Business ID Extraction and Semantics
    //
    // This business ID determination is ESSENTIAL for Meta API compliance.
    // The returned value determines how we call Meta's assigned_users endpoint:
    //
    // - `string` (business ID): This account is managed by a Business Manager
    //   → We MUST include business parameter in API calls
    //   → Meta API will reject calls without business parameter (Error 100)
    //
    // - `null`: This is a confirmed NON-business account (personal/individual)
    //   → We MUST NOT include business parameter in API calls
    //   → Including business parameter may cause permission errors
    //
    // - `undefined`: Business context is unknown and needs discovery
    //   → Triggers proactive business context discovery
    //   → Should not persist - gets resolved to string or null
    //
    // ⚠️  DO NOT change these semantics without updating:
    // - createPermissionsFetchRequest() in metaBatchHelper.ts
    // - validateBusinessContextForBatch() logic
    // - All business context resolution functions
    let businessId: string | null | undefined;
    if (acc.business && typeof acc.business === 'object' && 'id' in acc.business) {
      // Business object exists with ID → Business-managed account
      businessId =
        typeof acc.business.id === 'string' ? acc.business.id : String(acc.business.id ?? '');
    } else {
      // Business field missing/null → Need to determine if non-business or unknown
      // If business field is explicitly null/false, this is a non-business account
      // If business field is missing, business context is unknown
      businessId = acc.business === null ? null : undefined;
    }

    return {
      id,
      name,
      status: accountStatus,
      currency,
      timezone: timezoneName,
      businessId, // ⚠️  CRITICAL: This value determines Meta API call behavior
    };
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

  private async handleAccountPermissionUpdate(
    tx: DbTransaction,
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

    return await handleMetaApiCall(
      async () => {
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

          // 2a. Pre-validate business context for batch readiness
          const businessValidation = validateBusinessContextForBatch(extractedAccounts);

          // If some accounts need business discovery, resolve them first
          if (!businessValidation.isReady && businessValidation.needsDiscovery.length > 0) {
            logger.info('Discovering business context for accounts with unknown context', {
              accountsNeedingDiscovery: businessValidation.needsDiscovery,
            });

            // Force business context discovery for unknown accounts
            await discoverAndCacheBusinessContext(
              authPayload.userId,
              accessToken,
              businessValidation.needsDiscovery
            );

            // Refresh business context from database after discovery
            for (const account of extractedAccounts) {
              if (account.businessId === undefined) {
                const resolvedBusinessId = await getBusinessIdForAdAccount(
                  authPayload.userId,
                  account.id
                );
                account.businessId = resolvedBusinessId;
                logger.debug('Updated business context after discovery', {
                  adAccountId: account.id,
                  businessId: resolvedBusinessId,
                });
              }
            }
          }

          // 2b. Create a batch request for each account's permissions.
          const permissionRequests = extractedAccounts.map((account) =>
            createPermissionsFetchRequest(account.id, account.businessId)
          );

          // 2c. Execute the batch request to fetch all permissions in one API call.
          const batchResponses = await executeBatchRequests(permissionRequests, accessToken);

          // 2d. Create a lookup map for efficient response processing.
          const responseMap = new Map(
            batchResponses.map((res) => [
              res.id.replace('permissions_', ''), // Key by ad account ID
              res,
            ])
          );

          // 2e. Process each account with enhanced error handling for business parameter issues
          const finalAccountUpdatePromises = extractedAccounts.map(async (accountData) => {
            const response = responseMap.get(accountData.id);

            // Check if this specific account had a business parameter error
            if (response && response.code === 400) {
              try {
                const errorBody = this.parseJson<{ error?: { code?: number; message?: string } }>(
                  response.body || '{}'
                );
                const errorClassification = classifyMetaPermissionError(errorBody?.error);

                if (errorClassification === 'business_required') {
                  logger.warn('Business parameter required error detected, attempting recovery', {
                    adAccountId: accountData.id,
                    userId: authPayload.userId,
                  });

                  // Use individual API call with enhanced business context resolution
                  const recoveredPermissions = await this.handleBusinessParameterError(
                    accountData.id,
                    accessToken,
                    authPayload.userId,
                    metaUserId
                  );

                  // Update the account with recovered permissions
                  await tx
                    .update(adAccounts)
                    .set({ permissions: recoveredPermissions })
                    .where(
                      and(
                        eq(adAccounts.id, accountData.id),
                        eq(adAccounts.userId, authPayload.userId)
                      )
                    );

                  return {
                    ...accountData,
                    permissions: recoveredPermissions,
                  };
                }
              } catch (error) {
                logger.error('Error processing business parameter recovery', {
                  adAccountId: accountData.id,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }

            // Fall back to standard processing for successful responses or other errors
            return this.handleAccountPermissionUpdate(
              tx,
              accountData,
              response,
              metaUserId,
              authPayload.userId
            );
          });

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
      },
      {
        toolName: 'get_ad_accounts',
        userId: authPayload.userId,
      }
    );
  }
}
