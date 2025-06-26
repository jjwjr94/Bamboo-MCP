import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../src/utils/env.js';
import { MetaApiError } from '../../../src/utils/errors.js';
import { createMetaResiliencePolicy } from '../../../src/utils/resiliencePolicy.js';

// Store original env values
const originalEnv = { ...env };

describe('Resilience Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset environment after each test
    Object.assign(env, originalEnv);
  });

  it('should create a resilience policy with proper configuration', () => {
    const policy = createMetaResiliencePolicy();
    expect(policy).toBeDefined();
    expect(typeof policy.execute).toBe('function');
  });

  it('should properly handle environment variable defaults', () => {
    // Test that createMetaResiliencePolicy() works with default environment values
    const policy = createMetaResiliencePolicy();
    expect(policy).toBeDefined();
  });

  describe('Basic Functionality', () => {
    it('should execute successful functions normally', async () => {
      const policy = createMetaResiliencePolicy();
      const successFunction = vi.fn().mockResolvedValue('success');

      const result = await policy.execute(successFunction);

      expect(result).toBe('success');
      expect(successFunction).toHaveBeenCalledTimes(1);
    });

    it('should not retry non-retryable errors', async () => {
      const policy = createMetaResiliencePolicy();
      const nonRetryableError = new MetaApiError(
        'Invalid OAuth access token',
        '190',
        '463',
        401,
        'OAuthException',
        'A4TBZM5Q6P6h1HQZaQZfKy7'
      );
      const mockApiCall = vi.fn().mockRejectedValue(nonRetryableError);

      await expect(policy.execute(mockApiCall)).rejects.toThrow(nonRetryableError);

      // Should be called only once for non-retryable errors
      expect(mockApiCall).toHaveBeenCalledTimes(1);
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

    it('should handle function that returns null', async () => {
      const policy = createMetaResiliencePolicy();
      const nullReturningFunction = vi.fn().mockResolvedValue(null);

      const result = await policy.execute(nullReturningFunction);

      expect(result).toBeNull();
      expect(nullReturningFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle synchronous errors thrown from function', async () => {
      const policy = createMetaResiliencePolicy();
      const throwingFunction = vi.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(policy.execute(throwingFunction)).rejects.toThrow('Synchronous error');
      expect(throwingFunction).toHaveBeenCalled();
    });
  });

  describe('Error Classification', () => {
    it('should classify OAuth errors as non-retryable', async () => {
      const policy = createMetaResiliencePolicy();
      const oAuthError = new MetaApiError(
        'Invalid OAuth access token',
        '190',
        '463',
        401,
        'OAuthException',
        'A4TBZM5Q6P6h1HQZaQZfKy7'
      );
      const mockApiCall = vi.fn().mockRejectedValue(oAuthError);

      await expect(policy.execute(mockApiCall)).rejects.toThrow(oAuthError);
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    it('should classify validation errors as non-retryable', async () => {
      const policy = createMetaResiliencePolicy();
      const validationError = new MetaApiError(
        'Campaign name is required',
        '100',
        '1885634',
        400,
        'FacebookApiException',
        'RF7-GH8qMkL'
      );
      const mockApiCall = vi.fn().mockRejectedValue(validationError);

      await expect(policy.execute(mockApiCall)).rejects.toThrow(validationError);
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    it('should handle business logic errors appropriately', async () => {
      const policy = createMetaResiliencePolicy();
      const businessError = new MetaApiError(
        'Campaign not found',
        '100',
        '1487742',
        404,
        'OAuthException',
        'QT6fQr-5nAR'
      );
      const mockApiCall = vi.fn().mockRejectedValue(businessError);

      await expect(policy.execute(mockApiCall)).rejects.toThrow(businessError);
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('Request Scoped Policies', () => {
    it('should create isolated policy instances', () => {
      const policy1 = createMetaResiliencePolicy();
      const policy2 = createMetaResiliencePolicy();

      expect(policy1).not.toBe(policy2);
      expect(policy1).toBeDefined();
      expect(policy2).toBeDefined();
    });

    it('should handle concurrent executions independently', async () => {
      const policy1 = createMetaResiliencePolicy();
      const policy2 = createMetaResiliencePolicy();

      const function1 = vi.fn().mockResolvedValue('result1');
      const function2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        policy1.execute(function1),
        policy2.execute(function2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(function1).toHaveBeenCalledTimes(1);
      expect(function2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Environment Configuration', () => {
    it('should work with different environment configurations', () => {
      // Test that the policy can be created with various environment configurations
      env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = 10;
      env.RETRY_MAX_ATTEMPTS = 5;

      const policy = createMetaResiliencePolicy();

      expect(policy).toBeDefined();
      expect(typeof policy.execute).toBe('function');
    });

    it('should handle edge case environment values', () => {
      env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = 1;
      env.RETRY_MAX_ATTEMPTS = 1;
      env.CIRCUIT_BREAKER_RESET_TIMEOUT = 1000;

      const policy = createMetaResiliencePolicy();

      expect(policy).toBeDefined();
      // Should gracefully handle minimal configuration values
    });
  });
});
