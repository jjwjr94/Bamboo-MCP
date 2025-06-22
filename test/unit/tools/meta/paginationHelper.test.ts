import '../../../helpers/testEnv.js'; // Must be first to set environment variables
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllPaginatedData } from '../../../../src/tools/meta/paginationHelper.js';
import type { MetaPaginatedCursor } from '../../../../src/types/meta.js';
import { logger } from '../../../../src/utils/logger.js';

// Mock the logger module
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Define a type for test data for type safety checks
interface TestItem {
  id: number;
  name: string;
}

// Create a helper function to build mock cursor objects
const createMockCursor = <T>(
  items: T[],
  nextPage?: MetaPaginatedCursor<T> | Promise<MetaPaginatedCursor<T>> | null
): MetaPaginatedCursor<T> => {
  const cursor = [...items] as Partial<MetaPaginatedCursor<T>>;
  cursor.hasNext = vi.fn().mockReturnValue(!!nextPage);
  // Ensure next() returns a Promise, as the real SDK does
  cursor.next = vi.fn().mockResolvedValue(nextPage);
  return cursor as MetaPaginatedCursor<T>;
};

describe('fetchAllPaginatedData', () => {
  const commonOptions = {
    limit: 100,
    entityName: 'test-entity',
    userId: 'test-user-123',
    apiContext: { adAccountId: 'act_123' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Normal Pagination Flow', () => {
    it('should fetch and accumulate data from multiple pages correctly', async () => {
      // Arrange: Create a 3-page paginated response
      const page3 = createMockCursor<TestItem>([{ id: 5, name: 'Item 5' }], null);
      const page2 = createMockCursor<TestItem>(
        [
          { id: 3, name: 'Item 3' },
          { id: 4, name: 'Item 4' },
        ],
        page3
      );
      const page1 = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        page2
      );

      // Act
      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: page1,
      });

      // Assert
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
      expect(page1.hasNext).toHaveBeenCalledTimes(1);
      expect(page1.next).toHaveBeenCalledTimes(1);
      expect(page2.hasNext).toHaveBeenCalledTimes(1);
      expect(page2.next).toHaveBeenCalledTimes(1);
      expect(page3.hasNext).toHaveBeenCalledTimes(1); // Called once, returns false
      expect(page3.next).not.toHaveBeenCalled(); // Loop breaks before calling next()
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle single page with multiple items', async () => {
      const singlePage = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
          { id: 3, name: 'Item 3' },
        ],
        null
      );

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: singlePage,
      });

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
      expect(singlePage.hasNext).toHaveBeenCalledTimes(1);
      expect(singlePage.next).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle pagination with Promise-based next() responses', async () => {
      const page2Promise = Promise.resolve(
        createMockCursor<TestItem>([{ id: 3, name: 'Item 3' }], null)
      );
      const page1 = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], page2Promise);

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: page1,
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual([1, 3]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle a single object response by wrapping it in an array and logging a warning', async () => {
      const singleObject = { id: 1, name: 'Single Item' };
      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: singleObject,
      });

      expect(result).toEqual([singleObject]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Meta API returned a single object for test-entity, expected an array.',
        { userId: commonOptions.userId, ...commonOptions.apiContext }
      );
    });

    it('should return an empty array for an empty initial cursor', async () => {
      const emptyCursor = createMockCursor<TestItem>([], null);
      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: emptyCursor,
      });
      expect(result).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return an empty array for a null cursor', async () => {
      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor: null });
      expect(result).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return an empty array for an undefined cursor', async () => {
      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor: undefined });
      expect(result).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle cursor with length 0 but still an array', async () => {
      const zeroCursor = createMockCursor<TestItem>([], null);
      // Ensure it's treated as an array with length 0
      expect(Array.isArray(zeroCursor)).toBe(true);
      expect(zeroCursor.length).toBe(0);

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: zeroCursor,
      });
      expect(result).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle single item in cursor array', async () => {
      const singleItemCursor = createMockCursor<TestItem>([{ id: 42, name: 'Lone Item' }], null);

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: singleItemCursor,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 42, name: 'Lone Item' });
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Safety Limits', () => {
    it('should truncate results and log a warning when the limit is exceeded', async () => {
      // Arrange: Limit is 3. Page 1 has 2 items, Page 2 has 2 items.
      // The loop will fetch page 2, making the total 4, which is >= 3. It will then stop.
      const page2 = createMockCursor<TestItem>(
        [
          { id: 3, name: 'Item 3' },
          { id: 4, name: 'Item 4' },
        ],
        null
      );
      const page1 = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        page2
      );

      // Act
      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        limit: 3,
        cursor: page1,
      });

      // Assert
      expect(result).toHaveLength(4); // Fetches the full page that crosses the threshold
      expect(page1.next).toHaveBeenCalledTimes(1);
      expect(page2.next).not.toHaveBeenCalled(); // Loop breaks before next call
      expect(logger.warn).toHaveBeenCalledWith(
        'Reached maximum test-entity limit, truncating results.',
        expect.objectContaining({ limit: 3, retrievedCount: 4, userId: commonOptions.userId })
      );
    });

    it('should handle hitting the limit exactly', async () => {
      const page2 = createMockCursor<TestItem>([{ id: 3, name: 'Item 3' }], null);
      const page1 = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        page2
      );

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        limit: 3,
        cursor: page1,
      });

      expect(result).toHaveLength(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Reached maximum test-entity limit, truncating results.',
        expect.objectContaining({ limit: 3, retrievedCount: 3 })
      );
      expect(page1.next).toHaveBeenCalledTimes(1);
      expect(page2.next).not.toHaveBeenCalled();
    });

    it('should not trigger limit warning when under the limit', async () => {
      const singlePage = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        null
      );

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        limit: 10,
        cursor: singlePage,
      });

      expect(result).toHaveLength(2);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle limit of 1 correctly', async () => {
      const largePage = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
          { id: 3, name: 'Item 3' },
        ],
        null
      );

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        limit: 1,
        cursor: largePage,
      });

      expect(result).toHaveLength(3); // Gets the whole first page
      expect(logger.warn).toHaveBeenCalledWith(
        'Reached maximum test-entity limit, truncating results.',
        expect.objectContaining({ limit: 1, retrievedCount: 3 })
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle API errors during pagination by re-throwing the error', async () => {
      const apiError = new Error('Meta API Failed');
      const mockNextPage = createMockCursor<TestItem>([{ id: 2, name: 'Item 2' }], null);
      const page1 = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], mockNextPage);
      page1.next = vi.fn().mockRejectedValue(apiError);

      await expect(
        fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor: page1 })
      ).rejects.toThrow('Meta API Failed');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should terminate gracefully if hasNext() exists but next() is missing', async () => {
      const mockNextPage = createMockCursor<TestItem>([{ id: 2, name: 'Item 2' }], null);
      const cursor = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], mockNextPage);
      // Intentionally remove the `next` method by casting through `unknown` to a generic record.
      (cursor as unknown as Record<string, unknown>).next = undefined; // Break the cursor

      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
      expect(cursor.hasNext).toHaveBeenCalledTimes(1);
    });

    it('should terminate gracefully if next() exists but hasNext() is missing', async () => {
      const cursor = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], null);
      // Intentionally remove the `hasNext` method by casting through `unknown` to a generic record.
      (cursor as unknown as Record<string, unknown>).hasNext = undefined; // Break the cursor

      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
    });

    it('should handle hasNext() throwing an error', async () => {
      const cursor = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], null);
      cursor.hasNext = vi.fn().mockImplementation(() => {
        throw new Error('hasNext failed');
      });

      await expect(fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor })).rejects.toThrow(
        'hasNext failed'
      );
    });

    it('should handle next() returning null when hasNext() returns true', async () => {
      const cursor = createMockCursor<TestItem>([{ id: 1, name: 'Item 1' }], null);
      cursor.hasNext = vi.fn().mockReturnValue(true);
      cursor.next = vi.fn().mockResolvedValue(null);

      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
      expect(cursor.hasNext).toHaveBeenCalledTimes(1);
      expect(cursor.next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data Extraction and Type Safety', () => {
    it('should use the default extractor which returns items as-is', async () => {
      const rawItem = { id: 1, name: 'Raw Item' };
      const cursor = createMockCursor([rawItem], null);
      const result = await fetchAllPaginatedData<TestItem>({ ...commonOptions, cursor });
      expect(result).toEqual([rawItem]);
    });

    it('should use a custom dataExtractor to transform items', async () => {
      // Arrange: Items are nested inside a _data property
      type RawItem = { _data: TestItem };
      const rawItems: RawItem[] = [
        { _data: { id: 1, name: 'Transformed 1' } },
        { _data: { id: 2, name: 'Transformed 2' } },
      ];
      const cursor = createMockCursor<RawItem>(rawItems, null);

      const dataExtractor = (item: unknown) => (item as RawItem)._data;

      // Act
      const result: TestItem[] = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor,
        dataExtractor,
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Transformed 1' });
      expect(result[1]).toEqual({ id: 2, name: 'Transformed 2' });
      // This line implicitly checks type safety, as `result` is typed TestItem[]
      expect(result[0].name).toBe('Transformed 1');
    });

    it('should handle dataExtractor that returns complex transformations', async () => {
      type RawComplexItem = {
        meta: { identifier: number };
        content: { title: string; extra: string[] };
      };

      const rawItems: RawComplexItem[] = [
        {
          meta: { identifier: 10 },
          content: { title: 'Complex 1', extra: ['a', 'b'] },
        },
      ];

      const cursor = createMockCursor<RawComplexItem>(rawItems, null);

      const dataExtractor = (item: unknown) => {
        const raw = item as RawComplexItem;
        return {
          id: raw.meta.identifier,
          name: raw.content.title,
        };
      };

      const result: TestItem[] = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor,
        dataExtractor,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 10, name: 'Complex 1' });
    });

    it('should apply dataExtractor to single object responses', async () => {
      type RawItem = { _data: TestItem };
      const singleRawObject: RawItem = { _data: { id: 99, name: 'Single Transform' } };

      const dataExtractor = (item: unknown) => (item as RawItem)._data;

      const result = await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        cursor: singleRawObject,
        dataExtractor,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 99, name: 'Single Transform' });
      expect(logger.warn).toHaveBeenCalledWith(
        'Meta API returned a single object for test-entity, expected an array.',
        expect.objectContaining({ userId: commonOptions.userId })
      );
    });
  });

  describe('Logging and Context', () => {
    it('should include apiContext in log messages', async () => {
      const singleObject = { id: 1, name: 'Context Test' };
      const customContext = { campaignId: 'camp_456', adSetId: 'adset_789' };

      await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        apiContext: customContext,
        cursor: singleObject,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Meta API returned a single object for test-entity, expected an array.',
        { userId: commonOptions.userId, ...customContext }
      );
    });

    it('should handle empty apiContext gracefully', async () => {
      const largePage = createMockCursor<TestItem>(
        [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        null
      );

      await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        apiContext: {},
        limit: 1,
        cursor: largePage,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Reached maximum test-entity limit, truncating results.',
        expect.objectContaining({
          limit: 1,
          retrievedCount: 2,
          userId: commonOptions.userId,
        })
      );
    });

    it('should use custom entityName in log messages', async () => {
      const singleObject = { id: 1, name: 'Custom Entity' };

      await fetchAllPaginatedData<TestItem>({
        ...commonOptions,
        entityName: 'custom-campaigns',
        cursor: singleObject,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Meta API returned a single object for custom-campaigns, expected an array.',
        expect.objectContaining({ userId: commonOptions.userId })
      );
    });
  });
});
