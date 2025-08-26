import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { withUserContext } from '../db/client.js';
import { adAccounts } from '../db/schema.js';
import { env } from './env.js';
import { NotFoundError } from './errors.js';
import { logger } from './logger.js';
import {
  createBusinessContextDiscoveryRequest,
  executeLargeBatchRequests,
} from './metaBatchHelper.js';

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
    // Re-throw NotFoundError to be handled by the coordinator.
    // Use instanceof for better type safety.
    if (error instanceof NotFoundError) {
      throw error;
    }

    // For database query errors where we can't find the record, this should also be treated as NotFoundError
    if (error instanceof Error && error.message.includes('Failed query')) {
      throw new NotFoundError(`Ad account ${adAccountId} not found`);
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
 * Parses a single batch discovery response into a normalized structure.
 * Extracting this logic keeps the main coordinator function concise and below
 * the cognitive-complexity threshold enforced by the linter.
 */
type BatchProcessingOutcome = {
  accountToUpsert?: {
    id: string;
    userId: string;
    name: string;
    status: string;
    businessId: string | null;
  };
  successId?: string;
  failure?: { adAccountId: string; error: string };
};

function parseBusinessContextBatchResponse(
  response: { id: string; code: number; body?: string },
  userId: string
): BatchProcessingOutcome {
  const adAccountId = response.id.replace('business_context_', '');

  try {
    if (response.code === 200 && response.body) {
      const data = JSON.parse(response.body) as {
        business?: { id?: string };
        name?: string;
        status?: string;
      };

      const businessId = data.business?.id ?? null;
      const name = data.name ?? 'Unknown Account';
      const status = data.status ?? 'UNKNOWN';

      logger.debug('Parsed business context', {
        adAccountId,
        userId,
        businessId,
        name,
        status,
        isBusinessManaged: businessId !== null,
      });

      return {
        accountToUpsert: {
          id: adAccountId,
          userId,
          name,
          status,
          businessId,
        },
        successId: adAccountId,
      };
    }

    const errorMsg = `API returned ${response.code}: ${response.body ?? 'No body'}`;
    logger.warn('Failed to discover business context for ad account', {
      adAccountId,
      userId,
      status: response.code,
      body: response.body,
    });
    return { failure: { adAccountId, error: errorMsg } };
  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : 'Parse error';
    logger.warn('Failed to parse business context response', {
      adAccountId,
      userId,
      error: errorMsg,
      responseBody: response.body,
    });
    return { failure: { adAccountId, error: errorMsg } };
  }
}

/**
 * Aggregates outcomes from all batch responses.
 */
function processBatchResponses(
  responses: Array<{ id: string; code: number; body?: string }>,
  userId: string
) {
  const outcome = {
    accountsToUpsert: [] as Array<{
      id: string;
      userId: string;
      name: string;
      status: string;
      businessId: string | null;
    }>,
    successful: [] as string[],
    failed: [] as string[],
    errors: [] as Array<{ adAccountId: string; error: string }>,
  };

  for (const res of responses) {
    const parsed = parseBusinessContextBatchResponse(res, userId);
    if (parsed.accountToUpsert) outcome.accountsToUpsert.push(parsed.accountToUpsert);
    if (parsed.successId) outcome.successful.push(parsed.successId);
    if (parsed.failure) {
      outcome.failed.push(parsed.failure.adAccountId);
      outcome.errors.push(parsed.failure);
    }
  }

  return outcome;
}

/**
 * Performs a bulk upsert of ad account business context.
 */
async function upsertAdAccounts(
  userId: string,
  accounts: Array<{
    id: string;
    userId: string;
    name: string;
    status: string;
    businessId: string | null;
  }>
) {
  if (accounts.length === 0) return;

  await withUserContext(userId, async (tx) => {
    await tx
      .insert(adAccounts)
      .values(accounts)
      .onConflictDoUpdate({
        target: [adAccounts.id, adAccounts.userId],
        set: {
          name: sql`excluded.name`,
          status: sql`excluded.status`,
          businessId: sql`excluded.business_id`,
        },
      });
  });
}

/**
 * Fetches business context directly from the Meta API.
 */
async function fetchBusinessContextFromApi(
  userId: string,
  accessToken: string,
  adAccountId: string
): Promise<{ businessId: string | null; name: string; status: string } | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${env.META_API_VERSION}/${adAccountId}?access_token=${accessToken}&fields=business,name,status`,
      { signal: AbortSignal.timeout(env.META_API_TIMEOUT) }
    );

    if (!response.ok) {
      logger.warn('API call failed while resolving business context', {
        userId,
        adAccountId,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as {
      business?: { id?: string };
      name?: string;
      status?: string;
    };

    return {
      businessId: data.business?.id ?? null,
      name: data.name ?? 'Unknown Account',
      status: data.status ?? 'UNKNOWN',
    };
  } catch (error) {
    logger.warn('Meta API request threw while resolving business context', {
      userId,
      adAccountId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Caches the fetched business context for future lookups.
 */
async function cacheBusinessContext(
  userId: string,
  adAccountId: string,
  context: { businessId: string | null; name: string; status: string }
) {
  try {
    await withUserContext(userId, async (tx) => {
      await tx
        .insert(adAccounts)
        .values({
          id: adAccountId,
          userId,
          name: context.name,
          status: context.status,
          businessId: context.businessId,
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

    logger.debug('Cached business context from API fallback', {
      userId,
      adAccountId,
      businessId: context.businessId,
      name: context.name,
      status: context.status,
      source: 'api_discovery',
    });
  } catch (error) {
    logger.warn('Failed to cache business context from API fallback', {
      userId,
      adAccountId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Proactively discovers and caches business context for ad accounts using efficient batch processing.
 * This is useful for handling cases where ad accounts exist but their business context
 * is not yet stored in the database.
 *
 * @param userId - The user ID for security context
 * @param accessToken - Meta access token for API calls
 * @param adAccountIds - Array of ad account IDs to discover business context for
 * @param forceRefresh - If true, refresh cached data even for accounts already in database
 * @returns Promise that resolves with discovery results
 */
export async function discoverAndCacheBusinessContext(
  userId: string,
  accessToken: string,
  adAccountIds: string[],
  forceRefresh = false
): Promise<{ successful: string[]; failed: string[] }> {
  if (adAccountIds.length === 0) {
    return { successful: [], failed: [] };
  }

  logger.debug('Starting business context discovery', {
    userId,
    adAccountCount: adAccountIds.length,
    adAccountIds,
    forceRefresh,
  });

  try {
    const batchRequests = adAccountIds.map((id) => createBusinessContextDiscoveryRequest(id));
    const batchResponses = await executeLargeBatchRequests(batchRequests, accessToken);

    const processed = processBatchResponses(batchResponses, userId);
    await upsertAdAccounts(userId, processed.accountsToUpsert);

    logger.info('Bulk cached business context from batch discovery', {
      userId,
      accountsProcessed: processed.accountsToUpsert.length,
      successfulDiscoveries: processed.successful.length,
      failedDiscoveries: processed.failed.length,
      totalRequested: adAccountIds.length,
    });

    logger.debug('Business context discovery completed', {
      userId,
      adAccountCount: adAccountIds.length,
      successful: processed.successful.length > 0 ? processed.successful : undefined,
      failed: processed.failed.length > 0 ? processed.failed : undefined,
      errors: processed.errors.length > 0 ? processed.errors.map((e) => e.error) : undefined,
    });

    return { successful: processed.successful, failed: processed.failed };
  } catch (error) {
    logger.error('Business context discovery failed', {
      userId,
      adAccountIds,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { successful: [], failed: [] };
  }
}

/**
 * Centralized business context resolver with multi-strategy approach.
 * This function provides a unified interface for resolving business context
 * with automatic fallback from database cache to live API discovery.
 *
 * Strategy:
 * 1. Database lookup first (fast, cached)
 * 2. API fallback if not found (slower, but comprehensive)
 * 3. Cache API results for future lookups
 *
 * @param userId - The user ID for security context
 * @param accessToken - Meta access token for API calls (used for fallback)
 * @param adAccountId - The Meta ad account ID to resolve context for
 * @returns Business ID if business-managed, null if personal, null if resolution fails
 */
export async function resolveBusinessContext(
  userId: string,
  accessToken: string,
  adAccountId: string
): Promise<string | null> {
  logger.debug('Starting business context resolution', {
    userId,
    adAccountId,
  });

  try {
    // Fast path – use cached value if available
    const cachedBusinessId = await getBusinessIdForAdAccount(userId, adAccountId);
    return cachedBusinessId;
  } catch (lookupError) {
    logger.debug('Database lookup failed, falling back to API discovery', {
      userId,
      adAccountId,
      error: lookupError instanceof Error ? lookupError.message : 'Unknown error',
    });
  }

  const apiContext = await fetchBusinessContextFromApi(userId, accessToken, adAccountId);
  if (!apiContext) return null;

  await cacheBusinessContext(userId, adAccountId, apiContext);
  return apiContext.businessId;
}
