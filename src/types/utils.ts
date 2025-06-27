/**
 * Recursively removes properties with keys starting with an underscore from a type.
 * This provides type safety for objects sanitized by `removeUnderscoreProperties`.
 *
 * @example
 * ```typescript
 * type Original = { id: string; _api: { token: string }; nested: { _internal: boolean; value: number } };
 * type Clean = Sanitized<Original>; // { id: string; nested: { value: number } }
 * ```
 */
export type Sanitized<T> = T extends (infer U)[]
  ? Sanitized<U>[]
  : T extends object
    ? { [K in keyof T as K extends `_${string}` ? never : K]: Sanitized<T[K]> }
    : T;

/**
 * A utility type to convert a string literal from camelCase to snake_case.
 * Handles various cases including sequences of capital letters (e.g., 'HTTPRequest' -> 'http_request').
 * @template S The string type to convert.
 */
type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? T extends Uppercase<T>
    ? U extends `${infer V}${infer W}`
      ? V extends Uppercase<V>
        ? `${Lowercase<T>}${CamelToSnakeCase<`${V}${W}`>}` // Part of an acronym
        : `${Lowercase<T>}_${CamelToSnakeCase<`${V}${W}`>}` // Acronym ends
      : Lowercase<T>
    : `${T}${CamelToSnakeCase<U>}`
  : S;

/**
 * Recursively converts object key types from camelCase to snake_case, providing
 * compile-time type safety for the transformation.
 *
 * @template T The type to be transformed.
 *
 * @example
 * ```typescript
 * type User = { userId: string; contactInfo: { emailAddress: string } };
 * type SnakeCasedUser = SnakeCased<User>;
 * // Result type: { user_id: string; contact_info: { email_address: string } }
 * ```
 */
export type SnakeCased<T> = T extends (infer U)[]
  ? SnakeCased<U>[]
  : T extends object
    ? { [K in keyof T as K extends string ? CamelToSnakeCase<K> : K]: SnakeCased<T[K]> }
    : T;
