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

export class ValidationError extends BambooError {
  constructor(message = 'Invalid input') {
    super(message, 'VALIDATION_ERROR', 400);
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

export class MetaApiError extends BambooError {
  public readonly metaErrorCode?: string;
  public readonly metaErrorSubcode?: string;

  constructor(
    message: string,
    metaErrorCode?: string,
    metaErrorSubcode?: string,
    statusCode = 400
  ) {
    super(message, 'META_API_ERROR', statusCode);
    this.metaErrorCode = metaErrorCode;
    this.metaErrorSubcode = metaErrorSubcode;
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

// Error response helpers
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
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

// Error handler for async functions
export function asyncErrorHandler<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    return Promise.resolve(result).catch((error) => {
      throw isBambooError(error) ? error : new BambooError(error.message);
    });
  }) as T;
}
