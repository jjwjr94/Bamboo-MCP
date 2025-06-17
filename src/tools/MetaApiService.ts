import { db } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import type {
  MetaGraphApiError,
  MetaOAuthAdAccountsResponse,
  MetaOAuthTokenResponse,
  MetaOAuthUserInfoResponse,
} from '../types/meta.js';
import { env } from '../utils/env.js';
import { MetaApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Service for handling direct API interactions with the Meta Graph API.
 *
 * This service encapsulates all Meta/Facebook Graph API communication
 * including OAuth token exchange, user info retrieval, and ad account syncing.
 */
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
    try {
      const tokenResponse = await fetch('https://graph.facebook.com/v22.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.FACEBOOK_APP_ID,
          client_secret: env.FACEBOOK_APP_SECRET,
          code: code,
          redirect_uri: env.FACEBOOK_CALLBACK_URL,
        }),
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
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw error;
      }
      logger.error('Token exchange error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new MetaApiError('OAuth token exchange failed', 'OAUTH_ERROR');
    }
  }

  /**
   * Retrieves user information (ID and email) from Meta using an access token.
   *
   * @param accessToken The Meta access token
   * @returns Object containing user ID and email
   * @throws MetaApiError if user info retrieval fails
   */
  public static async getMetaUserInfo(accessToken: string): Promise<{ id: string; email: string }> {
    try {
      const userResponse = await fetch(
        `https://graph.facebook.com/v22.0/me?access_token=${accessToken}&fields=id,email`
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
      return { id: userData.id, email: userData.email };
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw error;
      }
      logger.error('User info retrieval error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new MetaApiError('Failed to retrieve user information', 'USER_INFO_ERROR');
    }
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
    try {
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v22.0/me/adaccounts?access_token=${accessToken}&fields=id,name,account_status,currency,timezone_name,users{role}`
      );

      if (!adAccountsResponse.ok) {
        const errorData = (await adAccountsResponse.json().catch(() => ({}))) as MetaGraphApiError;
        logger.warn('Failed to fetch ad accounts during auth', {
          userId,
          status: adAccountsResponse.status,
          error: errorData.error?.message,
        });
        return; // Non-critical error, continue the flow
      }

      const adAccountsData = (await adAccountsResponse.json()) as MetaOAuthAdAccountsResponse;
      const accounts = adAccountsData.data || [];

      for (const account of accounts) {
        const permissions = account.users?.data?.[0]?.role
          ? [account.users.data[0].role]
          : ['VIEWER'];
        await db
          .insert(adAccounts)
          .values({
            id: account.id,
            userId: userId,
            name: account.name,
            status: account.account_status,
            currency: account.currency,
            timezone: account.timezone_name,
            permissions,
          })
          .onConflictDoUpdate({
            target: [adAccounts.id, adAccounts.userId],
            set: {
              name: account.name,
              status: account.account_status,
              currency: account.currency,
              timezone: account.timezone_name,
              permissions,
            },
          });
      }
    } catch (error) {
      logger.warn('Ad account sync failed during auth', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Non-critical error, don't throw
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
    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/me?access_token=${accessToken}&fields=id`
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
    } catch (error) {
      if (error instanceof MetaApiError) throw error;

      logger.error('Unexpected error during Meta token validation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Rethrow as a generic error to indicate a problem with the validation process itself
      throw new MetaApiError('Failed to validate Meta access token', 'VALIDATION_FAILED');
    }
  }
}
