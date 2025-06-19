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
