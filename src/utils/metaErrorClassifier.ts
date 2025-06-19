// MetaApiError import removed as it's not used in this file
// The parseErrorDetails function handles MetaApiError properties via duck typing

/**
 * A structured representation of relevant details from a Meta API error.
 */
interface MetaErrorDetails {
  code?: string;
  subcode?: string;
  type?: string;
  isTransient?: boolean;
  statusCode?: number;
}

// Constant sets for different error code categories for clarity and maintainability.
// Codes are stored as strings for consistent comparison.
const AUTH_ERROR_CODES = new Set(['190', '200', '458']);
const RATE_LIMIT_CODES = new Set(['341', '368']);
const VALIDATION_ERROR_CODES = new Set(['506', '1609005']);
// Custom-defined transient error codes (like timeouts) that should be retried
const TRANSIENT_ERROR_CODES = new Set(['SDK_TIMEOUT', 'TIMEOUT_ERROR']);

/**
 * Safely extracts relevant properties from various possible Meta error shapes.
 *
 * It can parse our custom `MetaApiError` as well as raw error objects from the
 * Meta SDK or direct API calls.
 *
 * @param error The error object to parse.
 * @returns A structured object with extracted error details.
 */
function parseErrorDetails(error: unknown): MetaErrorDetails {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  const err = error as Record<string, unknown>;

  // The raw error object from Meta often has details at the top level,
  // inside an `error` property, or inside `response.data.error`.
  const errorPayload =
    (err.error as Record<string, unknown>) ||
    ((err.response as Record<string, unknown>)?.data as Record<string, unknown>)?.error ||
    err;

  // Extract properties, prioritizing our `MetaApiError` fields and falling back to raw fields.
  const errorPayloadTyped = errorPayload as Record<string, unknown>;
  const code = (err.metaErrorCode || errorPayloadTyped?.code)?.toString();
  const subcode = (err.metaErrorSubcode || errorPayloadTyped?.error_subcode)?.toString();
  const type = errorPayloadTyped?.type as string | undefined;
  const isTransient = errorPayloadTyped?.is_transient as boolean | undefined; // is_transient is a boolean
  const statusCode =
    (err.statusCode as number | undefined) ||
    ((err.response as Record<string, unknown>)?.status as number | undefined);

  return { code, subcode, type, isTransient, statusCode };
}

/**
 * Classifies a Meta SDK error to determine if the operation should be retried.
 *
 * @param error The error received from a Meta API call.
 * @returns `true` if the error is transient and should be retried, otherwise `false`.
 */
export function shouldRetryMetaError(error: unknown): boolean {
  const details = parseErrorDetails(error);

  // 1. Explicit `is_transient` flag from Meta is the strongest signal to retry.
  if (details.isTransient === true) {
    return true;
  }

  // 2. Authentication errors are not retryable.
  if (details.type === 'OAuthException' || (details.code && AUTH_ERROR_CODES.has(details.code))) {
    return false;
  }

  // 3. Validation errors are not retryable.
  if (details.code && VALIDATION_ERROR_CODES.has(details.code)) {
    return false;
  }

  // 4. Custom-defined transient errors (like timeouts) are retryable.
  if (details.code && TRANSIENT_ERROR_CODES.has(details.code)) {
    return true;
  }

  // 5. Rate limit errors are retryable.
  if (details.code && RATE_LIMIT_CODES.has(details.code)) {
    return true;
  }

  // 6. Server-side errors (5xx) are retryable.
  if (details.statusCode && details.statusCode >= 500 && details.statusCode < 600) {
    return true;
  }

  // Default to not retrying to be safe.
  return false;
}

/**
 * Determines the delay multiplier for a retry attempt based on the error type.
 *
 * @param error The error received from a Meta API call.
 * @returns A number representing the delay multiplier (e.g., 3 for 3x the base delay).
 */
export function getRetryDelayMultiplier(error: unknown): number {
  const details = parseErrorDetails(error);

  // Apply a higher delay multiplier for rate limit errors.
  if (details.code && RATE_LIMIT_CODES.has(details.code)) {
    return 3;
  }

  // Use a standard 1x multiplier for other retryable errors (e.g., server-side, transient).
  return 1;
}

/**
 * Checks if a Meta API error is a rate-limit error.
 *
 * @param error The error received from a Meta API call.
 * @returns `true` if the error is a rate-limit error, otherwise `false`.
 */
export function isMetaRateLimitError(error: unknown): boolean {
  const details = parseErrorDetails(error);
  return details.code ? RATE_LIMIT_CODES.has(details.code) : false;
}
