import type { JWTPayload } from '../types/auth.js';
import { env } from '../utils/env.js';
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Extracts the JWT payload from the MCP request context (`extra` parameter).
 * This is used for authenticating and authorizing tool/resource requests.
 *
 * @param extra The `extra` object from the MCP request context.
 * @returns The decoded JWTPayload.
 * @throws {AuthenticationError} if the payload is not found. The error message
 * and logging differ slightly between development and production environments.
 */
export function extractAuthPayload(extra: unknown): JWTPayload {
  // Extract auth payload from the request context in a type-safe way
  const authPayload = (extra as { authInfo?: { extra?: { authPayload?: JWTPayload } } })?.authInfo
    ?.extra?.authPayload;

  if (authPayload) {
    return authPayload;
  }

  // Development mode fallback
  if (env.NODE_ENV === 'development') {
    logger.warn('No auth payload found in development mode. Authentication is required.');
    throw new AuthenticationError('Authentication required');
  }

  throw new AuthenticationError('Authorization required');
}
