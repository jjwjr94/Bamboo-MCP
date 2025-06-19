import { eq } from 'drizzle-orm';
import { withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { logger } from './logger.js';

/**
 * Manages business context for Meta API calls, automatically handling
 * the business parameter requirement for business-managed ad accounts.
 *
 * This module provides a secure, stateless approach to business context
 * management that respects Row Level Security policies.
 */

/**
 * Gets the business ID for an ad account from the database with proper RLS enforcement.
 * Returns null if the ad account is not business-managed or user doesn't have access.
 *
 * This function is enhanced with better error handling and debug logging for
 * troubleshooting business context resolution issues.
 *
 * @param userId - The user ID for security context
 * @param adAccountId - The Meta ad account ID
 * @returns Business ID if available, null otherwise
 */
export async function getBusinessIdForAdAccount(
  userId: string,
  adAccountId: string
): Promise<string | null> {
  try {
    logger.debug('Looking up business ID for ad account', {
      userId,
      adAccountId,
    });

    // Use withUserContext to enforce RLS and prevent unauthorized access
    const businessId = await withUserContext(userId, async (tx) => {
      const result = await tx
        .select({ businessId: adAccounts.businessId })
        .from(adAccounts)
        .where(eq(adAccounts.id, adAccountId))
        .limit(1);

      if (result.length === 0) {
        logger.debug('Ad account not found in database', {
          userId,
          adAccountId,
        });
        return null;
      }

      const foundBusinessId = result[0]?.businessId || null;
      logger.debug('Business ID lookup result', {
        userId,
        adAccountId,
        businessId: foundBusinessId,
        isBusinessManaged: foundBusinessId !== null,
      });

      return foundBusinessId;
    });

    return businessId;
  } catch (error) {
    logger.warn('Failed to fetch business ID for ad account', {
      userId,
      adAccountId,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });
    return null;
  }
}

/**
 * Builds a Meta API URL with business parameter if the ad account is business-managed.
 * This is a helper method to ensure consistent business parameter handling.
 *
 * @param baseUrl - The base Meta API URL
 * @param userId - The user ID for security context
 * @param adAccountId - The Meta ad account ID
 * @param existingParams - Optional existing query parameters
 * @returns Complete URL with business parameter if needed
 */
export async function buildMetaApiUrl(
  baseUrl: string,
  userId: string,
  adAccountId: string,
  existingParams?: Record<string, string>
): Promise<string> {
  const businessId = await getBusinessIdForAdAccount(userId, adAccountId);

  const url = new URL(baseUrl);

  // Add existing parameters
  if (existingParams) {
    for (const [key, value] of Object.entries(existingParams)) {
      url.searchParams.set(key, value);
    }
  }

  // Add business parameter if needed
  if (businessId) {
    url.searchParams.set('business', businessId);
    logger.debug('Added business parameter to Meta API URL', {
      adAccountId,
      businessId,
      url: url.toString(),
    });
  }

  return url.toString();
}

/**
 * Checks if an ad account is business-managed based on stored business_id.
 *
 * @param userId - The user ID for security context
 * @param adAccountId - The Meta ad account ID
 * @returns True if business-managed, false otherwise
 */
export async function isBusinessManaged(userId: string, adAccountId: string): Promise<boolean> {
  const businessId = await getBusinessIdForAdAccount(userId, adAccountId);
  return businessId !== null;
}
