import { desc, eq } from 'drizzle-orm';
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { withUserContext } from '../../db/client.js';
import { oauthTokens } from '../../db/schema.js';
import { MetaApiError, TokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMetaResiliencePolicy } from '../../utils/resiliencePolicy.js';

// Circuit breaker is now request-scoped to prevent cross-user impact

async function fetchUserToken(userId: string) {
  return withUserContext(userId, async (tx) => {
    const tokenRecord = await tx
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
      .orderBy(desc(oauthTokens.createdAt))
      .limit(1);

    if (!tokenRecord.length || !tokenRecord[0].accessToken) {
      throw new TokenError('No valid Meta access token found for the user.');
    }

    return tokenRecord[0];
  });
}

export async function fetchUserTokenString(userId: string): Promise<string> {
  const tokenRecord = await fetchUserToken(userId);
  return tokenRecord.accessToken;
}

/**
 * Creates a new FacebookAdsApi instance from an access token.
 * This is used for creating isolated API instances with specific tokens (e.g., page tokens).
 */
export function createApiInstanceFromToken(accessToken: string): FacebookAdsApi {
  return new FacebookAdsApi(accessToken);
}

/**
 * Creates a new request-scoped Meta API instance for a user.
 * This replaces the global singleton pattern with safe per-request instances.
 */
export async function createMetaApiInstance(userId: string): Promise<FacebookAdsApi> {
  const tokenRecord = await fetchUserToken(userId);

  if (tokenRecord.expiresAt && new Date() >= new Date(tokenRecord.expiresAt)) {
    logger.warn('Meta access token has expired', { userId, expiresAt: tokenRecord.expiresAt });
    throw new TokenError('Meta access token has expired. Please re-authenticate.');
  }

  // Warn if token expires soon (within 7 days)
  if (tokenRecord.expiresAt) {
    const daysUntilExpiry =
      (new Date(tokenRecord.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 7) {
      logger.warn('Meta access token expires soon', {
        userId,
        daysUntilExpiry: Math.round(daysUntilExpiry),
      });
    }
  }

  // Create and return a new, isolated instance instead of initializing a global singleton.
  const api = createApiInstanceFromToken(tokenRecord.accessToken);
  logger.info('New request-scoped Meta Ads API instance created', { userId });
  return api;
}

export async function handleMetaApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  try {
    // Create a new resilience policy per request to prevent cross-user circuit breaker impact
    const requestScopedPolicy = createMetaResiliencePolicy();
    return await requestScopedPolicy.execute(apiCall);
  } catch (error: unknown) {
    logger.error('Meta API call failed', { error: (error as Error).message });

    // The SDK often throws errors with a 'response' property or structured error fields
    const errorObj = error as {
      message?: string;
      response?: { data?: { error?: unknown }; status?: number };
    };

    const errorResponse = errorObj.response?.data?.error || errorObj;

    if (errorResponse) {
      interface ErrorResponseShape {
        message?: string;
        code?: number | string;
        error_subcode?: number | string;
      }

      const { message, code, error_subcode } = errorResponse as ErrorResponseShape;

      throw new MetaApiError(
        message || (errorObj as Error).message || 'Meta API request failed',
        code?.toString(),
        error_subcode?.toString(),
        errorObj.response?.status || 400
      );
    }

    throw new MetaApiError((errorObj as Error).message || 'An unknown Meta API error occurred.');
  }
}
