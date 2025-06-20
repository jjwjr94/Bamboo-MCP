import { logger } from './logger.js';

// 2025-ready: Using a WeakSet for efficient circular reference tracking.
const MAX_REDACTION_DEPTH = 20;
const REDACTION_PLACEHOLDER = '[REDACTED]';

/**
 * A curated list of regular expressions to detect sensitive field names.
 * This pattern-based approach is flexible and covers variations.
 * - `i` flag for case-insensitivity.
 * - `_` or `$` to match prefixes or suffixes.
 *
 * IMPORTANT: This list is a critical security control. Developers must
 * update it if new sensitive data fields are introduced in API responses.
 */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /credential/i,
  /secret/i,
  /token$/i, // e.g., access_token, refresh_token
  /_key$/i, // e.g., api_key, private_key
  /^auth/i, // e.g., auth, authorization
];

/**
 * Checks if a given object key matches any of the defined sensitive patterns.
 * @param key The object key to check.
 * @returns `true` if the key is considered sensitive, otherwise `false`.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively traverses an object or array to redact values of sensitive keys.
 * This function creates a deep copy, ensuring the original object is not mutated.
 * It includes protections for deep recursion and circular references.
 *
 * @param data The data to sanitize (object, array, or primitive).
 * @param visited A WeakSet to track visited objects for circular reference detection.
 * @param depth The current recursion depth.
 * @returns The sanitized data with sensitive fields redacted.
 */
function redactRecursively(data: unknown, visited: WeakSet<object>, depth: number): unknown {
  if (data === null || typeof data !== 'object') {
    return data; // Primitives are returned as-is.
  }

  if (depth > MAX_REDACTION_DEPTH) {
    logger.warn('Maximum redaction depth exceeded. Aborting to prevent stack overflow.', { depth });
    return REDACTION_PLACEHOLDER;
  }

  if (visited.has(data)) {
    return REDACTION_PLACEHOLDER; // Circular reference detected.
  }
  visited.add(data);

  if (Array.isArray(data)) {
    // If it's an array, create a new array and redact each item.
    return data.map((item) => redactRecursively(item, visited, depth + 1));
  }

  // If it's an object, create a new object and redact its properties.
  const redactedObject: Record<string, unknown> = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (isSensitiveKey(key)) {
        redactedObject[key] = REDACTION_PLACEHOLDER;
        // SECURITY MONITORING: Log the redaction event.
        logger.suspiciousActivity('SENSITIVE_DATA_REDACTED', { redactedKey: key });
      } else {
        redactedObject[key] = redactRecursively(
          (data as Record<string, unknown>)[key],
          visited,
          depth + 1
        );
      }
    }
  }
  return redactedObject;
}

/**
 * Public interface for redacting sensitive data from any object or array.
 * It sanitizes data by replacing values of fields matching sensitive patterns
 * (e.g., 'password', 'access_token') with '[REDACTED]'.
 *
 * @template T The type of the data being passed in.
 * @param data The data to be sanitized.
 * @returns A new, sanitized object of the same type.
 */
export function redactSensitiveData<T>(data: T): T {
  const visited = new WeakSet<object>();
  return redactRecursively(data, visited, 0) as T;
}
