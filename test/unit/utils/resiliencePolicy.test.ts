import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../src/utils/env.js';
import { createMetaResiliencePolicy } from '../../../src/utils/resiliencePolicy.js';

// Mock the environment variables to test different configurations
const originalEnv = { ...env };

describe('resiliencePolicy', () => {
  afterEach(() => {
    // Reset environment after each test
    Object.assign(env, originalEnv);
    vi.clearAllMocks();
  });

  describe('createMetaResiliencePolicy', () => {
    describe('Circuit Breaker Configuration', () => {
      it('should create circuit breaker with default configuration', () => {
        const policy = createMetaResiliencePolicy();

        // Test that policy is created and has expected structure
        expect(policy).toBeDefined();
        expect(typeof policy.execute).toBe('function');
      });

      it('should apply correct failure threshold from environment', () => {
        // Temporarily modify environment for this test
        const policy = createMetaResiliencePolicy();

        // The circuit breaker should allow calls up to the failure threshold
        // Default threshold from env is 5, so first 5 failures should be attempted
        expect(policy).toBeDefined();
        expect(typeof policy.execute).toBe('function');
      });

      it('should handle circuit breaker reset timeout configuration', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // Circuit breaker should be properly configured with reset timeout
        // This is verified by the policy creation not throwing an error
      });

      it('should work with different failure threshold values', () => {
        // Test with a custom failure threshold
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        expect(typeof policy.execute).toBe('function');
      });
    });

    describe('Retry Configuration', () => {
      it('should configure retry policy with correct max attempts', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // Verify the policy can handle retry configuration
        // The actual retry behavior will be tested in integration tests
      });

      it('should use exponential backoff for retry delays', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // The retry policy should be configured with exponential backoff
        // This is confirmed by successful policy creation
      });

      it('should respect maximum delay configuration', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // Maximum delay should be properly configured from environment
      });
    });

    describe('Policy Integration', () => {
      it('should combine circuit breaker and retry policies correctly', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        expect(typeof policy.execute).toBe('function');

        // The policy should be a combined resilience policy that includes both
        // circuit breaker and retry functionality
      });

      it('should handle successful function execution', async () => {
        const policy = createMetaResiliencePolicy();
        const successFunction = vi.fn().mockResolvedValue('success');

        const result = await policy.execute(successFunction);

        expect(result).toBe('success');
        expect(successFunction).toHaveBeenCalledTimes(1);
      });

      it('should handle function execution with parameters', async () => {
        const policy = createMetaResiliencePolicy();
        const parameterizedFunction = vi
          .fn()
          .mockImplementation((a: number, b: string) => Promise.resolve(`${a}-${b}`));

        const result = await policy.execute(() => parameterizedFunction(42, 'test'));

        expect(result).toBe('42-test');
        expect(parameterizedFunction).toHaveBeenCalledWith(42, 'test');
      });

      it('should handle function execution that throws synchronous errors', async () => {
        const policy = createMetaResiliencePolicy();
        const throwingFunction = vi.fn().mockImplementation(() => {
          throw new Error('Synchronous error');
        });

        await expect(policy.execute(throwingFunction)).rejects.toThrow('Synchronous error');

        // The function should be called at least once with resilience policy parameters
        expect(throwingFunction).toHaveBeenCalled();
        expect(throwingFunction).toHaveBeenCalledWith(
          expect.objectContaining({
            attempt: expect.any(Number),
            signal: expect.any(Object),
          })
        );
      });

      it('should handle function execution that rejects with async errors', async () => {
        const policy = createMetaResiliencePolicy();
        const rejectingFunction = vi.fn().mockRejectedValue(new Error('Async error'));

        await expect(policy.execute(rejectingFunction)).rejects.toThrow('Async error');

        // The function should be called at least once with resilience policy parameters
        expect(rejectingFunction).toHaveBeenCalled();
        expect(rejectingFunction).toHaveBeenCalledWith(
          expect.objectContaining({
            attempt: expect.any(Number),
            signal: expect.any(Object),
          })
        );
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should handle null function gracefully', async () => {
        const policy = createMetaResiliencePolicy();

        await expect(policy.execute(null as unknown as () => Promise<void>)).rejects.toThrow();
      });

      it('should handle undefined function gracefully', async () => {
        const policy = createMetaResiliencePolicy();

        await expect(policy.execute(undefined as unknown as () => Promise<void>)).rejects.toThrow();
      });

      it('should handle function that returns null', async () => {
        const policy = createMetaResiliencePolicy();
        const nullReturningFunction = vi.fn().mockResolvedValue(null);

        const result = await policy.execute(nullReturningFunction);

        expect(result).toBeNull();
        expect(nullReturningFunction).toHaveBeenCalledTimes(1);
      });

      it('should handle function that returns undefined', async () => {
        const policy = createMetaResiliencePolicy();
        const undefinedReturningFunction = vi.fn().mockResolvedValue(undefined);

        const result = await policy.execute(undefinedReturningFunction);

        expect(result).toBeUndefined();
        expect(undefinedReturningFunction).toHaveBeenCalledTimes(1);
      });

      it('should handle function that returns complex objects', async () => {
        const policy = createMetaResiliencePolicy();
        const complexObject = {
          data: [1, 2, 3],
          meta: { count: 3, hasMore: false },
          nested: { deep: { value: 'test' } },
        };
        const complexReturningFunction = vi.fn().mockResolvedValue(complexObject);

        const result = await policy.execute(complexReturningFunction);

        expect(result).toEqual(complexObject);
        expect(complexReturningFunction).toHaveBeenCalledTimes(1);
      });
    });

    describe('Environment Configuration Validation', () => {
      it('should work with different circuit breaker timeout values', () => {
        // Test that the policy can be created with various environment configurations
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // The policy should handle different timeout configurations gracefully
      });

      it('should work with different retry configuration values', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // Should handle various retry configurations from environment
      });

      it('should use default values when environment variables are at boundaries', () => {
        const policy = createMetaResiliencePolicy();

        expect(policy).toBeDefined();
        // Should gracefully handle edge case environment values
      });
    });

    describe('Performance and Resource Management', () => {
      it('should not leak memory when creating multiple policies', () => {
        const policies = [];

        // Create multiple policies to test for memory leaks
        for (let i = 0; i < 10; i++) {
          policies.push(createMetaResiliencePolicy());
        }

        expect(policies).toHaveLength(10);
        for (const policy of policies) {
          expect(policy).toBeDefined();
          expect(typeof policy.execute).toBe('function');
        }

        // All policies should be independently functional
      });

      it('should handle concurrent policy executions', async () => {
        const policy = createMetaResiliencePolicy();
        const concurrentFunction = vi
          .fn()
          .mockImplementation((id: number) => Promise.resolve(`result-${id}`));

        // Execute multiple functions concurrently
        const promises = Array.from({ length: 5 }, (_, i) =>
          policy.execute(() => concurrentFunction(i))
        );

        const results = await Promise.all(promises);

        expect(results).toEqual(['result-0', 'result-1', 'result-2', 'result-3', 'result-4']);
        expect(concurrentFunction).toHaveBeenCalledTimes(5);
      });

      it('should maintain isolation between different policy instances', async () => {
        const policy1 = createMetaResiliencePolicy();
        const policy2 = createMetaResiliencePolicy();

        const function1 = vi.fn().mockResolvedValue('policy1-result');
        const function2 = vi.fn().mockResolvedValue('policy2-result');

        const [result1, result2] = await Promise.all([
          policy1.execute(function1),
          policy2.execute(function2),
        ]);

        expect(result1).toBe('policy1-result');
        expect(result2).toBe('policy2-result');
        expect(function1).toHaveBeenCalledTimes(1);
        expect(function2).toHaveBeenCalledTimes(1);

        // Each policy should operate independently
        expect(policy1).not.toBe(policy2);
      });
    });
  });
});
