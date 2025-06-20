import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import {
  AuthenticationError,
  AuthorizationError,
  MetaApiError,
  RateLimitError,
  ValidationError,
  isBambooError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isMetaRateLimitError, shouldRetryMetaError } from '../utils/metaErrorClassifier.js';

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
 * Converts a BambooError or unknown exception into a structured MCP CallToolResult error object.
 *
 * @param error - The caught exception
 * @returns A CallToolResult object representing the error, with retry metadata
 */
export function createMcpErrorResult(
  error: unknown
): CallToolResult & { structuredContent: McpStructuredError } {
  let message: string;
  let metadata: McpErrorMetadata;

  if (error instanceof AuthenticationError) {
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
    message = `Meta API error: ${error.message}`;
    const isRetryable = shouldRetryMetaError(error);
    metadata = {
      retryable: isRetryable,
      errorCode: error.code,
      category: 'api_error',
    };

    // Add retry delay for rate limit errors
    if (isRetryable && isMetaRateLimitError(error)) {
      metadata.retryAfterMs = 60000; // 1 minute default
    }
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
      'An unexpected internal server error occurred. This may be a transient issue. You can try again.';
    metadata = {
      retryable: true,
      errorCode: 'INTERNAL_ERROR',
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

  return {
    content: [errorContent],
    structuredContent: structuredError,
    isError: true,
    _meta: {
      // NOTE: errorMetadata is included in _meta for backward compatibility.
      // New clients should prefer using the `structuredContent` field.
      errorMetadata: metadata,
    },
  } as CallToolResult & { structuredContent: McpStructuredError };
}
