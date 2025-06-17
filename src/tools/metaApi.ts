import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { eq, desc } from 'drizzle-orm';
import { withUserContext } from '../db/client.js';
import { oauthTokens } from '../db/schema.js';
import { AuthenticationError, MetaApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Fetches the user's access token using proper RLS context.
 * @param userId - The UUID of the authenticated user.
 * @returns The access token and expiration info.
 */
async function fetchUserToken(userId: string) {
  return withUserContext(userId, async (tx) => {
    const tokenRecord = await tx.select().from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
      .orderBy(desc(oauthTokens.createdAt))
      .limit(1);

    if (!tokenRecord.length || !tokenRecord[0].accessToken) {
      throw new AuthenticationError('No valid Meta access token found for the user.');
    }

    return tokenRecord[0];
  });
}

/**
 * Initializes the Meta Ads API with the user's access token.
 * @param userId - The UUID of the authenticated user.
 * @returns An initialized FacebookAdsApi instance.
 */
export async function initializeMetaApi(userId: string): Promise<FacebookAdsApi> {
  const token = await fetchUserToken(userId);

  // Check token expiration
  if (token.expiresAt && new Date() >= new Date(token.expiresAt)) {
    logger.warn('Meta access token has expired', { userId, expiresAt: token.expiresAt });
    throw new AuthenticationError('Meta access token has expired. Please re-authenticate.');
  }
  
  // Warn if token expires soon (within 7 days)
  if (token.expiresAt) {
    const daysUntilExpiry = (new Date(token.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 7) {
      logger.warn('Meta access token expires soon', { userId, daysUntilExpiry: Math.round(daysUntilExpiry) });
    }
  }
  
  // Initialize SDK with best practices from 2025 research
  const api = FacebookAdsApi.init(token.accessToken);
  
  logger.info('Meta Ads API initialized', { userId });
  return api;
}

/**
 * A wrapper to handle Meta API calls with structured error handling.
 * @param apiCall - The async function making the Meta SDK call.
 */
export async function handleMetaApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  try {
    return await apiCall();
  } catch (error: any) {
    logger.error('Meta API call failed', { error: error.message });
    
    // The SDK often throws errors with a 'response' property or structured error fields
    const errorResponse = error.response?.data?.error || error;
    
    if (errorResponse) {
      throw new MetaApiError(
        errorResponse.message || error.message || 'Meta API request failed',
        errorResponse.code?.toString(),
        errorResponse.error_subcode?.toString(),
        error.response?.status || 400
      );
    }
    
    throw new MetaApiError(error.message || 'An unknown Meta API error occurred.');
  }
} 