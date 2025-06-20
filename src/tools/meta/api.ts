import { desc, eq } from 'drizzle-orm';
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { withUserContext } from '../../db/client.js';
import { oauthTokens } from '../../db/schema.js';
import { AuthenticationError, MetaApiError } from '../../utils/errors.js';
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
      throw new AuthenticationError('No valid Meta access token found for the user.');
    }

    return tokenRecord[0];
  });
}

export async function fetchUserTokenString(userId: string): Promise<string> {
  const tokenRecord = await fetchUserToken(userId);
  return tokenRecord.accessToken;
}

export async function initializeMetaApi(userId: string): Promise<FacebookAdsApi> {
  const token = await fetchUserToken(userId);

  if (token.expiresAt && new Date() >= new Date(token.expiresAt)) {
    logger.warn('Meta access token has expired', { userId, expiresAt: token.expiresAt });
    throw new AuthenticationError('Meta access token has expired. Please re-authenticate.');
  }

  // Warn if token expires soon (within 7 days)
  if (token.expiresAt) {
    const daysUntilExpiry =
      (new Date(token.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 7) {
      logger.warn('Meta access token expires soon', {
        userId,
        daysUntilExpiry: Math.round(daysUntilExpiry),
      });
    }
  }

  const api = FacebookAdsApi.init(token.accessToken);

  logger.info('Meta Ads API initialized', { userId });
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
