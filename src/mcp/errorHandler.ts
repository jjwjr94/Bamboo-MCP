import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  AggregatedValidationError,
  AuthenticationError,
  AuthorizationError,
  MetaApiError,
  RateLimitError,
  TimeoutError,
  TokenError,
  ValidationError,
  type ValidationIssue,
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
  issues?: readonly ValidationIssue[];
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

export function deriveMetaApiErrorDetails(error: MetaApiError): {
  message: string;
  metadata: McpErrorMetadata;
} {
  if (isMetaOAuthTokenError(error)) {
    return {
      message:
        'Authentication failed. The access token is invalid or has expired. Please re-authenticate and try again.',
      metadata: {
        retryable: false,
        errorCode: error.metaErrorCode || error.code,
        category: 'authentication',
      },
    };
  }

  // Log fbtrace_id for debugging when available
  if (error.fbtrace_id) {
    logger.warn('Meta API Error Trace', {
      fbtrace_id: error.fbtrace_id,
      metaErrorCode: error.metaErrorCode,
      metaErrorSubcode: error.metaErrorSubcode,
      message: error.message,
    });
  }

  // Construct a user-friendly message using userTitle and userMessage when available
  let displayMessage = error.userMessage;
  if (error.userTitle && displayMessage) {
    displayMessage = `${error.userTitle}: ${displayMessage}`;
  }
  // Fallback to the generic error.message if user-friendly details are absent
  const finalMessage = displayMessage || `Meta API error: ${error.message}`;

  const isRetryable = shouldRetryMetaError(error);
  const metadata: McpErrorMetadata = {
    retryable: isRetryable,
    errorCode: error.metaErrorCode || error.code,
    category: 'api_error',
  };

  if (isRetryable && isMetaRateLimitError(error)) {
    metadata.retryAfterMs = 60000; // 1 minute default
  }

  return {
    message: finalMessage,
    metadata,
  };
}

export function deriveUnknownErrorDetails(error: unknown): {
  message: string;
  metadata: McpErrorMetadata;
} {
  const unknownError = error instanceof Error ? error : new Error('Unknown error');
  logger.error('Unhandled MCP tool exception', {
    error: unknownError.message,
    stack: unknownError.stack,
  });
  return {
    message: 'Internal server error. Contact support if the issue persists.',
    metadata: {
      retryable: false,
      errorCode: 'INTERNAL_UNHANDLED_ERROR',
      category: 'internal',
    },
  };
}

export function deriveErrorDetails(error: unknown): {
  message: string;
  metadata: McpErrorMetadata;
  issues?: readonly ValidationIssue[];
} {
  if (error instanceof AuthenticationError || error instanceof TokenError) {
    return {
      message:
        'Authentication failed. The provided credentials may be invalid or expired. Please re-authenticate.',
      metadata: {
        retryable: false,
        errorCode: error.code,
        category: 'authentication',
      },
    };
  }

  if (error instanceof AuthorizationError) {
    return {
      message: 'Authorization failed. You do not have permission to perform this action.',
      metadata: {
        retryable: false,
        errorCode: error.code,
        category: 'authorization',
      },
    };
  }

  if (error instanceof RateLimitError) {
    return {
      message: 'The API rate limit has been exceeded. Please wait a moment before trying again.',
      metadata: {
        retryable: true,
        retryAfterMs: 60000,
        errorCode: error.code,
        category: 'rate_limit',
      },
    };
  }

  // Handle AggregatedValidationError before ValidationError for proper specificity
  if (error instanceof AggregatedValidationError) {
    return {
      message: error.message,
      metadata: {
        retryable: false,
        errorCode: error.code,
        category: 'validation',
      },
      issues: error.issues,
    };
  }

  if (error instanceof ValidationError) {
    return {
      message: `Invalid input provided: ${error.message}. Please correct the parameters and try again.`,
      metadata: {
        retryable: false,
        errorCode: error.code,
        category: 'validation',
      },
    };
  }

  if (error instanceof MetaApiError) {
    return deriveMetaApiErrorDetails(error);
  }

  if (error instanceof TimeoutError) {
    return {
      message: 'The request timed out. Please try again later.',
      metadata: {
        retryable: true,
        retryAfterMs: 5000,
        errorCode: error.code,
        category: 'internal',
      },
    };
  }

  if (isBambooError(error)) {
    const isServerSideError = error.statusCode >= 500;
    return {
      message: `An error occurred: ${error.message}`,
      metadata: {
        retryable: isServerSideError,
        errorCode: error.code,
        category: isServerSideError ? 'internal' : 'api_error',
      },
    };
  }

  return deriveUnknownErrorDetails(error);
}

export function createMcpErrorResult(error: unknown): CallToolResult {
  const { message, metadata, issues } = deriveErrorDetails(error);

  const errorContent: TextContent = {
    type: 'text',
    text: message,
  };

  // Structured error content following discriminated union pattern
  const structuredError: McpStructuredError = {
    type: 'error',
    message,
    error: {
      retryable: metadata.retryable,
      retryAfterMs: metadata.retryAfterMs,
      errorCode: metadata.errorCode,
      category: metadata.category,
    },
  };

  // Add issues array for aggregated validation errors
  if (issues) {
    structuredError.issues = issues;
  }

  // Always wrap errors in { result: ... } format for discriminated union compatibility
  return {
    content: [errorContent],
    structuredContent: {
      result: structuredError,
    },
    isError: true,
    _meta: {
      errorMetadata: metadata,
    },
  } as CallToolResult;
}
