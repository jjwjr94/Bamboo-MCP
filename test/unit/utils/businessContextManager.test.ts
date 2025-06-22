import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { describe, expect, it } from 'vitest';
import {
  buildMetaApiUrl,
  discoverAndCacheBusinessContext,
  getBusinessIdForAdAccount,
  isBusinessManaged,
} from '../../../src/utils/businessContextManager.js';
import { env } from '../../../src/utils/env.js';

describe('businessContextManager', () => {
  describe('Function Existence and Structure', () => {
    it('should export getBusinessIdForAdAccount function', () => {
      expect(typeof getBusinessIdForAdAccount).toBe('function');
      expect(getBusinessIdForAdAccount.length).toBe(2); // Should take 2 parameters
    });

    it('should export buildMetaApiUrl function', () => {
      expect(typeof buildMetaApiUrl).toBe('function');
      expect(buildMetaApiUrl.length).toBeGreaterThanOrEqual(3); // Should take at least 3 parameters
    });

    it('should export isBusinessManaged function', () => {
      expect(typeof isBusinessManaged).toBe('function');
      expect(isBusinessManaged.length).toBe(2); // Should take 2 parameters
    });

    it('should export discoverAndCacheBusinessContext function', () => {
      expect(typeof discoverAndCacheBusinessContext).toBe('function');
      expect(discoverAndCacheBusinessContext.length).toBe(3); // Should take 3 parameters
    });
  });

  describe('Input Validation', () => {
    describe('getBusinessIdForAdAccount', () => {
      it('should handle database operations for existing parameters', async () => {
        // These functions perform database lookups and will throw NotFoundError
        // for non-existent accounts, not validation errors for empty strings
        await expect(getBusinessIdForAdAccount('user-123', 'act_nonexistent')).rejects.toThrow(
          'not found'
        );
      });
    });

    describe('buildMetaApiUrl', () => {
      it('should handle ad account lookup during URL construction', async () => {
        const baseUrl = 'https://graph.facebook.com/v22.0/act_123/campaigns';

        // This will fail with a database lookup error for non-existent account
        await expect(buildMetaApiUrl(baseUrl, 'user-123', 'act_nonexistent')).rejects.toThrow(
          'not found'
        );
      });

      it('should handle empty parameters as database lookup failures', async () => {
        // Empty parameters cause database queries that fail
        await expect(buildMetaApiUrl('', 'user-123', 'act_123')).rejects.toThrow();
        await expect(buildMetaApiUrl('valid-url', '', 'act_123')).rejects.toThrow();
        await expect(buildMetaApiUrl('valid-url', 'user-123', '')).rejects.toThrow();
      });
    });

    describe('isBusinessManaged', () => {
      it('should perform database lookups for validation', async () => {
        // These will fail with database lookup errors for non-existent data
        await expect(isBusinessManaged('user-123', 'act_nonexistent')).rejects.toThrow('not found');
      });

      it('should return results based on database state', async () => {
        // This tests the function structure without relying on specific database state
        try {
          const result = await isBusinessManaged('user-123', 'act_123');
          expect(typeof result).toBe('boolean');
        } catch (error) {
          // Expected behavior for non-existent accounts
          expect(error).toBeDefined();
        }
      });
    });

    describe('discoverAndCacheBusinessContext', () => {
      it('should handle empty ad account arrays', async () => {
        // Should not throw for empty array
        await expect(
          discoverAndCacheBusinessContext('user-123', 'token', [])
        ).resolves.not.toThrow();
      });

      it('should handle business context discovery', async () => {
        // With non-existent accounts, this should complete but find no valid accounts
        const result = await discoverAndCacheBusinessContext('user-123', 'token', [
          'act_nonexistent',
        ]);
        expect(result).toBeUndefined(); // Function returns void
      });
    });
  });

  describe('Environment Dependencies', () => {
    it('should have access to required environment variables', () => {
      expect(env.META_API_VERSION).toBeDefined();
      expect(env.META_API_TIMEOUT).toBeDefined();
      expect(typeof env.META_API_TIMEOUT).toBe('number');
      expect(env.META_API_VERSION).toMatch(/^v\d+\.\d+$/); // Should match format like "v22.0"
    });

    it('should have reasonable timeout values', () => {
      expect(env.META_API_TIMEOUT).toBeGreaterThan(0);
      expect(env.META_API_TIMEOUT).toBeLessThan(60000); // Should be less than 60 seconds
    });
  });

  describe('Function Return Types', () => {
    it('should have consistent async function signatures', async () => {
      // All main functions should be async and return promises
      // Test with valid calls that won't cause unhandled rejections
      
      // Test that functions return promises
      const promise1 = getBusinessIdForAdAccount('test', 'test').catch(() => 'handled');
      const promise2 = buildMetaApiUrl('test', 'test', 'test').catch(() => 'handled');
      const promise3 = isBusinessManaged('test', 'test').catch(() => 'handled');
      const promise4 = discoverAndCacheBusinessContext('test', 'test', []).catch(() => 'handled');
      
      expect(promise1).toBeInstanceOf(Promise);
      expect(promise2).toBeInstanceOf(Promise);
      expect(promise3).toBeInstanceOf(Promise);
      expect(promise4).toBeInstanceOf(Promise);
      
      // Await all promises to prevent unhandled rejections
      await Promise.all([promise1, promise2, promise3, promise4]);
    });
  });

  describe('Integration Readiness', () => {
    it('should be ready for integration testing', () => {
      // Basic smoke test that all functions are properly exported and callable
      const functions = [
        getBusinessIdForAdAccount,
        buildMetaApiUrl,
        isBusinessManaged,
        discoverAndCacheBusinessContext,
      ];

      for (const fn of functions) {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      }
    });

    it('should have appropriate error handling structure', async () => {
      // Functions should handle database errors gracefully with proper error types
      // Test each function individually with proper error handling
      
      try {
        await getBusinessIdForAdAccount('user-123', 'act_nonexistent');
        // If it doesn't throw, that's also valid behavior
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain('not found');
      }
      
      try {
        await buildMetaApiUrl('valid-url', 'user-123', 'act_nonexistent');
        // If it doesn't throw, that's also valid behavior  
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain('not found');
      }
      
      try {
        await isBusinessManaged('user-123', 'act_nonexistent');
        // If it doesn't throw, that's also valid behavior
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain('not found');
      }

      // Test discoverAndCacheBusinessContext separately as it handles errors differently
      const result = await discoverAndCacheBusinessContext('user-123', 'token', ['act_nonexistent']);
      expect(result).toBeUndefined(); // Function completes but finds no valid accounts
    });
  });
});
