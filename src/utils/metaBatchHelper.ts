import { env } from './env.js';
import { MetaApiError, ValidationError } from './errors.js';
import { logger } from './logger.js';

/**
 * Meta Graph API Batch Request Helper
 *
 * Provides utilities for efficiently batching multiple Meta API calls
 * to improve performance and reduce rate limiting issues.
 */

export interface BatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  relativeUrl: string;
  body?: string;
  id: string; // Unique identifier for matching responses
}

export interface BatchResponse {
  id: string;
  code: number;
  headers?: Array<{ name: string; value: string }>;
  body?: string;
}

/**
 * Executes a batch of Meta Graph API requests
 *
 * @param requests - Array of batch requests to execute
 * @param accessToken - Meta access token
 * @returns Array of batch responses matched by ID
 */
export async function executeBatchRequests(
  requests: BatchRequest[],
  accessToken: string
): Promise<BatchResponse[]> {
  if (requests.length === 0) {
    return [];
  }

  if (requests.length > env.META_MAX_BATCH_SIZE) {
    throw new ValidationError(
      `Batch size ${requests.length} exceeds maximum allowed ${env.META_MAX_BATCH_SIZE}`
    );
  }

  logger.debug('Executing batch Meta API request', {
    requestCount: requests.length,
    requestIds: requests.map((r) => r.id),
  });

  try {
    const batchRequestData = requests.map((req) => ({
      method: req.method,
      relative_url: req.relativeUrl,
      ...(req.body && { body: req.body }),
    }));

    const response = await fetch(`https://graph.facebook.com/${env.META_API_VERSION}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        access_token: accessToken,
        batch: JSON.stringify(batchRequestData),
      }),
      signal: AbortSignal.timeout(env.META_API_TIMEOUT * 2), // Double timeout for batch requests
    });

    if (!response.ok) {
      throw new MetaApiError(
        `Batch request failed: ${response.status} ${response.statusText}`,
        response.status.toString(),
        undefined,
        response.status
      );
    }

    const rawResponses = (await response.json()) as Array<{
      code: number;
      headers?: Array<{ name: string; value: string }>;
      body?: string;
    }>;

    // Match responses to requests by index
    const matchedResponses: BatchResponse[] = rawResponses.map((rawResponse, index) => ({
      id: requests[index].id,
      code: rawResponse.code,
      headers: rawResponse.headers,
      body: rawResponse.body,
    }));

    logger.debug('Batch Meta API request completed', {
      requestCount: requests.length,
      successCount: matchedResponses.filter((r) => r.code >= 200 && r.code < 300).length,
      errorCount: matchedResponses.filter((r) => r.code >= 400).length,
    });

    return matchedResponses;
  } catch (error) {
    logger.error('Batch Meta API request failed', {
      requestCount: requests.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Splits a large array of requests into batches and executes them sequentially
 *
 * @param requests - Array of batch requests to execute
 * @param accessToken - Meta access token
 * @param maxConcurrentBatches - Maximum number of batches to execute concurrently
 * @returns Array of all batch responses
 */
export async function executeLargeBatchRequests(
  requests: BatchRequest[],
  accessToken: string,
  maxConcurrentBatches = 3
): Promise<BatchResponse[]> {
  if (requests.length === 0) {
    return [];
  }

  // Split requests into batches
  const batches: BatchRequest[][] = [];
  for (let i = 0; i < requests.length; i += env.META_MAX_BATCH_SIZE) {
    batches.push(requests.slice(i, i + env.META_MAX_BATCH_SIZE));
  }

  logger.info('Executing large batch Meta API request', {
    totalRequests: requests.length,
    batchCount: batches.length,
    maxConcurrentBatches,
  });

  const allResponses: BatchResponse[] = [];

  // Process batches with controlled concurrency
  for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
    const concurrentBatches = batches.slice(i, i + maxConcurrentBatches);

    const batchPromises = concurrentBatches.map((batch) =>
      executeBatchRequests(batch, accessToken)
    );

    const batchResults = await Promise.all(batchPromises);

    // Flatten results
    for (const batchResult of batchResults) {
      allResponses.push(...batchResult);
    }

    // Add delay between batch groups to respect rate limits
    if (i + maxConcurrentBatches < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  logger.info('Large batch Meta API request completed', {
    totalRequests: requests.length,
    totalResponses: allResponses.length,
    successCount: allResponses.filter((r) => r.code >= 200 && r.code < 300).length,
    errorCount: allResponses.filter((r) => r.code >= 400).length,
  });

  return allResponses;
}

/**
 * Creates a business context discovery batch request
 *
 * @param adAccountId - Ad account ID to discover business context for
 * @returns Batch request for business context discovery
 */
export function createBusinessContextDiscoveryRequest(adAccountId: string): BatchRequest {
  return {
    method: 'GET',
    relativeUrl: `${adAccountId}?fields=business,name,status`,
    id: `business_context_${adAccountId}`,
  };
}

/**
 * Creates a permissions fetch batch request
 *
 * ⚠️  CRITICAL: Business ID Semantics - DO NOT MODIFY WITHOUT UNDERSTANDING
 *
 * The businessId parameter has specific semantics that are essential for Meta API compliance:
 *
 * - `string`: Business-managed ad account with this specific Business Manager ID
 *   → Meta API REQUIRES the business parameter for these accounts
 *   → Example: "123456789" means account is managed by Business Manager 123456789
 *
 * - `null`: Confirmed NON-business account (individual/personal ad account)
 *   → Meta API MUST NOT receive business parameter for these accounts
 *   → Example: Personal Facebook user's direct ad account
 *
 * - `undefined`: Unknown business context (needs discovery)
 *   → Should trigger business context discovery before batch execution
 *   → Example: Newly discovered account that hasn't been categorized yet
 *
 * - `""` (empty string): Invalid/corrupted business ID
 *   → Treated as invalid and excluded from API call
 *   → Should not occur in normal operation
 *
 * ⚠️  BREAKING CHANGE RISK:
 * - Changing null to undefined will cause failed API calls for non-business accounts
 * - Changing undefined to null will skip discovery and cause business parameter errors
 * - Always preserve the exact semantics when refactoring
 *
 * @param adAccountId - Ad account ID to fetch permissions for
 * @param businessId - Business ID with specific null/undefined semantics (see above)
 * @returns Batch request for permissions fetch
 */
export function createPermissionsFetchRequest(
  adAccountId: string,
  businessId?: string | null
): BatchRequest {
  const params = new URLSearchParams({ fields: 'id,tasks' });

  // CRITICAL: Business parameter logic based on Meta API requirements
  // This logic must match the semantics documented above
  if (businessId !== null && businessId !== undefined && businessId !== '') {
    params.set('business', businessId);
    logger.debug('Added business parameter to permissions request', {
      adAccountId,
      businessId,
      reasoning: 'Business-managed account requires business parameter',
    });
  } else {
    logger.debug('No business parameter added to permissions request', {
      adAccountId,
      businessId,
      reason:
        businessId === null
          ? 'confirmed non-business account (business parameter forbidden)'
          : businessId === undefined
            ? 'unknown business context (discovery needed)'
            : 'empty/invalid business ID',
    });
  }

  return {
    method: 'GET',
    relativeUrl: `${adAccountId}/assigned_users?${params.toString()}`,
    id: `permissions_${adAccountId}`,
  };
}

/**
 * Interface for Meta API error objects
 */
interface MetaApiErrorObject {
  code?: number;
  message?: string;
  type?: string;
  error_subcode?: number;
}

/**
 * Classifies Meta API permission errors to determine appropriate recovery strategy
 *
 * @param error - Error object from Meta API response
 * @returns Error classification for targeted handling
 */
export function classifyMetaPermissionError(
  error: MetaApiErrorObject | null | undefined
): 'business_required' | 'permission_denied' | 'user_not_found' | 'unknown' {
  if (!error) return 'unknown';

  if (error.code === 100 && error.message?.includes('business is required')) {
    return 'business_required';
  }
  if (error.code && error.code >= 200 && error.code <= 299) {
    return 'permission_denied';
  }
  if (
    error.code === 100 &&
    (error.message?.includes('not found') || error.message?.includes('no tasks'))
  ) {
    return 'user_not_found';
  }
  return 'unknown';
}

/**
 * Validates business context completeness before executing batch requests
 *
 * ⚠️  CRITICAL: Business ID Validation Semantics
 *
 * This function analyzes business context readiness based on our semantic model:
 * - businessManagedCount: Accounts with string business IDs (require business parameter)
 * - nonBusinessCount: Accounts with null business ID (forbid business parameter)
 * - unknownContextCount: Accounts with undefined business ID (need discovery)
 *
 * The batch is "ready" ONLY when unknownContextCount === 0, meaning all accounts
 * have been categorized as either business-managed (string) or non-business (null).
 *
 * ⚠️  DO NOT modify the filtering logic without understanding these semantics.
 *
 * @param accounts - Array of account objects with business context
 * @returns Validation summary with recommendations
 */
export function validateBusinessContextForBatch(
  accounts: Array<{ id: string; businessId?: string | null }>
): {
  totalAccounts: number;
  businessManagedCount: number;
  unknownContextCount: number;
  nonBusinessCount: number;
  needsDiscovery: string[];
  isReady: boolean;
} {
  const totalAccounts = accounts.length;

  // ⚠️  CRITICAL: These filters must match the semantics documented above
  const businessManagedCount = accounts.filter(
    (acc) => acc.businessId && acc.businessId !== ''
  ).length; // string business IDs only

  const unknownContextCount = accounts.filter((acc) => acc.businessId === undefined).length; // undefined = unknown

  const nonBusinessCount = accounts.filter((acc) => acc.businessId === null).length; // null = confirmed non-business

  const needsDiscovery = accounts
    .filter((acc) => acc.businessId === undefined) // Only undefined accounts need discovery
    .map((acc) => acc.id);

  const isReady = unknownContextCount === 0; // All accounts have known business context (string or null)

  logger.info('Business context validation summary', {
    totalAccounts,
    businessManagedCount,
    unknownContextCount,
    nonBusinessCount,
    needsDiscovery: needsDiscovery.length > 0 ? needsDiscovery : 'none',
    isReady,
  });

  return {
    totalAccounts,
    businessManagedCount,
    unknownContextCount,
    nonBusinessCount,
    needsDiscovery,
    isReady,
  };
}
