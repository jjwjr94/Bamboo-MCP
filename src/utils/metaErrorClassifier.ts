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

const AUTH_ERROR_CODES = new Set(['190', '200', '458']);
const RATE_LIMIT_CODES = new Set(['341', '368']);
const VALIDATION_ERROR_CODES = new Set(['506', '1609005']);
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

  const errorPayload =
    (err.error as Record<string, unknown>) ||
    ((err.response as Record<string, unknown>)?.data as Record<string, unknown>)?.error ||
    err;

  const errorPayloadTyped = errorPayload as Record<string, unknown>;
  const code = (err.metaErrorCode || errorPayloadTyped?.code)?.toString();
  const subcode = (err.metaErrorSubcode || errorPayloadTyped?.error_subcode)?.toString();
  const type = errorPayloadTyped?.type as string | undefined;
  const isTransient = errorPayloadTyped?.is_transient as boolean | undefined;
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

  if (details.isTransient === true) {
    return true;
  }

  if (details.type === 'OAuthException' || (details.code && AUTH_ERROR_CODES.has(details.code))) {
    return false;
  }

  if (details.code && VALIDATION_ERROR_CODES.has(details.code)) {
    return false;
  }

  if (details.code && TRANSIENT_ERROR_CODES.has(details.code)) {
    return true;
  }

  if (details.code && RATE_LIMIT_CODES.has(details.code)) {
    return true;
  }

  if (details.statusCode && details.statusCode >= 500 && details.statusCode < 600) {
    return true;
  }

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

  if (details.code && RATE_LIMIT_CODES.has(details.code)) {
    return 3;
  }

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
