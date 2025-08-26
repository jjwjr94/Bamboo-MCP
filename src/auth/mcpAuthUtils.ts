import type { JWTPayload } from '../types/auth.js';
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Extracts the JWT payload from the MCP request context (`extra` parameter).
 * This is used for authenticating and authorizing tool/resource requests.
 *
 * @param extra The `extra` object from the MCP request context.
 * @returns The decoded JWTPayload.
 * @throws {AuthenticationError} if the payload is not found.
 */
export function extractAuthPayload(extra: unknown): JWTPayload {
  // Extract auth payload from the request context in a type-safe way
  const authPayload = (extra as { authInfo?: { extra?: { authPayload?: JWTPayload } } })?.authInfo
    ?.extra?.authPayload;

  if (authPayload) {
    return authPayload;
  }

  // If no payload is found, it's a critical error in any environment.
  logger.error('Authentication payload is missing from MCP request context.');
  throw new AuthenticationError('Authorization required');
}
