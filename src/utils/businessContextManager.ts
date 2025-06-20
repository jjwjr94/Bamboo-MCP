import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { NotFoundError } from './errors.js';
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
        throw new NotFoundError(`Ad account ${adAccountId} not found in database`);
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
    // Re-throw NotFoundError to be handled by the coordinator
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Log and return null for other unexpected database errors
    logger.warn('Failed to fetch business ID for ad account due to an unexpected error', {
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

/**
 * Proactively discovers and caches business context for ad accounts.
 * This is useful for handling cases where ad accounts exist but their business context
 * is not yet stored in the database.
 *
 * @param userId - The user ID for security context
 * @param accessToken - Meta access token for API calls
 * @param adAccountIds - Array of ad account IDs to discover business context for
 * @returns Promise that resolves when discovery is complete
 */
export async function discoverAndCacheBusinessContext(
  userId: string,
  accessToken: string,
  adAccountIds: string[]
): Promise<void> {
  if (adAccountIds.length === 0) {
    return;
  }

  logger.debug('Starting business context discovery', {
    userId,
    adAccountCount: adAccountIds.length,
    adAccountIds,
  });

  const discoveryPromises = adAccountIds.map(async (adAccountId) => {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${adAccountId}?access_token=${accessToken}&fields=business,name,status`,
        {
          signal: AbortSignal.timeout(10000), // 10 second timeout for discovery
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          business?: { id?: string };
          name?: string;
          status?: string;
        };

        const businessId = data.business?.id || null;
        const name = data.name || 'Unknown Account';
        const status = data.status || 'UNKNOWN';

        // Cache the discovered information
        await withUserContext(userId, async (tx) => {
          await tx
            .insert(adAccounts)
            .values({
              id: adAccountId,
              userId: userId,
              name: name,
              status: status,
              businessId: businessId,
            })
            .onConflictDoUpdate({
              target: [adAccounts.id, adAccounts.userId],
              set: {
                name: sql`excluded.name`,
                status: sql`excluded.status`,
                businessId: sql`excluded.business_id`,
              },
            });
        });

        logger.debug('Cached business context from discovery', {
          adAccountId,
          userId,
          businessId,
          name,
          status,
          isBusinessManaged: businessId !== null,
        });
      } else {
        logger.warn('Failed to discover business context for ad account', {
          adAccountId,
          userId,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      logger.warn('Business context discovery failed for ad account', {
        adAccountId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Run all discoveries in parallel with error isolation
  await Promise.allSettled(discoveryPromises);

  logger.debug('Business context discovery completed', {
    userId,
    adAccountCount: adAccountIds.length,
  });
}
