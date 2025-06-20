import type { Sanitized } from '../types/utils.js';
import { logger } from './logger.js';

const MAX_RECURSION_DEPTH = 20;
const MAX_SANITIZATION_DEPTH = 20;

/**
 * Recursively removes properties with `undefined` values from an object and any
 * nested objects or arrays. This function mutates the original object.
 * It is useful for preparing data payloads for APIs that
 * reject or misinterpret undefined keys.
 *
 * Includes circular reference and depth protection to prevent stack overflows.
 *
 * @param obj The object to clean. It will be mutated directly.
 */
export function removeUndefinedProperties(obj: Record<string, unknown>): void {
  // Use a WeakSet to keep track of visited objects to handle circular references.
  const visited = new WeakSet<object>();

  function removeRecursively(current: unknown, depth: number): void {
    // 1. Guard Clause: Stop if not an object, null, or already visited.
    if (current === null || typeof current !== 'object') {
      return;
    }

    // 2. Guard Clause: Protect against deep recursion / potential stack overflow.
    if (depth > MAX_RECURSION_DEPTH) {
      logger.warn('Maximum recursion depth exceeded in removeUndefinedProperties.', { depth });
      return;
    }

    // 3. Guard Clause: Handle circular references.
    if (visited.has(current)) {
      return;
    }
    visited.add(current);

    // 4. Recursive Traversal: Process arrays and objects.
    if (Array.isArray(current)) {
      // For arrays, recurse on each item.
      // Note: This does not remove 'undefined' elements from the array itself,
      // only cleans 'undefined' properties from objects within the array.
      for (const item of current) {
        removeRecursively(item, depth + 1);
      }
    } else {
      // For objects, iterate over keys to find and remove undefined properties.
      for (const key in current) {
        // We check hasOwnProperty to ensure we're not operating on prototype properties.
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const value = (current as Record<string, unknown>)[key];
          if (value === undefined) {
            delete (current as Record<string, unknown>)[key];
          } else {
            // If the value is not undefined, recurse into it.
            removeRecursively(value, depth + 1);
          }
        }
      }
    }
  }

  removeRecursively(obj, 0);
}

/**
 * Recursively removes properties starting with an underscore `_` from an object or array.
 * This helper function contains the core logic for the recursion.
 *
 * @param data The data to sanitize
 * @param visited A WeakSet to track visited objects for circular reference detection
 * @param depth The current recursion depth
 * @returns The sanitized data
 */
function removeUnderscorePropertiesRecursively<T>(
  data: T,
  visited: WeakSet<object>,
  depth: number
): Sanitized<T> {
  // 1. Base case for primitives and null
  if (data === null || typeof data !== 'object') {
    return data as Sanitized<T>;
  }

  // 2. Protect against deep recursion
  if (depth > MAX_SANITIZATION_DEPTH) {
    logger.warn('Maximum sanitization depth exceeded. Potential circular reference in object.', {
      objectType: typeof data,
      keys: typeof data === 'object' && data !== null ? Object.keys(data).slice(0, 10) : undefined,
      depth,
    });
    // Return an empty structure to gracefully handle the issue
    return (Array.isArray(data) ? [] : {}) as Sanitized<T>;
  }

  // 3. Handle circular references
  if (visited.has(data)) {
    // Return an empty structure to break the cycle
    return (Array.isArray(data) ? [] : {}) as Sanitized<T>;
  }
  visited.add(data);

  // 4. Recursive processing
  if (Array.isArray(data)) {
    // Recursively sanitize each array element
    return data.map((item) =>
      removeUnderscorePropertiesRecursively(item, visited, depth + 1)
    ) as Sanitized<T>;
  }

  // For objects, create a new object excluding underscore properties
  const sanitized = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('_')) {
      sanitized[key] = removeUnderscorePropertiesRecursively(value, visited, depth + 1);
    }
  }
  return sanitized as Sanitized<T>;
}

/**
 * Recursively removes properties starting with an underscore `_` from an object or array.
 * This is used to sanitize Meta SDK responses and prevent leaking internal properties
 * such as access tokens that are stored in `_api` objects.
 *
 * Includes circular reference and depth protection to prevent stack overflows.
 * Returns a type-safe result that accurately reflects the structural transformation.
 *
 * @param data The data to sanitize (object, array, or primitive)
 * @returns The sanitized data with underscore properties removed
 */
export function removeUnderscoreProperties<T>(data: T): Sanitized<T> {
  const visited = new WeakSet<object>();
  return removeUnderscorePropertiesRecursively(data, visited, 0);
}
