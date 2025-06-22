import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { describe, expect, it } from 'vitest';
import {
  type MetaErrorDetails,
  getRetryDelayMultiplier,
  isMetaOAuthTokenError,
  isMetaRateLimitError,
  parseErrorDetails,
  shouldRetryMetaError,
} from '../../../src/utils/metaErrorClassifier.js';

describe('metaErrorClassifier', () => {
  // Mock error data representing different Meta API error shapes
  const mockErrors = {
    // Rate limit errors - should be retried with higher delay multiplier
    rateLimitError341: {
      error: { code: '341', message: 'Application limit reached' },
    },
    rateLimitError368: {
      error: { code: '368', message: 'Rate limit exceeded' },
    },

    // OAuth/Authentication errors - should NOT be retried
    oauthError190: {
      error: { code: '190', message: 'Invalid OAuth access token' },
    },
    oauthError200: {
      error: { code: '200', message: 'Permission denied' },
    },
    oauthError458: {
      error: { code: '458', message: 'App not installed' },
    },

    // Validation errors - should NOT be retried
    validationError100: {
      error: { code: '100', message: 'Invalid parameter' },
    },
    validationError506: {
      error: { code: '506', message: 'Duplicate post' },
    },
    validationError1609005: {
      error: { code: '1609005', message: 'Invalid image file' },
    },

    // Transient errors - should be retried
    transientErrorExplicit: {
      error: { code: '2', message: 'Temporary issue', is_transient: true },
    },
    sdkTimeoutError: {
      error: { code: 'SDK_TIMEOUT', message: 'Request timeout' },
    },
    timeoutError: {
      error: { code: 'TIMEOUT_ERROR', message: 'Operation timed out' },
    },

    // Server errors (5xx HTTP status) - should be retried
    serverError500: {
      statusCode: 500,
      error: { message: 'Internal server error' },
    },
    serverError502: {
      statusCode: 502,
      error: { message: 'Bad gateway' },
    },
    serverError503: {
      statusCode: 503,
      error: { message: 'Service unavailable' },
    },

    // Client errors (4xx HTTP status) - should NOT be retried
    clientError400: {
      statusCode: 400,
      error: { message: 'Bad request' },
    },
    clientError404: {
      statusCode: 404,
      error: { message: 'Not found' },
    },

    // Different error shapes - Meta SDK and custom MetaApiError formats
    metaApiErrorFormat: {
      metaErrorCode: '190',
      metaErrorSubcode: '458',
      message: 'Token expired',
    },
    responseDataFormat: {
      response: {
        status: 500,
        data: {
          error: {
            code: '2',
            error_subcode: '1357006',
            type: 'OAuthException',
            message: 'Session expired',
          },
        },
      },
    },
    oauthExceptionType: {
      error: {
        type: 'OAuthException',
        code: '190',
        message: 'Access token expired',
      },
    },

    // Edge cases
    nullError: null,
    undefinedError: undefined,
    stringError: 'Simple string error',
    numberError: 404,
    emptyObjectError: {},
    errorWithoutCode: {
      error: { message: 'Error without code' },
    },
  };

  // NEW TEST SUITE FOR parseErrorDetails
  describe('parseErrorDetails', () => {
    it('should correctly parse the custom MetaApiError format', () => {
      const expected: MetaErrorDetails = {
        code: '190',
        subcode: '458',
        type: undefined,
        isTransient: undefined,
        statusCode: undefined,
        message: 'Token expired',
      };
      expect(parseErrorDetails(mockErrors.metaApiErrorFormat)).toEqual(expected);
    });

    it('should correctly parse the nested response.data format', () => {
      const expected: MetaErrorDetails = {
        code: '2',
        subcode: '1357006',
        type: 'OAuthException',
        isTransient: undefined,
        statusCode: 500,
        message: 'Session expired',
      };
      expect(parseErrorDetails(mockErrors.responseDataFormat)).toEqual(expected);
    });

    it('should correctly parse an error with an explicit is_transient flag', () => {
      const expected: MetaErrorDetails = {
        code: '2',
        subcode: undefined,
        type: undefined,
        isTransient: true,
        statusCode: undefined,
        message: 'Temporary issue',
      };
      expect(parseErrorDetails(mockErrors.transientErrorExplicit)).toEqual(expected);
    });

    it('should correctly parse standard error format', () => {
      const expected: MetaErrorDetails = {
        code: '190',
        subcode: undefined,
        type: 'OAuthException',
        isTransient: undefined,
        statusCode: undefined,
        message: 'Access token expired',
      };
      expect(parseErrorDetails(mockErrors.oauthExceptionType)).toEqual(expected);
    });

    it('should correctly parse server error format', () => {
      const expected: MetaErrorDetails = {
        code: undefined,
        subcode: undefined,
        type: undefined,
        isTransient: undefined,
        statusCode: 500,
        message: 'Internal server error',
      };
      expect(parseErrorDetails(mockErrors.serverError500)).toEqual(expected);
    });

    it('should return an empty object for null or undefined input', () => {
      expect(parseErrorDetails(null)).toEqual({});
      expect(parseErrorDetails(undefined)).toEqual({});
    });

    it('should return an empty object for primitive types', () => {
      expect(parseErrorDetails('a string error')).toEqual({});
      expect(parseErrorDetails(404)).toEqual({});
      expect(parseErrorDetails(true)).toEqual({});
    });

    it('should handle empty objects gracefully', () => {
      expect(parseErrorDetails({})).toEqual({
        code: undefined,
        subcode: undefined,
        type: undefined,
        isTransient: undefined,
        statusCode: undefined,
        message: undefined,
      });
    });

    it('should prioritize metaErrorCode over nested error.code', () => {
      const mixedError = {
        metaErrorCode: '341', // Should take precedence
        error: { code: '190' }, // Should be ignored
      };
      const expected: MetaErrorDetails = {
        code: '341',
        subcode: undefined,
        type: undefined,
        isTransient: undefined,
        statusCode: undefined,
        message: undefined,
      };
      expect(parseErrorDetails(mixedError)).toEqual(expected);
    });

    it('should handle numeric error codes by converting to string', () => {
      const numericCodeError = {
        error: { code: 190, message: 'Numeric code test' },
      };
      const expected: MetaErrorDetails = {
        code: '190',
        subcode: undefined,
        type: undefined,
        isTransient: undefined,
        statusCode: undefined,
        message: 'Numeric code test',
      };
      expect(parseErrorDetails(numericCodeError)).toEqual(expected);
    });
  });

  describe('shouldRetryMetaError', () => {
    describe('Retryable Errors', () => {
      it('should return true for explicit transient errors', () => {
        expect(shouldRetryMetaError(mockErrors.transientErrorExplicit)).toBe(true);
      });

      it('should return true for rate limit error codes', () => {
        expect(shouldRetryMetaError(mockErrors.rateLimitError341)).toBe(true);
        expect(shouldRetryMetaError(mockErrors.rateLimitError368)).toBe(true);
      });

      it('should return true for SDK timeout errors', () => {
        expect(shouldRetryMetaError(mockErrors.sdkTimeoutError)).toBe(true);
        expect(shouldRetryMetaError(mockErrors.timeoutError)).toBe(true);
      });

      it('should return true for server errors (5xx status codes)', () => {
        expect(shouldRetryMetaError(mockErrors.serverError500)).toBe(true);
        expect(shouldRetryMetaError(mockErrors.serverError502)).toBe(true);
        expect(shouldRetryMetaError(mockErrors.serverError503)).toBe(true);
      });

      it('should return true for mixed response format with retryable codes', () => {
        const mixedRetryableError = {
          response: {
            status: 429,
            data: { error: { code: '341' } },
          },
        };
        expect(shouldRetryMetaError(mixedRetryableError)).toBe(true);
      });
    });

    describe('Non-Retryable Errors', () => {
      it('should return false for OAuth/authentication errors', () => {
        expect(shouldRetryMetaError(mockErrors.oauthError190)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.oauthError200)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.oauthError458)).toBe(false);
      });

      it('should return false for OAuthException type errors', () => {
        expect(shouldRetryMetaError(mockErrors.oauthExceptionType)).toBe(false);
      });

      it('should return false for an error with only OAuthException type', () => {
        const oauthTypeOnlyError = {
          error: {
            type: 'OAuthException',
            message: 'An unknown auth error occurred.',
          },
        };
        expect(shouldRetryMetaError(oauthTypeOnlyError)).toBe(false);
      });

      it('should return false for validation errors', () => {
        expect(shouldRetryMetaError(mockErrors.validationError100)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.validationError506)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.validationError1609005)).toBe(false);
      });

      it('should return false for client errors (4xx status codes)', () => {
        expect(shouldRetryMetaError(mockErrors.clientError400)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.clientError404)).toBe(false);
      });

      it('should return false for invalid input types', () => {
        expect(shouldRetryMetaError(mockErrors.nullError)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.undefinedError)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.stringError)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.numberError)).toBe(false);
      });

      it('should return false for errors without meaningful error codes', () => {
        expect(shouldRetryMetaError(mockErrors.emptyObjectError)).toBe(false);
        expect(shouldRetryMetaError(mockErrors.errorWithoutCode)).toBe(false);
      });
    });

    describe('Different Error Formats', () => {
      it('should handle MetaApiError format correctly', () => {
        expect(shouldRetryMetaError(mockErrors.metaApiErrorFormat)).toBe(false); // Code 190 is OAuth
      });

      it('should handle response.data format correctly', () => {
        expect(shouldRetryMetaError(mockErrors.responseDataFormat)).toBe(false); // OAuthException type
      });

      it('should prioritize explicit is_transient flag', () => {
        const explicitTransientButOAuth = {
          error: {
            code: '190', // OAuth error code
            type: 'OAuthException',
            is_transient: true, // But explicitly marked as transient
          },
        };
        expect(shouldRetryMetaError(explicitTransientButOAuth)).toBe(true);
      });
    });
  });

  describe('isMetaRateLimitError', () => {
    it('should return true for rate limit error codes', () => {
      expect(isMetaRateLimitError(mockErrors.rateLimitError341)).toBe(true);
      expect(isMetaRateLimitError(mockErrors.rateLimitError368)).toBe(true);
    });

    it('should return false for non-rate-limit errors', () => {
      expect(isMetaRateLimitError(mockErrors.oauthError190)).toBe(false);
      expect(isMetaRateLimitError(mockErrors.validationError100)).toBe(false);
      expect(isMetaRateLimitError(mockErrors.serverError500)).toBe(false);
      expect(isMetaRateLimitError(mockErrors.nullError)).toBe(false);
    });

    it('should handle different error formats', () => {
      const rateLimitInMetaApiFormat = {
        metaErrorCode: '341',
        message: 'Rate limit exceeded',
      };
      expect(isMetaRateLimitError(rateLimitInMetaApiFormat)).toBe(true);

      const rateLimitInResponseFormat = {
        response: {
          data: {
            error: { code: '368' },
          },
        },
      };
      expect(isMetaRateLimitError(rateLimitInResponseFormat)).toBe(true);
    });
  });

  describe('isMetaOAuthTokenError', () => {
    it('should return true only for OAuth token error code 190', () => {
      expect(isMetaOAuthTokenError(mockErrors.oauthError190)).toBe(true);
    });

    it('should return false for other OAuth-related error codes', () => {
      expect(isMetaOAuthTokenError(mockErrors.oauthError200)).toBe(false);
      expect(isMetaOAuthTokenError(mockErrors.oauthError458)).toBe(false);
    });

    it('should return false for non-OAuth errors', () => {
      expect(isMetaOAuthTokenError(mockErrors.rateLimitError341)).toBe(false);
      expect(isMetaOAuthTokenError(mockErrors.validationError100)).toBe(false);
      expect(isMetaOAuthTokenError(mockErrors.serverError500)).toBe(false);
      expect(isMetaOAuthTokenError(mockErrors.nullError)).toBe(false);
    });

    it('should handle different error formats for code 190', () => {
      const oauth190InMetaApiFormat = {
        metaErrorCode: '190',
        message: 'Invalid OAuth access token',
      };
      expect(isMetaOAuthTokenError(oauth190InMetaApiFormat)).toBe(true);

      const oauth190InResponseFormat = {
        response: {
          data: {
            error: { code: '190' },
          },
        },
      };
      expect(isMetaOAuthTokenError(oauth190InResponseFormat)).toBe(true);
    });
  });

  describe('getRetryDelayMultiplier', () => {
    it('should return 3 for rate limit errors', () => {
      expect(getRetryDelayMultiplier(mockErrors.rateLimitError341)).toBe(3);
      expect(getRetryDelayMultiplier(mockErrors.rateLimitError368)).toBe(3);
    });

    it('should return 1 for all other error types', () => {
      expect(getRetryDelayMultiplier(mockErrors.oauthError190)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.validationError100)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.serverError500)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.sdkTimeoutError)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.transientErrorExplicit)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.nullError)).toBe(1);
      expect(getRetryDelayMultiplier(mockErrors.emptyObjectError)).toBe(1);
    });

    it('should handle rate limits in different error formats', () => {
      const rateLimitInMetaApiFormat = {
        metaErrorCode: '341',
        message: 'Application limit reached',
      };
      expect(getRetryDelayMultiplier(rateLimitInMetaApiFormat)).toBe(3);

      const rateLimitInResponseFormat = {
        response: {
          data: {
            error: { code: '368' },
          },
        },
      };
      expect(getRetryDelayMultiplier(rateLimitInResponseFormat)).toBe(3);
    });
  });

  describe('Error Parsing Edge Cases', () => {
    it('should handle deeply nested error structures', () => {
      const deeplyNestedError = {
        response: {
          status: 400,
          data: {
            error: {
              code: '100',
              error_subcode: '33',
              type: 'GraphMethodException',
              message: 'Unsupported get request',
              error_user_title: 'Invalid Request',
              error_user_msg: 'The request is malformed',
            },
          },
        },
      };
      expect(shouldRetryMetaError(deeplyNestedError)).toBe(false); // Code 100 is validation error
      expect(isMetaRateLimitError(deeplyNestedError)).toBe(false);
      expect(isMetaOAuthTokenError(deeplyNestedError)).toBe(false);
      expect(getRetryDelayMultiplier(deeplyNestedError)).toBe(1);
    });

    it('should handle errors with mixed valid and invalid properties', () => {
      const mixedPropertiesError = {
        metaErrorCode: '341', // Valid rate limit code
        randomProperty: 'should be ignored',
        response: {
          invalidStructure: true,
        },
        error: {
          code: '190', // Different valid code - metaErrorCode should take precedence
        },
      };
      expect(shouldRetryMetaError(mixedPropertiesError)).toBe(true); // metaErrorCode 341 wins
      expect(isMetaRateLimitError(mixedPropertiesError)).toBe(true);
      expect(getRetryDelayMultiplier(mixedPropertiesError)).toBe(3);
    });

    it('should handle numeric vs string error codes consistently', () => {
      const numericCodeError = {
        error: { code: 190 }, // Numeric instead of string
      };
      const stringCodeError = {
        error: { code: '190' }, // String
      };

      // Both should be treated the same way (converted to string internally)
      expect(shouldRetryMetaError(numericCodeError)).toBe(false);
      expect(shouldRetryMetaError(stringCodeError)).toBe(false);
      expect(isMetaOAuthTokenError(numericCodeError)).toBe(true);
      expect(isMetaOAuthTokenError(stringCodeError)).toBe(true);
    });

    it('should gracefully handle errors with null or undefined properties', () => {
      const errorWithNulls = {
        error: {
          code: null,
          message: undefined,
          type: null,
        },
        statusCode: undefined,
      };
      expect(shouldRetryMetaError(errorWithNulls)).toBe(false);
      expect(isMetaRateLimitError(errorWithNulls)).toBe(false);
      expect(isMetaOAuthTokenError(errorWithNulls)).toBe(false);
      expect(getRetryDelayMultiplier(errorWithNulls)).toBe(1);
    });
  });
});
