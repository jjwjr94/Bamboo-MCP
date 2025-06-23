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
    logger.warn('Meta token expired', { userId, expiresAt: tokenRecord.expiresAt });
    throw new TokenError('Meta access token has expired. Please re-authenticate.');
  }

  // Warn if token expires within 7 days
  if (tokenRecord.expiresAt) {
    const daysUntilExpiry =
      (new Date(tokenRecord.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 7) {
      logger.warn('Meta token expires soon', {
        userId,
        daysUntilExpiry: Math.round(daysUntilExpiry),
      });
    }
  }

  return createApiInstanceFromToken(tokenRecord.accessToken);
}

function parseMetaApiError(error: unknown): {
  message: string;
  statusCode: number;
  metaErrorCode?: string;
  errorSubcode?: string;
} {
  if (isMetaApiErrorResponse(error)) {
    const errorResponse = error.response || error;

    return {
      message: errorResponse?.message || error.message || 'Meta API request failed',
      statusCode: error.status || 400,
      metaErrorCode: errorResponse?.code?.toString() || error.code?.toString(),
      errorSubcode: errorResponse?.error_subcode?.toString() || error.error_subcode?.toString(),
    };
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown Meta API error',
    statusCode: 500,
  };
}

interface MetaApiErrorResponse {
  message?: string;
  status?: number;
  response?: {
    data?: { error?: unknown };
    status?: number;
    message?: string;
    code?: number | string;
    error_subcode?: number | string;
  };
  code?: number | string;
  error_subcode?: number | string;
}

function isMetaApiErrorResponse(error: unknown): error is MetaApiErrorResponse {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'response' in error || 'message' in error)
  );
}

export async function handleMetaApiCall<T>(
  apiCall: () => Promise<T>,
  context?: {
    toolName?: string;
    userId?: string;
  }
): Promise<T> {
  try {
    const requestScopedPolicy = createMetaResiliencePolicy();
    return await requestScopedPolicy.execute(apiCall);
  } catch (error: unknown) {
    logger.error('Meta API call failed', {
      toolName: context?.toolName,
      userId: context?.userId,
      error: (error as Error).message,
    });

    const parsedError = parseMetaApiError(error);
    throw new MetaApiError(
      parsedError.message,
      parsedError.metaErrorCode,
      parsedError.errorSubcode,
      parsedError.statusCode
    );
  }
}
