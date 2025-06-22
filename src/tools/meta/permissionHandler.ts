import { sql } from 'drizzle-orm';
import { withUserContext } from '../../db/client.js';
import { adAccounts } from '../../db/schema.js';
import type { MetaAdAccountAssignedUsersResponse, MetaGraphApiError } from '../../types/meta.js';
import { getBusinessIdForAdAccount } from '../../utils/businessContextManager.js';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall } from './api.js';

/**
 * Service for handling ad account permission fetching and business context resolution.
 *
 * This service encapsulates all logic related to determining user permissions on Meta ad accounts,
 * including business context resolution, retry logic, and response parsing.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: This is a utility class that provides a namespace for related static methods
export class MetaPermissionHandler {
  /**
   * Fetches the permissions (tasks) for a specific user on a given ad account.
   *
   * This method implements a multi-strategy approach to handle business-managed
   * ad accounts correctly, with intelligent error recovery and fallback mechanisms.
   *
   * @param adAccountId The ID of the ad account
   * @param accessToken The user's Meta access token
   * @param currentUserId The user's Meta ID
   * @param userId The local user ID for business context lookup
   * @param businessId Optional business ID - undefined: lookup from DB, null: non-business account, string: business account
   * @returns An array of permission strings (tasks). Returns ['UNKNOWN'] on failure
   */
  public static async fetchAdAccountPermissions(
    adAccountId: string,
    accessToken: string,
    currentUserId: string,
    userId: string,
    businessId?: string | null
  ): Promise<string[]> {
    const defaultPermissions = ['UNKNOWN'];

    try {
      return await MetaPermissionHandler._fetchAdAccountPermissionsWithRetry(
        adAccountId,
        accessToken,
        currentUserId,
        userId,
        businessId
      );
    } catch (error) {
      logger.error('All permission fetch strategies failed', {
        adAccountId,
        currentUserId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return defaultPermissions;
    }
  }

  /**
   * Internal method that implements retry logic with different business context strategies.
   */
  private static async _fetchAdAccountPermissionsWithRetry(
    adAccountId: string,
    accessToken: string,
    currentUserId: string,
    userId: string,
    businessId?: string | null,
    attempt = 1
  ): Promise<string[]> {
    const defaultPermissions = ['UNKNOWN'];
    const maxAttempts = 2;

    try {
      const resolvedBusinessId = await MetaPermissionHandler._resolveBusinessContext(
        businessId,
        userId,
        adAccountId,
        accessToken
      );

      // Make the actual API request
      const response = await MetaPermissionHandler._callAssignedUsersApi(
        adAccountId,
        accessToken,
        resolvedBusinessId
      );

      // Handle non-200 responses with potential retry logic
      if (!response.ok) {
        const shouldRetry = await MetaPermissionHandler._shouldRetryBusinessRequired(
          response,
          attempt
        );
        if (shouldRetry) {
          // Retry once without a business context to trigger enhanced lookup
          return await MetaPermissionHandler._fetchAdAccountPermissionsWithRetry(
            adAccountId,
            accessToken,
            currentUserId,
            userId,
            undefined,
            attempt + 1
          );
        }
        return defaultPermissions;
      }

      // Successful HTTP 200 – extract permissions from payload
      return await MetaPermissionHandler._extractPermissionsFromResponse(
        response,
        currentUserId,
        adAccountId,
        userId,
        defaultPermissions,
        resolvedBusinessId || 'none'
      );
    } catch (error) {
      if (attempt < maxAttempts) {
        logger.warn('Permission fetch attempt failed, retrying', {
          adAccountId,
          currentUserId,
          userId,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Simple exponential back-off
        await new Promise((res) => setTimeout(res, 1000 * attempt));
        return await MetaPermissionHandler._fetchAdAccountPermissionsWithRetry(
          adAccountId,
          accessToken,
          currentUserId,
          userId,
          businessId,
          attempt + 1
        );
      }

      logger.error('All permission fetch strategies failed', {
        adAccountId,
        currentUserId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return defaultPermissions;
    }
  }

  /**
   * Resolves business context with multiple strategies and robust fallbacks.
   *
   * @param businessId - undefined: lookup from DB, null: non-business account, string: business account
   * @param userId - Local user ID for database queries
   * @param adAccountId - Ad account ID for business lookup
   * @param accessToken - Meta access token for direct API calls
   * @returns Resolved business ID or null for non-business accounts
   */
  private static async _resolveBusinessContext(
    businessId: string | null | undefined,
    userId: string,
    adAccountId: string,
    accessToken?: string
  ): Promise<string | null> {
    // Strategy 1: Use explicitly provided business context when available (string | null)
    if (businessId !== undefined) {
      return businessId;
    }

    // Strategy 2: Lookup from database (returns string | null on success, undefined on failure)
    const dbResult = await MetaPermissionHandler._getBusinessIdFromDb(userId, adAccountId);
    if (dbResult !== undefined) {
      return dbResult; // can be null meaning non-business account
    }

    // Strategy 3: Fallback to direct Graph API lookup if we have a token
    const apiResult = await MetaPermissionHandler._getBusinessIdViaApi(
      adAccountId,
      accessToken,
      userId
    );
    if (apiResult !== undefined) {
      return apiResult; // can be null meaning non-business account
    }

    // Final fallback – treat as non-business account
    logger.debug('All business context resolution strategies failed – defaulting to null', {
      adAccountId,
      userId,
    });
    return null;
  }

  /**
   * Enhanced user lookup in permissions response using multiple strategies.
   * This handles cases where user IDs might not match exactly due to different formats.
   */
  private static async _findUserInPermissionsResponse(
    permissionsData: MetaAdAccountAssignedUsersResponse,
    currentUserId: string,
    adAccountId: string,
    userId: string
  ): Promise<{ id: string; tasks?: string[] } | null> {
    if (!permissionsData.data || permissionsData.data.length === 0) {
      return null;
    }

    // Strategy 1: Exact match (already tried, but double-check)
    let user = permissionsData.data.find((u) => u.id === currentUserId);
    if (user) {
      return user;
    }

    // Strategy 2: Try string conversion variants
    const userIdVariants = [currentUserId, String(currentUserId)];
    // Safely add numeric variant only if the ID is a valid number string
    if (!Number.isNaN(Number(currentUserId))) {
      userIdVariants.push(Number(currentUserId).toString());
    }
    const uniqueUserIdVariants = [...new Set(userIdVariants)]; // More concise way to get unique values

    for (const variant of uniqueUserIdVariants) {
      user = permissionsData.data.find((u) => u.id === variant || String(u.id) === variant);
      if (user) {
        logger.debug('User found via ID variant matching', {
          adAccountId,
          originalId: currentUserId,
          matchedId: user.id,
          variant,
        });
        return user;
      }
    }

    // Strategy 3: If only one user in response, and it's likely the current user
    if (permissionsData.data.length === 1) {
      const singleUser = permissionsData.data[0];
      logger.warn('Only one user in permissions response, assuming it is the current user', {
        adAccountId,
        currentUserId,
        responseUserId: singleUser.id,
        userId,
      });
      return singleUser;
    }

    return null;
  }

  /**
   * Builds the assigned_users API URL with proper business parameter handling.
   */
  private static _buildAssignedUsersUrl(
    adAccountId: string,
    accessToken: string,
    businessId: string | null
  ): string {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,tasks',
    });

    // Only add business parameter if we have a non-null business ID
    // null means "non-business account", undefined would mean "unknown"
    if (businessId !== null && businessId !== '') {
      params.set('business', businessId);
    }

    return `https://graph.facebook.com/${env.META_API_VERSION}/${adAccountId}/assigned_users?${params.toString()}`;
  }

  /**
   * Performs the network call to the assigned_users endpoint.
   */
  private static async _callAssignedUsersApi(
    adAccountId: string,
    accessToken: string,
    businessId: string | null
  ): Promise<Response> {
    const url = MetaPermissionHandler._buildAssignedUsersUrl(adAccountId, accessToken, businessId);
    logger.debug('Fetching ad account permissions', {
      adAccountId,
      businessContext: businessId ?? 'none',
    });
    return await handleMetaApiCall(async () => {
      return await fetch(url, {
        signal: AbortSignal.timeout(env.META_API_TIMEOUT),
      });
    });
  }

  /**
   * Determines if we should retry the request due to a missing business parameter error.
   */
  private static async _shouldRetryBusinessRequired(
    response: Response,
    attempt: number
  ): Promise<boolean> {
    if (attempt !== 1) return false;

    const errorData = (await response.json().catch(() => ({}))) as MetaGraphApiError;

    const requiresBusiness =
      errorData.error?.code === 100 && errorData.error?.message?.includes('business is required');

    if (requiresBusiness) {
      logger.warn('Business parameter required – will retry with enhanced lookup', {
        attempt,
      });
    }

    return requiresBusiness;
  }

  /**
   * Extracts the permissions array for the current user from the API response.
   */
  private static async _extractPermissionsFromResponse(
    response: Response,
    currentUserId: string,
    adAccountId: string,
    userId: string,
    defaultPermissions: string[],
    resolvedBusinessContext: string | null
  ): Promise<string[]> {
    const permissionsData = (await response.json()) as MetaAdAccountAssignedUsersResponse;

    const directMatch = permissionsData.data?.find((u) => u.id === currentUserId);
    if (directMatch?.tasks?.length) {
      logger.info('Successfully fetched ad account permissions', {
        adAccountId,
        currentUserId,
        userId,
        permissions: directMatch.tasks,
        businessContext: resolvedBusinessContext,
      });
      return directMatch.tasks;
    }

    // Fall-back to enhanced lookup
    const fallbackUser = await MetaPermissionHandler._findUserInPermissionsResponse(
      permissionsData,
      currentUserId,
      adAccountId,
      userId
    );

    if (fallbackUser?.tasks?.length) {
      logger.info('User found via enhanced lookup strategy', {
        adAccountId,
        currentUserId,
        userId,
        fallbackUserId: fallbackUser.id,
        permissions: fallbackUser.tasks,
      });
      return fallbackUser.tasks;
    }

    logger.warn('User not found or no permissions assigned', {
      adAccountId,
      currentUserId,
      userId,
      totalUsersInResponse: permissionsData.data?.length ?? 0,
    });
    return defaultPermissions;
  }

  private static async _getBusinessIdFromDb(
    userId: string,
    adAccountId: string
  ): Promise<string | null | undefined> {
    try {
      const dbBusinessId = await getBusinessIdForAdAccount(userId, adAccountId);
      logger.debug('Business ID resolved from database', {
        adAccountId,
        userId,
        businessId: dbBusinessId,
      });
      return dbBusinessId; // can be null meaning non-business account
    } catch (error) {
      logger.warn('Database lookup for business ID failed', {
        adAccountId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return undefined; // signal lookup failure
    }
  }

  private static async _getBusinessIdViaApi(
    adAccountId: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<string | null | undefined> {
    if (!accessToken) return undefined;

    try {
      logger.debug('Attempting direct Meta API business context lookup', {
        adAccountId,
        userId,
      });

      const response = await fetch(
        `https://graph.facebook.com/${env.META_API_VERSION}/${adAccountId}?access_token=${accessToken}&fields=business`,
        {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        }
      );

      if (!response.ok) {
        return undefined;
      }

      const data = (await response.json()) as { business?: { id?: string } };
      const businessId = data.business?.id ?? null;

      logger.debug('Direct Meta API business context lookup result', {
        adAccountId,
        userId,
        businessId,
      });

      if (businessId) {
        await MetaPermissionHandler._cacheBusinessId(userId, adAccountId, businessId);
      }
      return businessId; // can be null meaning non-business account
    } catch (apiError) {
      logger.warn('Direct Meta API lookup for business ID failed', {
        adAccountId,
        userId,
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
      });
      return undefined;
    }
  }

  private static async _cacheBusinessId(
    userId: string,
    adAccountId: string,
    businessId: string
  ): Promise<void> {
    try {
      await withUserContext(userId, async (tx) => {
        await tx
          .insert(adAccounts)
          .values({
            id: adAccountId,
            userId,
            name: 'Temp Account', // Temporary name; updated elsewhere
            status: 'UNKNOWN',
            businessId,
          })
          .onConflictDoUpdate({
            target: [adAccounts.id, adAccounts.userId],
            set: {
              businessId: sql`excluded.business_id`,
            },
          });
      });
      logger.debug('Cached business ID from direct API lookup', {
        adAccountId,
        userId,
        businessId,
      });
    } catch (dbError) {
      logger.warn('Failed to cache business ID from direct API lookup', {
        adAccountId,
        userId,
        businessId,
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      });
    }
  }
}
