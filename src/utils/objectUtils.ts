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
