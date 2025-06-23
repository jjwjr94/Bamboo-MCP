import { env } from './env.js';
import { logger } from './logger.js';

// 2025-ready: Using a WeakSet for efficient circular reference tracking.
const REDACTION_PLACEHOLDER = '[REDACTED]';

/**
 * Patterns to detect sensitive field names.
 * Critical security control - update when adding new sensitive fields.
 */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /credential/i,
  /secret/i,
  /token/i,
  /(api|private|public|session|encryption|signing)[\-_]?key/i,
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

  if (depth > env.MAX_REDACTION_DEPTH) {
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

const ESCAPE_MAP: { [key: string]: string } = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
} as const;

const DANGEROUS_CHARS_REGEX = /[&<>"'/]/g;

/**
 * Escapes special characters in a string for use in an HTML context.
 * This function prevents XSS by replacing characters that have special
 * meaning in HTML with their corresponding entities.
 *
 * Following 2025 security best practices for output encoding.
 *
 * @param str The input string to escape. Can be null or undefined.
 * @returns The escaped string, or an empty string if the input is falsy.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) {
    return '';
  }
  return str.replace(DANGEROUS_CHARS_REGEX, (char) => ESCAPE_MAP[char]);
}
