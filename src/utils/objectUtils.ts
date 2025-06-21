import type { Sanitized } from '../types/utils.js';
import { env } from './env.js';
import { logger } from './logger.js';

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

  const cleanArray = (arr: unknown[], nextDepth: number): void => {
    for (const item of arr) {
      removeRecursively(item, nextDepth);
    }
  };

  const cleanObject = (obj: Record<string, unknown>, nextDepth: number): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        delete obj[key];
      } else {
        removeRecursively(value, nextDepth);
      }
    }
  };

  function removeRecursively(current: unknown, depth: number): void {
    // 1. Guard Clause: Stop if not an object, null, or already visited.
    if (current === null || typeof current !== 'object') {
      return;
    }

    // 2. Guard Clause: Protect against deep recursion / potential stack overflow.
    if (depth > env.MAX_RECURSION_DEPTH) {
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
      cleanArray(current, depth + 1);
    } else {
      cleanObject(current as Record<string, unknown>, depth + 1);
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
  if (depth > env.MAX_RECURSION_DEPTH) {
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
