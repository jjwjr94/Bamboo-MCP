import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  AuthenticationError,
  AuthorizationError,
  MetaApiError,
  RateLimitError,
  TimeoutError,
  TokenError,
  ValidationError,
  isBambooError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  isMetaOAuthTokenError,
  isMetaRateLimitError,
  shouldRetryMetaError,
} from '../utils/metaErrorClassifier.js';

/**
 * Metadata providing client guidance on how to handle a tool error.
 */
export interface McpErrorMetadata {
  retryable: boolean;
  retryAfterMs?: number;
  errorCode: string;
  category:
    | 'authentication'
    | 'authorization'
    | 'validation'
    | 'rate_limit'
    | 'api_error'
    | 'internal';
}

/**
 * Zod schema for the McpErrorMetadata interface.
 * Defines the structure for client guidance on handling tool errors.
 */
export const mcpErrorMetadataSchema = z.object({
  retryable: z.boolean(),
  retryAfterMs: z.number().optional(),
  errorCode: z.string(),
  category: z.enum([
    'authentication',
    'authorization',
    'validation',
    'rate_limit',
    'api_error',
    'internal',
  ]),
});

/**
 * A structured error object for the structuredContent field of a CallToolResult.
 * Follows a discriminated union pattern with `type: 'error'`.
 */
export interface McpStructuredError {
  type: 'error';
  message: string;
  error: McpErrorMetadata;
  [key: string]: unknown;
}

/**
 * Zod schema for the McpStructuredError interface.
 * Represents the standardized error output for an MCP tool.
 * This is a part of the discriminated union for tool outputs.
 */
export const mcpErrorSchema = z
  .object({
    type: z.literal('error'),
    message: z.string(),
    error: mcpErrorMetadataSchema,
  })
  .passthrough();

/**
 * Converts a BambooError or unknown exception into a structured MCP CallToolResult error object.
 *
 * This function provides centralized error handling for all MCP tools, ensuring consistent
 * error responses across the API. It classifies errors by type and provides appropriate
 * retry guidance to clients.
 *
 * **Response Structure:**
 * - `content`: Array containing human-readable error message and JSON-serialized error details
 * - `isError`: Always true for error responses
 * - `_meta.errorMetadata`: Structured metadata for client error handling
 * - `structuredContent`: Currently commented out due to MCP SDK limitations
 *
 * **Error Classification:**
 * - `AuthenticationError`: Non-retryable auth failures
 * - `AuthorizationError`: Non-retryable permission failures
 * - `ValidationError`: Non-retryable input validation failures
 * - `RateLimitError`: Retryable with delay
 * - `TimeoutError`: Retryable with shorter delay
 * - `MetaApiError`: Retryable based on Meta API error classification
 * - `BambooError`: Retryable based on HTTP status code (5xx = retryable)
 * - Unknown errors: Non-retryable (indicates server bugs)
 *
 * @param error - The caught exception of any type
 * @returns A CallToolResult object with structured error information
 */
export function createMcpErrorResult(error: unknown): CallToolResult {
  let message: string;
  let metadata: McpErrorMetadata;

  if (error instanceof AuthenticationError || error instanceof TokenError) {
    message =
      'Authentication failed. The provided credentials may be invalid or expired. Please re-authenticate.';
    metadata = {
      retryable: false,
      errorCode: error.code,
      category: 'authentication',
    };
  } else if (error instanceof AuthorizationError) {
    message = 'Authorization failed. You do not have permission to perform this action.';
    metadata = {
      retryable: false,
      errorCode: error.code,
      category: 'authorization',
    };
  } else if (error instanceof RateLimitError) {
    message = 'The API rate limit has been exceeded. Please wait a moment before trying again.';
    metadata = {
      retryable: true,
      retryAfterMs: 60000, // 1 minute default
      errorCode: error.code,
      category: 'rate_limit',
    };
  } else if (error instanceof ValidationError) {
    message = `Invalid input provided: ${error.message}. Please correct the parameters and try again.`;
    metadata = {
      retryable: false,
      errorCode: error.code,
      category: 'validation',
    };
  } else if (error instanceof MetaApiError) {
    if (isMetaOAuthTokenError(error)) {
      message =
        'Authentication failed. The access token is invalid or has expired. Please re-authenticate and try again.';
      metadata = {
        retryable: false,
        errorCode: error.metaErrorCode || error.code,
        category: 'authentication',
      };
    } else {
      message = `Meta API error: ${error.message}`;
      const isRetryable = shouldRetryMetaError(error);
      metadata = {
        retryable: isRetryable,
        errorCode: error.metaErrorCode || error.code,
        category: 'api_error',
      };

      // Add retry delay for rate limit errors
      if (isRetryable && isMetaRateLimitError(error)) {
        metadata.retryAfterMs = 60000; // 1 minute default
      }
    }
  } else if (error instanceof TimeoutError) {
    message = 'The request timed out. Please try again later.';
    metadata = {
      retryable: true,
      retryAfterMs: 5000, // Shorter retry delay for timeouts
      errorCode: error.code,
      category: 'internal',
    };
  } else if (isBambooError(error)) {
    // Handle generic BambooError
    const isServerSideError = error.statusCode >= 500;
    message = `An error occurred: ${error.message}`;
    metadata = {
      retryable: isServerSideError,
      errorCode: error.code,
      category: isServerSideError ? 'internal' : 'api_error',
    };
  } else {
    // Handle unexpected, non-operational errors
    const unknownError = error instanceof Error ? error : new Error('An unknown error occurred.');
    logger.error('Unhandled exception in MCP tool execution', {
      error: unknownError.message,
      stack: unknownError.stack,
    });
    message =
      'An unexpected internal server error occurred. Please contact support if the issue persists.';
    metadata = {
      retryable: false,
      errorCode: 'INTERNAL_UNHANDLED_ERROR',
      category: 'internal',
    };
  }

  const errorContent: TextContent = {
    type: 'text',
    text: message,
  };

  // Structured error content following discriminated union pattern
  const structuredError: McpStructuredError = {
    type: 'error',
    message: message,
    error: {
      retryable: metadata.retryable,
      retryAfterMs: metadata.retryAfterMs,
      errorCode: metadata.errorCode,
      category: metadata.category,
    },
  };

  // Add structured error as JSON text content for visibility
  const structuredErrorContent: TextContent = {
    type: 'text',
    text: `\n\nStructured Error Details:\n${JSON.stringify(structuredError, null, 2)}`,
  };

  return {
    content: [errorContent, structuredErrorContent],
    // NOTE: The `structuredContent` field is intentionally commented out due to MCP SDK limitations.
    // The current MCP SDK version does not support discriminated unions in output schemas, causing
    // validation to fail for error responses ({ type: 'error' }) against success-only schemas.
    //
    // **Workaround:** Structured error details are provided as:
    // 1. JSON string in the `content` array (for immediate visibility)
    // 2. Metadata in the `_meta.errorMetadata` field (for programmatic access)
    //
    // **Action Required:** This should be revisited when the MCP SDK supports discriminated
    // union output schemas. At that time, uncomment the line below and update tool registrations
    // to use `createMcpOutputSchema` from types.ts.
    // structuredContent: structuredError,
    isError: true,
    _meta: {
      // NOTE: errorMetadata is included in _meta for backward compatibility.
      // New clients should prefer using the `structuredContent` field.
      errorMetadata: metadata,
    },
  } as CallToolResult;
}
