import type { Sanitized } from '../types/utils.js';
import { logger } from './logger.js';

/**
 * Removes properties with `undefined` values from an object.
 * This is useful for preparing data payloads for APIs that
 * reject or misinterpret undefined keys.
 * @param obj The object to clean.
 */
export function removeUndefinedProperties(obj: Record<string, unknown>): void {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
}

const MAX_SANITIZATION_DEPTH = 20;

/**
 * Recursively removes properties starting with an underscore `_` from an object or array.
 * This is used to sanitize Meta SDK responses and prevent leaking internal properties
 * such as access tokens that are stored in `_api` objects.
 *
 * Includes depth protection to prevent stack overflows from circular references or
 * excessively deep objects. Returns a type-safe result that accurately reflects
 * the structural transformation.
 *
 * @param data The data to sanitize (object, array, or primitive)
 * @param depth The current recursion depth (internal use)
 * @returns The sanitized data with underscore properties removed
 * @throws {Error} if the maximum recursion depth is exceeded
 */
export function removeUnderscoreProperties<T>(data: T, depth = 0): Sanitized<T> {
  if (depth > MAX_SANITIZATION_DEPTH) {
    // Log details for debugging without exposing potentially sensitive data
    logger.warn('Maximum sanitization depth exceeded. Potential circular reference in object.', {
      objectType: typeof data,
      keys: typeof data === 'object' && data !== null ? Object.keys(data).slice(0, 10) : undefined,
      depth,
    });
    throw new Error('Maximum sanitization depth exceeded, potential circular reference.');
  }

  if (Array.isArray(data)) {
    // Recursively sanitize each array element
    return data.map((item) => removeUnderscoreProperties(item, depth + 1)) as Sanitized<T>;
  }

  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    // For objects, create a new object excluding underscore properties
    const sanitized = {} as Record<string, unknown>;

    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('_')) {
        sanitized[key] = removeUnderscoreProperties(value, depth + 1);
      }
    }

    return sanitized as Sanitized<T>;
  }

  // Return primitives and null as-is
  return data as Sanitized<T>;
}
