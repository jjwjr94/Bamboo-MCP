import { sql } from 'drizzle-orm';
import { withUserContext } from '../../db/client.js';
import { adAccounts } from '../../db/schema.js';
import type {
  MetaAdAccountAssignedUsersResponse,
  MetaGraphApiError,
  MetaOAuthAdAccountsResponse,
  MetaOAuthTokenResponse,
  MetaOAuthUserInfoResponse,
} from '../../types/meta.js';
import { getBusinessIdForAdAccount } from '../../utils/businessContextManager.js';
import { env } from '../../utils/env.js';
import { MetaApiError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall } from './api.js';

/**
 * Service for handling direct API interactions with the Meta Graph API.
 *
 * This service encapsulates all Meta/Facebook Graph API communication
 * including OAuth token exchange, user info retrieval, and ad account syncing.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: This is a utility class that provides a namespace for related static methods
export class MetaApiService {
  /**
   * Exchanges an authorization code for a Meta access token.
   *
   * @param code The authorization code received from Meta OAuth callback
   * @returns Object containing the access token and optional expiration time
   * @throws MetaApiError if the token exchange fails
   */
  public static async exchangeMetaCodeForToken(
    code: string
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    return handleMetaApiCall(async () => {
      const tokenResponse = await fetch('https://graph.facebook.com/v22.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.FACEBOOK_APP_ID,
          client_secret: env.FACEBOOK_APP_SECRET,
          code: code,
          redirect_uri: env.FACEBOOK_CALLBACK_URL,
        }),
        signal: AbortSignal.timeout(env.META_API_TIMEOUT),
      });

      if (!tokenResponse.ok) {
        const errorData = (await tokenResponse.json().catch(() => ({}))) as MetaGraphApiError;
        throw new MetaApiError(
          errorData.error?.message ||
            `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`,
          errorData.error?.code?.toString(),
          errorData.error?.error_subcode?.toString(),
          tokenResponse.status
        );
      }

      const tokenData = (await tokenResponse.json()) as MetaOAuthTokenResponse;
      if (!tokenData.access_token) {
        throw new MetaApiError('Failed to obtain Meta access token');
      }

      return { accessToken: tokenData.access_token, expiresIn: tokenData.expires_in };
    });
  }

  /**
   * Retrieves user information (ID only) from Meta using an access token.
   *
   * @param accessToken The Meta access token
   * @returns Object containing user ID
   * @throws MetaApiError if user info retrieval fails
   */
  public static async getMetaUserInfo(accessToken: string): Promise<{ id: string }> {
    return handleMetaApiCall(async () => {
      const userResponse = await fetch(
        `https://graph.facebook.com/v22.0/me?access_token=${accessToken}&fields=id`,
        {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        }
      );

      if (!userResponse.ok) {
        const errorData = (await userResponse.json().catch(() => ({}))) as MetaGraphApiError;
        throw new MetaApiError(
          errorData.error?.message ||
            `Failed to get user info: ${userResponse.status} ${userResponse.statusText}`,
          errorData.error?.code?.toString(),
          errorData.error?.error_subcode?.toString(),
          userResponse.status
        );
      }

      const userData = (await userResponse.json()) as MetaOAuthUserInfoResponse;
      return { id: userData.id };
    });
  }

  /**
   * Fetches and syncs a user's ad accounts from Meta to the local database.
   *
   * This method retrieves all ad accounts associated with the user's Meta account
   * and stores/updates them in the local database. Non-critical errors are logged
   * but do not throw to avoid disrupting the OAuth flow.
   *
   * @param userId The local user ID
   * @param accessToken The Meta access token
   */
  public static async syncUserAdAccounts(userId: string, accessToken: string): Promise<void> {
    // Fetch Meta User ID with robust error handling
    let metaUserId: string | undefined;
    try {
      const userInfo = await MetaApiService.getMetaUserInfo(accessToken);
      metaUserId = userInfo.id;
    } catch (error) {
      logger.warn(
        'Could not fetch Meta user ID during ad account sync. Permissions will default to UNKNOWN.',
        {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      // metaUserId remains undefined; sync will proceed with default permissions
    }

    let nextUrl: string | undefined =
      `https://graph.facebook.com/v22.0/me/adaccounts?access_token=${accessToken}&fields=id,name,account_status,currency,timezone_name,business&limit=100`;

    try {
      while (nextUrl) {
        const currentUrl = nextUrl; // TypeScript assertion: nextUrl is guaranteed to be string here
        const adAccountsResponse = await handleMetaApiCall(async () => {
          return await fetch(currentUrl, {
            signal: AbortSignal.timeout(env.META_API_TIMEOUT),
          });
        });

        if (!adAccountsResponse.ok) {
          const errorData = (await adAccountsResponse
            .json()
            .catch(() => ({}))) as MetaGraphApiError;
          logger.warn('Failed to fetch ad accounts page during auth', {
            userId,
            status: adAccountsResponse.status,
            error: errorData.error?.message,
          });
          return; // Stop sync on page failure
        }

        const adAccountsData = (await adAccountsResponse.json()) as MetaOAuthAdAccountsResponse;
        const accounts = adAccountsData.data || [];

        if (accounts.length > 0) {
          // Wrap database operations in withUserContext for RLS compliance
          await withUserContext(userId, async (tx) => {
            // Prepare an array to hold all account data for the batch
            const accountsToUpsert = [];

            // Process accounts in batches for better performance
            for (const account of accounts) {
              // Dynamically fetch permissions or use fallback
              let permissions: string[];
              if (metaUserId) {
                permissions = await MetaApiService.fetchAdAccountPermissions(
                  account.id,
                  accessToken,
                  metaUserId,
                  userId,
                  account.business?.id || null
                );
              } else {
                // Fallback if Meta User ID could not be fetched initially
                permissions = ['UNKNOWN'];
              }

              // Push the complete account object into the array
              accountsToUpsert.push({
                id: account.id,
                userId: userId,
                name: account.name,
                status: String(account.account_status), // Cast to string for consistency
                currency: account.currency,
                timezone: account.timezone_name,
                businessId: account.business?.id || null, // Store business_id if available
                permissions,
              });
            }

            // If we have accounts, perform a single bulk insert/update operation
            if (accountsToUpsert.length > 0) {
              await tx
                .insert(adAccounts)
                .values(accountsToUpsert)
                .onConflictDoUpdate({
                  target: [adAccounts.id, adAccounts.userId],
                  set: {
                    name: sql`excluded.name`,
                    status: sql`excluded.status`,
                    currency: sql`excluded.currency`,
                    timezone: sql`excluded.timezone`,
                    businessId: sql`excluded.business_id`,
                    permissions: sql`excluded.permissions`,
                  },
                });
            }
          });
        }

        nextUrl = adAccountsData.paging?.next;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.warn('Ad account sync timed out during auth', { userId });
        return; // Exit on timeout as per existing error handling logic
      }
      logger.warn('Ad account sync failed during auth', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Non-critical error, don't throw
    }
  }

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
      return await MetaApiService._fetchAdAccountPermissionsWithRetry(
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
    const maxAttempts = 2;
    const defaultPermissions = ['UNKNOWN'];

    try {
      // Strategy 1: Use provided business context or lookup from database
      const resolvedBusinessId = await MetaApiService._resolveBusinessContext(
        businessId,
        userId,
        adAccountId,
        accessToken
      );

      const url = MetaApiService._buildAssignedUsersUrl(
        adAccountId,
        accessToken,
        resolvedBusinessId
      );

      logger.debug('Fetching ad account permissions', {
        adAccountId,
        attempt,
        businessIdStrategy: businessId !== undefined ? 'provided' : 'database_lookup',
        resolvedBusinessId: resolvedBusinessId || 'none',
        hasBusinessContext: resolvedBusinessId !== null,
      });

      const response = await handleMetaApiCall(async () => {
        return await fetch(url, {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        });
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as MetaGraphApiError;

        // Handle business parameter requirement error with retry
        if (
          errorData.error?.code === 100 &&
          errorData.error?.message?.includes('business is required') &&
          attempt === 1
        ) {
          logger.warn(
            'Business parameter required, attempting retry with enhanced business lookup',
            {
              adAccountId,
              currentUserId,
              userId,
              originalBusinessContext: resolvedBusinessId,
              attempt,
            }
          );

          // Strategy 2: Enhanced retry with direct API business lookup
          return await MetaApiService._fetchAdAccountPermissionsWithRetry(
            adAccountId,
            accessToken,
            currentUserId,
            userId,
            undefined, // Force enhanced business context resolution with API fallback
            attempt + 1
          );
        }

        // Log specific error types for debugging
        if (errorData.error?.code === 100) {
          if (errorData.error?.message?.includes('business is required')) {
            logger.warn('Ad account requires business parameter but context unavailable', {
              adAccountId,
              currentUserId,
              userId,
              businessIdResolved: resolvedBusinessId,
              message: 'This ad account is business-managed but business ID could not be resolved',
              suggestion: 'Verify ad account is properly synced with business information',
            });
          } else {
            logger.warn('Meta API parameter error', {
              adAccountId,
              currentUserId,
              userId,
              status: response.status,
              error: errorData.error?.message,
              code: errorData.error?.code,
            });
          }
        } else {
          logger.warn('Failed to fetch ad account permissions', {
            adAccountId,
            currentUserId,
            userId,
            status: response.status,
            error: errorData.error?.message,
            code: errorData.error?.code,
          });
        }
        return defaultPermissions;
      }

      // Parse successful response
      const permissionsData = (await response.json()) as MetaAdAccountAssignedUsersResponse;
      const userPermissions = permissionsData.data?.find((user) => user.id === currentUserId);

      if (!userPermissions) {
        // Enhanced user lookup strategy - try to find user by different identifiers
        const fallbackUser = await MetaApiService._findUserInPermissionsResponse(
          permissionsData,
          currentUserId,
          adAccountId,
          userId
        );

        if (fallbackUser) {
          logger.info('User found via enhanced lookup strategy', {
            adAccountId,
            currentUserId,
            userId,
            fallbackUserId: fallbackUser.id,
            permissions: fallbackUser.tasks,
          });
          return fallbackUser.tasks || defaultPermissions;
        }

        logger.warn('User not found in ad account permissions response', {
          adAccountId,
          currentUserId,
          userId,
          totalUsersInResponse: permissionsData.data?.length || 0,
          suggestion:
            'User may not have permissions on this ad account or business context may be incorrect',
        });
        return defaultPermissions;
      }

      if (!userPermissions.tasks || userPermissions.tasks.length === 0) {
        logger.warn('User found but no tasks/permissions assigned', {
          adAccountId,
          currentUserId,
          userId,
          userPermissions,
        });
        return defaultPermissions;
      }

      logger.info('Successfully fetched ad account permissions', {
        adAccountId,
        currentUserId,
        userId,
        permissions: userPermissions.tasks,
        businessContext: resolvedBusinessId || 'none',
      });

      return userPermissions.tasks;
    } catch (error) {
      if (attempt < maxAttempts) {
        logger.warn('Permission fetch attempt failed, retrying', {
          adAccountId,
          currentUserId,
          userId,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Exponential backoff for retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));

        return await MetaApiService._fetchAdAccountPermissionsWithRetry(
          adAccountId,
          accessToken,
          currentUserId,
          userId,
          businessId,
          attempt + 1
        );
      }

      throw error;
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
    // Strategy 1: Use explicitly provided business context
    if (businessId !== undefined) {
      // businessId is either a string (business-managed) or null (non-business)
      return businessId;
    }

    // Strategy 2: Lookup from database
    try {
      const dbBusinessId = await getBusinessIdForAdAccount(userId, adAccountId);
      // If the database lookup succeeds (doesn't throw), trust the result (string or null)
      logger.debug('Business ID resolved from database', {
        adAccountId,
        userId,
        businessId: dbBusinessId,
      });
      return dbBusinessId;
    } catch (error) {
      logger.warn('Database business context lookup failed, proceeding to API lookup', {
        adAccountId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Strategy 3: Direct Meta API lookup as fallback
    if (accessToken) {
      try {
        logger.debug('Attempting direct Meta API business context lookup', {
          adAccountId,
          userId,
        });

        const response = await fetch(
          `https://graph.facebook.com/v22.0/${adAccountId}?access_token=${accessToken}&fields=business`,
          {
            signal: AbortSignal.timeout(env.META_API_TIMEOUT),
          }
        );

        if (response.ok) {
          const data = (await response.json()) as { business?: { id?: string } };
          const directBusinessId = data.business?.id || null;

          logger.debug('Direct Meta API business context lookup result', {
            adAccountId,
            userId,
            businessId: directBusinessId,
            isBusinessManaged: directBusinessId !== null,
          });

          // Store the resolved business ID in the database for future use
          if (directBusinessId) {
            try {
              await withUserContext(userId, async (tx) => {
                await tx
                  .insert(adAccounts)
                  .values({
                    id: adAccountId,
                    userId: userId,
                    name: 'Temp Account', // Temporary name, will be updated later
                    status: 'UNKNOWN',
                    businessId: directBusinessId,
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
                businessId: directBusinessId,
              });
            } catch (dbError) {
              logger.warn('Failed to cache business ID from direct API lookup', {
                adAccountId,
                userId,
                businessId: directBusinessId,
                error: dbError instanceof Error ? dbError.message : 'Unknown error',
              });
            }
          }

          return directBusinessId;
        }
      } catch (apiError) {
        logger.warn('Direct Meta API business context lookup failed', {
          adAccountId,
          userId,
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
    }

    // Strategy 4: Return null as final fallback (treat as non-business account)
    logger.debug(
      'All business context resolution strategies failed, treating as non-business account',
      {
        adAccountId,
        userId,
      }
    );
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

    return `https://graph.facebook.com/v22.0/${adAccountId}/assigned_users?${params.toString()}`;
  }

  /**
   * Validates a Meta access token by making a simple API call.
   *
   * @param accessToken The Meta access token to validate
   * @returns True if the token is valid, false otherwise
   * @throws MetaApiError if the validation call fails for reasons other than an invalid token
   */
  public static async validateAccessToken(accessToken: string): Promise<boolean> {
    return handleMetaApiCall(async () => {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/me?access_token=${accessToken}&fields=id`,
        {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        }
      );

      if (response.ok) {
        return true;
      }

      const errorData = (await response.json().catch(() => ({}))) as MetaGraphApiError;
      // For token validation, certain errors (like expired token) are expected "failures"
      if (errorData.error?.type === 'OAuthException') {
        logger.info('Meta token validation failed as expected for an invalid token', {
          code: errorData.error.code,
        });
        return false;
      }

      // For other errors (network, etc.), throw so it can be handled as a server issue
      throw new MetaApiError(
        errorData.error?.message ||
          `Token validation failed: ${response.status} ${response.statusText}`,
        errorData.error?.code?.toString(),
        errorData.error?.error_subcode?.toString(),
        response.status
      );
    });
  }
}
