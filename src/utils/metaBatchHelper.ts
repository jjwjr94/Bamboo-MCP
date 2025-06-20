import { env } from './env.js';
import { MetaApiError } from './errors.js';
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
 * Maximum number of requests allowed in a single batch
 * Based on Meta's current API limits
 */
export const MAX_BATCH_SIZE = 50;

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

  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size ${requests.length} exceeds maximum allowed ${MAX_BATCH_SIZE}`);
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

    const response = await fetch('https://graph.facebook.com/v22.0/', {
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
  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    batches.push(requests.slice(i, i + MAX_BATCH_SIZE));
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
 * @param adAccountId - Ad account ID to fetch permissions for
 * @param businessId - Optional business ID for business-managed accounts
 * @returns Batch request for permissions fetch
 */
export function createPermissionsFetchRequest(
  adAccountId: string,
  businessId?: string
): BatchRequest {
  const params = new URLSearchParams({ fields: 'id,tasks' });
  if (businessId) {
    params.set('business', businessId);
  }

  return {
    method: 'GET',
    relativeUrl: `${adAccountId}/assigned_users?${params.toString()}`,
    id: `permissions_${adAccountId}`,
  };
}
