// src/tools/meta/paginationHelper.ts

import type { MetaPaginatedCursor } from '../../types/meta.js';
import { logger } from '../../utils/logger.js';

/**
 * Configuration options for the fetchAllPaginatedData utility.
 * @template T - The expected type of a single item in the paginated result.
 */
export interface PaginatedFetchOptions<T> {
  /** The initial cursor object received from the Meta SDK API call. */
  cursor: unknown;

  /** The maximum number of items to fetch to prevent resource exhaustion. */
  limit: number;

  /** A user-friendly name for the entity being fetched (e.g., 'campaigns', 'ad sets'). Used for logging. */
  entityName: string;

  /** The ID of the user making the request. Used for logging context. */
  userId: string;

  /** Additional context for logging, such as adAccountId or campaignId. */
  apiContext?: Record<string, unknown>;

  /**
   * An optional function to extract and transform the raw data item from the cursor.
   * This is useful when the cursor items are nested within a `_data` property or need casting.
   * @param item The raw item from the cursor.
   * @returns The transformed item of type T.
   */
  dataExtractor?: (item: unknown) => T;
}

/**
 * A generic utility to handle pagination for Meta API responses. It fetches all items from a
 * paginated cursor up to a configurable safety limit.
 *
 * This utility provides:
 * 1. Array.isArray protection for single-object responses.
 * 2. Safe pagination loops with nullish coalescing.
 * 3. Configurable safety limits.
 * 4. Consistent logging for key events.
 * 5. Type safety via TypeScript generics.
 *
 * @template T - The expected type of the returned items.
 * @param options - Configuration for the fetch operation.
 * @returns A promise that resolves to an array of fetched items.
 */
export async function fetchAllPaginatedData<T>({
  cursor,
  limit,
  entityName,
  userId,
  apiContext = {},
  dataExtractor = (item) => item as T,
}: PaginatedFetchOptions<T>): Promise<T[]> {
  const allRawItems: unknown[] = [];

  // 1. Array.isArray protection: Handle cases where the API returns a single object
  if (cursor && !Array.isArray(cursor)) {
    logger.warn(`Meta API returned a single object for ${entityName}, expected an array.`, {
      userId,
      ...apiContext,
    });
    allRawItems.push(cursor);
    // Return immediately after handling single object case
    return allRawItems.map(dataExtractor);
  }

  let currentCursor = cursor as MetaPaginatedCursor<unknown> | null;

  // 2. Safe pagination loop
  while (currentCursor && currentCursor.length > 0) {
    allRawItems.push(...currentCursor);

    // 3. Apply configurable safety limit
    if (allRawItems.length >= limit) {
      // 4. Provide consistent logging
      logger.warn(`Reached maximum ${entityName} limit, truncating results.`, {
        limit,
        retrievedCount: allRawItems.length,
        userId,
        ...apiContext,
      });
      break;
    }

    // Safely advance to the next page using optional chaining and nullish coalescing
    if (currentCursor.hasNext?.()) {
      currentCursor = (await currentCursor.next?.()) ?? null;
    } else {
      break;
    }
  }

  // 5. Use the dataExtractor to return a standardized array of the correct type
  return allRawItems.map(dataExtractor);
}
