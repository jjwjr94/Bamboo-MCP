// Error handling utilities

export class BambooError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code = 'INTERNAL_ERROR', statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'BambooError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Ensure stack trace is captured
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends BambooError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends BambooError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Represents a single, specific validation failure.
 */
export interface ValidationIssue {
  field: string;
  message: string;
  code?: string;
  validOptions?: readonly string[];
}

export class ValidationError extends BambooError {
  constructor(message = 'Invalid input', code = 'VALIDATION_ERROR') {
    super(message, code, 400);
  }
}

/**
 * An error class that aggregates multiple validation issues into a single error.
 * This is used to report all validation failures to the user at once,
 * improving the user experience by avoiding multiple round trips.
 */
export class AggregatedValidationError extends ValidationError {
  public readonly issues: readonly ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const issueCount = issues.length;
    const message = `Invalid input: ${issueCount} issue(s) found. Please correct all issues and try again.`;
    super(message, 'AGGREGATED_VALIDATION_ERROR');
    this.name = 'AggregatedValidationError';
    this.issues = issues;
  }
}

export class NotFoundError extends BambooError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends BambooError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT', 409);
  }
}

export class RateLimitError extends BambooError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class TimeoutError extends BambooError {
  constructor(message = 'The operation timed out') {
    super(message, 'REQUEST_TIMEOUT', 504, true); // 504 Gateway Timeout, retryable
  }
}

export class MetaApiError extends BambooError {
  public readonly metaErrorCode?: string;
  public readonly metaErrorSubcode?: string;
  public readonly metaErrorType?: string;
  public readonly fbtrace_id?: string;
  public readonly userTitle?: string;
  public readonly userMessage?: string;

  constructor(
    message: string,
    metaErrorCode?: string,
    metaErrorSubcode?: string,
    statusCode = 400,
    metaErrorType?: string,
    fbtrace_id?: string,
    userTitle?: string,
    userMessage?: string
  ) {
    super(message, 'META_API_ERROR', statusCode);
    this.metaErrorCode = metaErrorCode;
    this.metaErrorSubcode = metaErrorSubcode;
    this.metaErrorType = metaErrorType;
    this.fbtrace_id = fbtrace_id;
    this.userTitle = userTitle;
    this.userMessage = userMessage;
  }
}

export class DatabaseError extends BambooError {
  constructor(message = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500);
  }
}

export class TokenError extends BambooError {
  constructor(message = 'Token error') {
    super(message, 'TOKEN_ERROR', 401);
  }
}

export class PKCEError extends BambooError {
  constructor(message = 'PKCE validation failed') {
    super(message, 'PKCE_ERROR', 400);
  }
}

export class InitializationError extends BambooError {
  constructor(message = 'Service not initialized') {
    super(message, 'INITIALIZATION_ERROR', 500, false); // Not an operational error
  }
}

// Error response helpers
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

export function createErrorResponse(
  error: Error | BambooError,
  includeStack = false
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: error.message,
  };

  if (error instanceof BambooError) {
    response.code = error.code;
  }

  if (includeStack && process.env.NODE_ENV === 'development') {
    response.details = { stack: error.stack };
  }

  return response;
}

// Type guards
export function isBambooError(error: unknown): error is BambooError {
  return error instanceof BambooError;
}

export function isOperationalError(error: unknown): boolean {
  if (isBambooError(error)) {
    return error.isOperational;
  }
  return false;
}
