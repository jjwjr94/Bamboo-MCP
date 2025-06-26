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
 * Fetches all items from a paginated Meta API response.
 * Handles single-object responses and enforces safety limits.
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

  if (cursor && !Array.isArray(cursor)) {
    logger.warn(`Meta API returned a single object for ${entityName}, expected an array.`, {
      userId,
      ...apiContext,
    });
    allRawItems.push(cursor);
    return allRawItems.map(dataExtractor);
  }

  let currentCursor = cursor as MetaPaginatedCursor<unknown> | null;

  while (currentCursor && currentCursor.length > 0) {
    allRawItems.push(...currentCursor);

    if (allRawItems.length >= limit) {
      logger.warn(`Reached maximum ${entityName} limit, truncating results.`, {
        limit,
        retrievedCount: allRawItems.length,
        userId,
        ...apiContext,
      });
      break;
    }

    if (currentCursor.hasNext?.()) {
      currentCursor = (await currentCursor.next?.()) ?? null;
    } else {
      break;
    }
  }

  return allRawItems.map(dataExtractor);
}
