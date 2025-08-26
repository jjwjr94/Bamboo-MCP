import type { Sanitized, SnakeCased } from '../types/utils.js';
import { logger } from './logger.js';

// Constants
const MAX_RECURSION_DEPTH = 20;

/**
 * Recursively removes undefined properties from an object.
 * Mutates the original object and includes circular reference protection.
 */
export function removeUndefinedProperties(obj: Record<string, unknown>): void {
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
    if (current === null || typeof current !== 'object') {
      return;
    }

    if (depth > MAX_RECURSION_DEPTH) {
      logger.warn('Max recursion depth exceeded in removeUndefinedProperties', { depth });
      return;
    }

    if (visited.has(current)) {
      return;
    }
    visited.add(current);

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
  // 1. Base case for primitives, null, and non-plain objects
  if (
    data === null ||
    typeof data !== 'object' ||
    (data.constructor !== Object && !Array.isArray(data))
  ) {
    return data as Sanitized<T>;
  }

  // 2. Protect against deep recursion
  if (depth > MAX_RECURSION_DEPTH) {
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

  // 4. Recursive processing delegated to helpers
  if (Array.isArray(data)) {
    return sanitizeArrayElements(data, visited, depth) as Sanitized<T>;
  }

  return sanitizePlainObject(data as Record<string, unknown>, visited, depth) as Sanitized<T>;
}

// Helper to sanitize arrays by removing underscore properties from elements
function sanitizeArrayElements(arr: unknown[], visited: WeakSet<object>, depth: number): unknown[] {
  return arr.map((item) => removeUnderscorePropertiesRecursively(item, visited, depth + 1));
}

// Helper to sanitize plain objects by removing underscore-prefixed keys
function sanitizePlainObject(
  obj: Record<string, unknown>,
  visited: WeakSet<object>,
  depth: number
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith('_')) {
      sanitized[key] = removeUnderscorePropertiesRecursively(value, visited, depth + 1);
    }
  }
  return sanitized;
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

/**
 * Converts a camelCase string to snake_case. Handles sequences of capital letters correctly,
 * including acronyms like 'HTTPRequest' -> 'http_request'.
 * @param str The string to convert.
 * @returns The snake_cased string.
 */
const camelToSnake = (str: string): string =>
  str
    .match(/[A-Z]{2,}(?=[A-Z][a-z]|[0-9]|$)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    ?.map((x) => x.toLowerCase())
    .join('_') || str.toLowerCase();

/**
 * Recursively converts object keys from camelCase to snake_case.
 * This helper function contains the core logic for the recursion.
 *
 * @param data The data to convert
 * @param visited A WeakSet to track visited objects for circular reference detection
 * @param depth The current recursion depth
 * @returns The converted data
 */
function convertKeysToSnakeCaseRecursive<T>(
  data: T,
  visited: WeakSet<object>,
  depth: number
): SnakeCased<T> {
  // 1. Base case for primitives, null, and non-plain objects
  if (
    data === null ||
    typeof data !== 'object' ||
    (data.constructor !== Object && !Array.isArray(data))
  ) {
    return data as SnakeCased<T>;
  }

  // 2. Depth protection
  if (depth > MAX_RECURSION_DEPTH) {
    logger.warn('Maximum recursion depth reached in convertKeysToSnakeCase', { depth });
    return {} as SnakeCased<T>;
  }

  // 3. Circular reference protection
  if (visited.has(data)) {
    logger.warn('Circular reference detected in convertKeysToSnakeCase');
    return {} as SnakeCased<T>;
  }
  visited.add(data);

  try {
    // 4. Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) =>
        convertKeysToSnakeCaseRecursive(item, visited, depth + 1)
      ) as SnakeCased<T>;
    }

    // 5. Handle plain objects
    const result = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = convertKeysToSnakeCaseRecursive(value, visited, depth + 1);
    }
    return result as SnakeCased<T>;
  } finally {
    visited.delete(data);
  }
}

/**
 * Recursively converts all keys of an object from camelCase to snake_case.
 * This function is immutable and returns a new object with the transformed keys.
 * It correctly handles nested objects and arrays. It includes protection against
 * circular references and excessive recursion depth to ensure safety.
 *
 * @template T The type of the input data.
 * @param data The object, array, or primitive to process.
 * @returns A new object with all keys converted to snake_case, with full type safety.
 *
 * @example
 * ```typescript
 * const userObject = {
 *   userId: 123,
 *   profileInfo: {
 *     firstName: 'John',
 *     lastName: 'Doe',
 *     contactDetails: [{ type: 'email', value: 'john.doe@email.com' }]
 *   }
 * };
 * const snakeCasedObject = convertKeysToSnakeCase(userObject);
 * // Result: { user_id: 123, profile_info: { first_name: 'John', last_name: 'Doe', contact_details: [...] } }
 * ```
 */
export function convertKeysToSnakeCase<T>(data: T): SnakeCased<T> {
  const visited = new WeakSet<object>();
  return convertKeysToSnakeCaseRecursive(data, visited, 0);
}
