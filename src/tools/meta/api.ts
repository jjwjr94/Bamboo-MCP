import { desc, eq } from 'drizzle-orm';
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { withUserContext } from '../../db/client.js';
import { oauthTokens } from '../../db/schema.js';
import { MetaApiError, TokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMetaResiliencePolicy } from '../../utils/resiliencePolicy.js';
import { env } from '../../utils/env.js';

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
  // Initialize the Facebook Ads SDK if app credentials are available
  if (env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET) {
    FacebookAdsApi.init(env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET, accessToken);
  } else {
    // For direct token usage without app credentials, we need to initialize with minimal config
    // This is a workaround for cases where we only have the access token
    FacebookAdsApi.init('direct-token', 'direct-token', accessToken);
  }
  
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
  metaErrorType?: string;
  fbtrace_id?: string;
  userTitle?: string;
  userMessage?: string;
} {
  if (isMetaApiErrorResponse(error)) {
    // The Meta API error can be in a few places. We check in order of specificity.
    const details =
      error.response?.data?.error || // 1. Deeply nested in axios-like response
      error.response || // 2. Directly on the response object
      error; // 3. Directly on the top-level error object

    const safeDetails =
      typeof details === 'object' && details !== null
        ? (details as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    return {
      message:
        (typeof safeDetails.message === 'string'
          ? (safeDetails.message as string)
          : error.message) || 'Meta API request failed',
      statusCode: error.status || error.response?.status || 400,
      metaErrorCode: (() => {
        const val = safeDetails.code;
        return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
      })(),
      errorSubcode: (() => {
        const val = safeDetails.error_subcode;
        return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
      })(),
      metaErrorType: (safeDetails.type as string) ?? undefined,
      fbtrace_id: (safeDetails.fbtrace_id as string) ?? undefined,
      userTitle: (safeDetails.error_user_title as string) ?? undefined,
      userMessage: (safeDetails.error_user_msg as string) ?? undefined,
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
    data?: {
      error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
        fbtrace_id?: string;
      };
    };
    status?: number;
    message?: string;
    code?: number | string;
    error_subcode?: number | string;
    type?: string;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
  code?: number | string;
  error_subcode?: number | string;
  type?: string;
  fbtrace_id?: string;
  error_user_title?: string;
  error_user_msg?: string;
}

function isMetaApiErrorResponse(error: unknown): error is MetaApiErrorResponse {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'response' in error || 'message' in error)
  );
}

/**
 * Parses a failed fetch Response from the Meta API and creates a standardized MetaApiError.
 * @param response The failed Response object from a fetch call.
 * @returns A promise that resolves to a fully populated MetaApiError instance.
 */
export async function createMetaApiErrorFromResponse(response: Response): Promise<MetaApiError> {
  let errorPayload: unknown;
  try {
    // Attempt to parse the body as JSON, which contains the detailed error object
    const json: unknown = await response.json();
    if (
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      // Ensure the error property is not from Object.prototype
      Object.prototype.hasOwnProperty.call(json, 'error')
    ) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime check above guarantees safety
      errorPayload = (json as { error: unknown }).error;
    } else {
      errorPayload = json;
    }
  } catch (_e) {
    // If the body is not JSON or parsing fails, create a fallback payload
    errorPayload = {
      message: `API request failed with status ${response.status}: ${response.statusText}`,
    };
  }

  // Use the existing enhanced parser to extract all known fields
  const parsedError = parseMetaApiError(errorPayload);

  return new MetaApiError(
    parsedError.message,
    parsedError.metaErrorCode,
    parsedError.errorSubcode,
    response.status, // Use the actual HTTP status code from the response
    parsedError.metaErrorType,
    parsedError.fbtrace_id,
    parsedError.userTitle,
    parsedError.userMessage
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
    const parsedError = parseMetaApiError(error);

    logger.error('Meta API call failed', {
      toolName: context?.toolName,
      userId: context?.userId,
      error: parsedError.message,
      fbtrace_id: parsedError.fbtrace_id,
    });

    throw new MetaApiError(
      parsedError.message,
      parsedError.metaErrorCode,
      parsedError.errorSubcode,
      parsedError.statusCode,
      parsedError.metaErrorType,
      parsedError.fbtrace_id,
      parsedError.userTitle,
      parsedError.userMessage
    );
  }
}
