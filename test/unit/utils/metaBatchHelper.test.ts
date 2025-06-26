import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaApiError, ValidationError } from '../../../src/utils/errors.js';
import {
  type BatchRequest,
  classifyMetaPermissionError,
  createBusinessContextDiscoveryRequest,
  createPermissionsFetchRequest,
  executeBatchRequests,
  executeLargeBatchRequests,
  validateBusinessContextForBatch,
} from '../../../src/utils/metaBatchHelper.js';

// Mock environment variables
vi.mock('../../../src/utils/env.js', () => ({
  env: {
    META_MAX_BATCH_SIZE: 50,
    META_API_VERSION: 'v19.0',
    META_API_TIMEOUT: 15000,
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Minimal re-declaration of the MetaApiErrorObject interface for test-only type assertions.
// This mirrors the structure from metaBatchHelper.ts but avoids exporting production-only code.
type MetaApiErrorObject = {
  code?: number;
  message?: string;
  type?: string;
  error_subcode?: number;
};

describe('metaBatchHelper', () => {
  const mockAccessToken = 'test-access-token-123';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeBatchRequests()', () => {
    it('should execute batch requests successfully and match responses by ID', async () => {
      const requests: BatchRequest[] = [
        { id: 'req1', method: 'GET', relativeUrl: 'me' },
        { id: 'req2', method: 'GET', relativeUrl: 'me/accounts' },
        { id: 'req3', method: 'POST', relativeUrl: 'act_123/campaigns', body: '{"name":"Test"}' },
      ];

      const mockApiResponses = [
        { code: 200, body: '{"id":"user123","name":"Test User"}' },
        { code: 200, body: '{"data":[{"id":"act_456","name":"Test Account"}]}' },
        {
          code: 201,
          body: '{"id":"camp_789","name":"Test Campaign"}',
          headers: [{ name: 'Location', value: '/campaigns/789' }],
        },
      ];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponses),
      } as Response);

      const responses = await executeBatchRequests(requests, mockAccessToken);

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v19.0/');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });

      // Verify batch request structure
      const body = new URLSearchParams(options?.body as string);
      expect(body.get('access_token')).toBe(mockAccessToken);
      const batchData = JSON.parse(body.get('batch') || '[]');
      expect(batchData).toEqual([
        { method: 'GET', relative_url: 'me' },
        { method: 'GET', relative_url: 'me/accounts' },
        { method: 'POST', relative_url: 'act_123/campaigns', body: '{"name":"Test"}' },
      ]);

      // Verify responses are correctly matched by ID
      expect(responses).toEqual([
        { id: 'req1', code: 200, body: '{"id":"user123","name":"Test User"}', headers: undefined },
        {
          id: 'req2',
          code: 200,
          body: '{"data":[{"id":"act_456","name":"Test Account"}]}',
          headers: undefined,
        },
        {
          id: 'req3',
          code: 201,
          body: '{"id":"camp_789","name":"Test Campaign"}',
          headers: [{ name: 'Location', value: '/campaigns/789' }],
        },
      ]);
    });

    it('should return empty array for empty request array', async () => {
      const responses = await executeBatchRequests([], mockAccessToken);

      expect(responses).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when batch size exceeds limit', async () => {
      // Create 51 requests (exceeds mocked limit of 50)
      const requests: BatchRequest[] = Array.from({ length: 51 }, (_, i) => ({
        id: `req${i}`,
        method: 'GET',
        relativeUrl: `page_${i}`,
      }));

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(
        ValidationError
      );
      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(
        'Batch size 51 exceeds maximum allowed 50'
      );
    });

    it('should handle timeout errors correctly', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted.'));

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(
        'The operation was aborted.'
      );
    });

    it('should throw MetaApiError for non-ok HTTP responses', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as Response);

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(MetaApiError);
      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(
        'API request failed with status 400: Bad Request'
      );
    });

    it('should handle network errors and log appropriately', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      const networkError = new Error('Network connection failed');
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(
        'Network connection failed'
      );
    });

    it('should handle partial errors in batch responses', async () => {
      const requests: BatchRequest[] = [
        { id: 'success', method: 'GET', relativeUrl: 'me' },
        { id: 'client_error', method: 'GET', relativeUrl: 'invalid' },
        { id: 'server_error', method: 'GET', relativeUrl: 'server_error' },
      ];

      const mockApiResponses = [
        { code: 200, body: '{"id":"user123"}' },
        { code: 400, body: '{"error":{"message":"Invalid request"}}' },
        { code: 500, body: '{"error":{"message":"Internal server error"}}' },
      ];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponses),
      } as Response);

      const responses = await executeBatchRequests(requests, mockAccessToken);

      expect(responses).toHaveLength(3);
      expect(responses[0]?.code).toBe(200);
      expect(responses[1]?.code).toBe(400);
      expect(responses[2]?.code).toBe(500);
    });

    it('should handle requests with various HTTP methods and bodies', async () => {
      const requests: BatchRequest[] = [
        { id: 'get', method: 'GET', relativeUrl: 'me' },
        {
          id: 'post',
          method: 'POST',
          relativeUrl: 'me/photos',
          body: '{"url":"http://example.com/photo.jpg"}',
        },
        { id: 'put', method: 'PUT', relativeUrl: 'me/settings', body: '{"locale":"en_US"}' },
        { id: 'delete', method: 'DELETE', relativeUrl: 'obj_123' },
      ];

      const mockApiResponses = [
        { code: 200, body: '{"id":"user123"}' },
        { code: 201, body: '{"id":"photo123"}' },
        { code: 200, body: '{"success":true}' },
        { code: 204, body: '' },
      ];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponses),
      } as Response);

      const responses = await executeBatchRequests(requests, mockAccessToken);

      expect(responses).toHaveLength(4);
      expect(responses[0]?.id).toBe('get');
      expect(responses[1]?.id).toBe('post');
      expect(responses[2]?.id).toBe('put');
      expect(responses[3]?.id).toBe('delete');
    });
  });

  describe('executeLargeBatchRequests()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should split large requests into multiple batches and aggregate results', async () => {
      // Create 101 requests to exceed batch size limit (50)
      const requests: BatchRequest[] = Array.from({ length: 101 }, (_, i) => ({
        id: `req${i}`,
        method: 'GET',
        relativeUrl: `page_${i}`,
      }));

      const mockFetch = vi.mocked(global.fetch);

      // Mock responses for 3 batches: 50 + 50 + 1
      mockFetch
        .mockResolvedValueOnce({
          // Batch 1
          ok: true,
          json: () =>
            Promise.resolve(
              Array(50)
                .fill(0)
                .map((_, i) => ({ code: 200, body: `{"id":"page${i}"}` }))
            ),
        } as Response)
        .mockResolvedValueOnce({
          // Batch 2
          ok: true,
          json: () =>
            Promise.resolve(
              Array(50)
                .fill(0)
                .map((_, i) => ({ code: 200, body: `{"id":"page${i + 50}"}` }))
            ),
        } as Response)
        .mockResolvedValueOnce({
          // Batch 3
          ok: true,
          json: () => Promise.resolve([{ code: 200, body: '{"id":"page100"}' }]),
        } as Response);

      const promise = executeLargeBatchRequests(requests, mockAccessToken, 2); // 2 concurrent batches

      // Advance timers to handle delays between batch groups
      await vi.advanceTimersByTimeAsync(1000);

      const allResponses = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(allResponses).toHaveLength(101);

      // Verify ID preservation and order
      expect(allResponses[0]?.id).toBe('req0');
      expect(allResponses[50]?.id).toBe('req50');
      expect(allResponses[100]?.id).toBe('req100');
    });

    it('should handle controlled concurrency with proper delays', async () => {
      // Create 150 requests to test multiple batch groups with concurrency
      const requests: BatchRequest[] = Array.from({ length: 150 }, (_, i) => ({
        id: `req${i}`,
        method: 'GET',
        relativeUrl: `item_${i}`,
      }));

      const mockFetch = vi.mocked(global.fetch);

      // Will create 3 batches, with maxConcurrentBatches = 2
      // So batch groups: [batch1, batch2], [batch3]
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(Array(50).fill({ code: 200, body: '{}' })),
      } as Response);

      const promise = executeLargeBatchRequests(requests, mockAccessToken, 2);

      // Advance through delays
      await vi.advanceTimersByTimeAsync(2000);

      const allResponses = await promise;

      expect(allResponses).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail entire operation if one batch fails', async () => {
      const requests: BatchRequest[] = Array.from({ length: 51 }, (_, i) => ({
        id: `req${i}`,
        method: 'GET',
        relativeUrl: `item_${i}`,
      }));

      const mockFetch = vi.mocked(global.fetch);
      mockFetch
        .mockResolvedValueOnce({
          // First batch succeeds
          ok: true,
          json: () => Promise.resolve(Array(50).fill({ code: 200, body: '{}' })),
        } as Response)
        .mockRejectedValueOnce(new Error('Network failure')); // Second batch fails

      const promise = executeLargeBatchRequests(requests, mockAccessToken);

      await expect(promise).rejects.toThrow('Network failure');
    });

    it('should handle empty request array', async () => {
      const responses = await executeLargeBatchRequests([], mockAccessToken);

      expect(responses).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle single batch within size limit', async () => {
      const requests: BatchRequest[] = Array.from({ length: 25 }, (_, i) => ({
        id: `req${i}`,
        method: 'GET',
        relativeUrl: `item_${i}`,
      }));

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(Array(25).fill({ code: 200, body: '{}' })),
      } as Response);

      const responses = await executeLargeBatchRequests(requests, mockAccessToken);

      expect(responses).toHaveLength(25);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createBusinessContextDiscoveryRequest()', () => {
    it('should create correctly formatted business context discovery request', async () => {
      const adAccountId = 'act_123456789';
      const request = createBusinessContextDiscoveryRequest(adAccountId);

      expect(request).toEqual({
        method: 'GET',
        relativeUrl: 'act_123456789?fields=business,name,status',
        id: 'business_context_act_123456789',
      });
    });

    it('should handle different ad account ID formats', async () => {
      const testCases = ['act_123', '123456789', 'act_business_managed_456'];

      for (const adAccountId of testCases) {
        const request = createBusinessContextDiscoveryRequest(adAccountId);

        expect(request.method).toBe('GET');
        expect(request.relativeUrl).toBe(`${adAccountId}?fields=business,name,status`);
        expect(request.id).toBe(`business_context_${adAccountId}`);
      }
    });
  });

  describe('createPermissionsFetchRequest()', () => {
    it('should include business parameter for string businessId', async () => {
      const request = createPermissionsFetchRequest('act_123', 'biz_456');

      expect(request.method).toBe('GET');
      expect(request.relativeUrl).toBe('act_123/assigned_users?fields=id%2Ctasks&business=biz_456');
      expect(request.id).toBe('permissions_act_123');
    });

    it('should OMIT business parameter for null businessId (non-business account)', async () => {
      const request = createPermissionsFetchRequest('act_123', null);

      expect(request.relativeUrl).toBe('act_123/assigned_users?fields=id%2Ctasks');
      expect(request.relativeUrl).not.toContain('business=');
    });

    it('should OMIT business parameter for undefined businessId (unknown context)', async () => {
      const request = createPermissionsFetchRequest('act_123', undefined);

      expect(request.relativeUrl).toBe('act_123/assigned_users?fields=id%2Ctasks');
      expect(request.relativeUrl).not.toContain('business=');
    });

    it('should OMIT business parameter for empty string businessId', async () => {
      const request = createPermissionsFetchRequest('act_123', '');

      expect(request.relativeUrl).toBe('act_123/assigned_users?fields=id%2Ctasks');
      expect(request.relativeUrl).not.toContain('business=');
    });

    it('should handle special characters in business ID', async () => {
      const request = createPermissionsFetchRequest('act_123', 'biz_789_special-chars');

      expect(request.relativeUrl).toBe(
        'act_123/assigned_users?fields=id%2Ctasks&business=biz_789_special-chars'
      );
    });

    it('should create unique IDs for different ad accounts', async () => {
      const request1 = createPermissionsFetchRequest('act_111', 'biz_222');
      const request2 = createPermissionsFetchRequest('act_333', 'biz_444');

      expect(request1.id).toBe('permissions_act_111');
      expect(request2.id).toBe('permissions_act_333');
    });
  });

  describe('classifyMetaPermissionError()', () => {
    it('should classify business_required errors', async () => {
      const testCases = [
        {
          code: 100,
          message: '(#3) To make this call for the ad account, a business is required.',
        },
        { code: 100, message: 'business is required for this operation' },
        { code: 100, message: 'This operation requires a business context, business is required' },
      ];

      for (const error of testCases) {
        expect(classifyMetaPermissionError(error)).toBe('business_required');
      }
    });

    it('should classify permission_denied errors', async () => {
      const testCases = [
        { code: 200, message: 'Insufficient permissions' },
        { code: 210, message: 'User does not have permission' },
        { code: 299, message: 'Access denied' },
      ];

      for (const error of testCases) {
        expect(classifyMetaPermissionError(error)).toBe('permission_denied');
      }
    });

    it('should classify user_not_found errors', async () => {
      const testCases = [
        { code: 100, message: 'User is not found' },
        { code: 100, message: 'This user has no tasks on the ad account' },
        { code: 100, message: 'User not found in business' },
      ];

      for (const error of testCases) {
        expect(classifyMetaPermissionError(error)).toBe('user_not_found');
      }
    });

    it('should classify unknown errors and handle edge cases', async () => {
      const testCases = [
        { code: 999, message: 'Unknown error' },
        { code: 1, message: 'API temporarily unavailable' },
        { message: 'Error without code' },
        { code: 100 }, // Code without message
        {},
      ];

      for (const error of testCases) {
        // Cast through unknown to MetaApiErrorObject to maintain type safety without using `any`.
        expect(classifyMetaPermissionError(error as unknown as MetaApiErrorObject)).toBe('unknown');
      }
    });

    it('should handle null and undefined errors', async () => {
      expect(classifyMetaPermissionError(null)).toBe('unknown');
      expect(classifyMetaPermissionError(undefined)).toBe('unknown');
    });

    it('should handle malformed error objects', async () => {
      const malformedErrors = [
        { code: 'not_a_number', message: 'Invalid code type' },
        { code: 100, message: null },
        { code: null, message: 'business is required' },
      ];

      for (const error of malformedErrors) {
        // Cast through unknown to MetaApiErrorObject to maintain type safety without using `any`.
        expect(classifyMetaPermissionError(error as unknown as MetaApiErrorObject)).toBe('unknown');
      }
    });
  });

  describe('validateBusinessContextForBatch()', () => {
    it('should correctly categorize accounts and determine readiness', async () => {
      const accounts = [
        { id: 'acc_1', businessId: 'biz_123' }, // Business managed
        { id: 'acc_2', businessId: 'biz_456' }, // Business managed
        { id: 'acc_3', businessId: null }, // Non-business
        { id: 'acc_4', businessId: undefined }, // Unknown context
        { id: 'acc_5', businessId: undefined }, // Unknown context
        { id: 'acc_6', businessId: '' }, // Empty string (should be filtered out)
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.totalAccounts).toBe(6);
      expect(result.businessManagedCount).toBe(2); // acc_1, acc_2
      expect(result.nonBusinessCount).toBe(1); // acc_3
      expect(result.unknownContextCount).toBe(2); // acc_4, acc_5 (acc_6 empty string not counted as unknown)
      expect(result.needsDiscovery).toEqual(['acc_4', 'acc_5']);
      expect(result.isReady).toBe(false); // Has unknown contexts
    });

    it('should return isReady=true when all contexts are known', async () => {
      const accounts = [
        { id: 'acc_1', businessId: 'biz_123' }, // Business managed
        { id: 'acc_2', businessId: 'biz_456' }, // Business managed
        { id: 'acc_3', businessId: null }, // Non-business
        { id: 'acc_4', businessId: null }, // Non-business
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.isReady).toBe(true);
      expect(result.unknownContextCount).toBe(0);
      expect(result.needsDiscovery).toEqual([]);
    });

    it('should handle empty account array', async () => {
      const result = validateBusinessContextForBatch([]);

      expect(result.totalAccounts).toBe(0);
      expect(result.businessManagedCount).toBe(0);
      expect(result.nonBusinessCount).toBe(0);
      expect(result.unknownContextCount).toBe(0);
      expect(result.needsDiscovery).toEqual([]);
      expect(result.isReady).toBe(true); // Empty array is considered "ready"
    });

    it('should handle all business-managed accounts', async () => {
      const accounts = [
        { id: 'acc_1', businessId: 'biz_123' },
        { id: 'acc_2', businessId: 'biz_456' },
        { id: 'acc_3', businessId: 'biz_789' },
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.totalAccounts).toBe(3);
      expect(result.businessManagedCount).toBe(3);
      expect(result.nonBusinessCount).toBe(0);
      expect(result.unknownContextCount).toBe(0);
      expect(result.isReady).toBe(true);
    });

    it('should handle all non-business accounts', async () => {
      const accounts = [
        { id: 'acc_1', businessId: null },
        { id: 'acc_2', businessId: null },
        { id: 'acc_3', businessId: null },
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.totalAccounts).toBe(3);
      expect(result.businessManagedCount).toBe(0);
      expect(result.nonBusinessCount).toBe(3);
      expect(result.unknownContextCount).toBe(0);
      expect(result.isReady).toBe(true);
    });

    it('should handle all unknown context accounts', async () => {
      const accounts = [
        { id: 'acc_1', businessId: undefined },
        { id: 'acc_2', businessId: undefined },
        { id: 'acc_3', businessId: undefined },
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.totalAccounts).toBe(3);
      expect(result.businessManagedCount).toBe(0);
      expect(result.nonBusinessCount).toBe(0);
      expect(result.unknownContextCount).toBe(3);
      expect(result.needsDiscovery).toEqual(['acc_1', 'acc_2', 'acc_3']);
      expect(result.isReady).toBe(false);
    });

    it('should properly filter empty string business IDs', async () => {
      const accounts = [
        { id: 'acc_1', businessId: '' }, // Empty string - not business managed
        { id: 'acc_2', businessId: '   ' }, // Whitespace - still counts as business managed
        { id: 'acc_3', businessId: 'biz_123' },
      ];

      const result = validateBusinessContextForBatch(accounts);

      expect(result.businessManagedCount).toBe(2); // acc_2 (whitespace) and acc_3
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed API responses in executeBatchRequests', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // Empty array instead of null
      } as Response);

      // Should handle gracefully
      const responses = await executeBatchRequests(requests, mockAccessToken);
      expect(Array.isArray(responses)).toBe(true);
      expect(responses).toHaveLength(0);
    });

    it('should handle JSON parsing errors in batch responses', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow('Invalid JSON');
    });

    it('should handle rate limiting scenarios', async () => {
      const requests: BatchRequest[] = [{ id: 'req1', method: 'GET', relativeUrl: 'me' }];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(executeBatchRequests(requests, mockAccessToken)).rejects.toThrow(MetaApiError);
    });

    it('should handle concurrent batch processing stress test', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ code: 200, body: '{}' }]),
      } as Response);

      const batchPromises = Array.from({ length: 10 }, (_, i) => {
        const requests: BatchRequest[] = [
          { id: `concurrent_${i}`, method: 'GET', relativeUrl: `test_${i}` },
        ];
        return executeBatchRequests(requests, `token_${i}`);
      });

      const results = await Promise.all(batchPromises);

      expect(results).toHaveLength(10);
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('should handle large payload edge case', async () => {
      // Create request with very large body
      const largeBody = JSON.stringify({ data: 'x'.repeat(10000) });
      const requests: BatchRequest[] = [
        { id: 'large', method: 'POST', relativeUrl: 'me/posts', body: largeBody },
      ];

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ code: 200, body: '{"id":"post123"}' }]),
      } as Response);

      const responses = await executeBatchRequests(requests, mockAccessToken);

      expect(responses).toHaveLength(1);
      expect(responses[0]?.code).toBe(200);
    });
  });
});
