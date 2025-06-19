import { withUserContext } from '../../db/client.js';
import { adAccounts } from '../../db/schema.js';
import type {
  MetaAdAccountAssignedUsersResponse,
  MetaGraphApiError,
  MetaOAuthAdAccountsResponse,
  MetaOAuthTokenResponse,
  MetaOAuthUserInfoResponse,
} from '../../types/meta.js';
import { buildMetaApiUrl } from '../../utils/businessContextManager.js';
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This method handles multiple scenarios and error cases for robustness
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
            // Process accounts in batches for better performance
            for (const account of accounts) {
              // Dynamically fetch permissions or use fallback
              let permissions: string[];
              if (metaUserId) {
                permissions = await MetaApiService.fetchAdAccountPermissions(
                  account.id,
                  accessToken,
                  metaUserId,
                  userId
                );
              } else {
                // Fallback if Meta User ID could not be fetched initially
                permissions = ['UNKNOWN'];
              }
              await tx
                .insert(adAccounts)
                .values({
                  id: account.id,
                  userId: userId,
                  name: account.name,
                  status: String(account.account_status), // Cast to string for consistency
                  currency: account.currency,
                  timezone: account.timezone_name,
                  businessId: account.business?.id || null, // Store business_id if available
                  permissions,
                })
                .onConflictDoUpdate({
                  target: [adAccounts.id, adAccounts.userId],
                  set: {
                    name: account.name,
                    status: String(account.account_status), // Cast to string for consistency
                    currency: account.currency,
                    timezone: account.timezone_name,
                    businessId: account.business?.id || null, // Update business_id
                    permissions,
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
   * This is a non-critical operation; if it fails, it logs a warning and returns
   * default permissions to avoid blocking other processes.
   *
   * @param adAccountId The ID of the ad account
   * @param accessToken The user's Meta access token
   * @param currentUserId The user's Meta ID
   * @param userId The local user ID for business context lookup
   * @returns An array of permission strings (tasks). Returns ['UNKNOWN'] on failure
   */
  public static async fetchAdAccountPermissions(
    adAccountId: string,
    accessToken: string,
    currentUserId: string,
    userId: string
  ): Promise<string[]> {
    const defaultPermissions = ['UNKNOWN'];
    try {
      // Use centralized URL builder for consistent business parameter handling
      const url = await buildMetaApiUrl(
        `https://graph.facebook.com/v22.0/${adAccountId}/assigned_users`,
        userId,
        adAccountId,
        {
          access_token: accessToken,
          fields: 'id,tasks',
        }
      );

      const response = await handleMetaApiCall(async () => {
        return await fetch(url, {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        });
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as MetaGraphApiError;
        logger.warn('Failed to fetch ad account permissions', {
          adAccountId,
          currentUserId,
          userId,
          status: response.status,
          error: errorData.error?.message,
        });
        return defaultPermissions;
      }

      const permissionsData = (await response.json()) as MetaAdAccountAssignedUsersResponse;
      const userPermissions = permissionsData.data?.find((user) => user.id === currentUserId);

      if (!userPermissions) {
        logger.warn('User not found in ad account permissions response', {
          adAccountId,
          currentUserId,
          userId,
        });
        return defaultPermissions;
      }

      if (userPermissions.tasks) {
        return userPermissions.tasks;
      }
      logger.warn('User found, but tasks property is missing in permissions response', {
        adAccountId,
        currentUserId,
        userId,
      });
      return defaultPermissions;
    } catch (error) {
      // handleMetaApiCall will retry appropriate errors, but if it ultimately fails,
      // we still want to return default permissions for this non-critical operation
      logger.warn('Error fetching ad account permissions', {
        adAccountId,
        currentUserId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return defaultPermissions;
    }
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
