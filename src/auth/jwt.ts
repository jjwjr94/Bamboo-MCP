import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types/auth.js';
import { env } from '../utils/env.js';
import { TokenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// JWT Configuration
const jwtConfig = {
  algorithm: 'HS256' as const, // TODO: Use RS256/ES256 in production with proper key pairs
  expiresIn: env.JWT_EXPIRES_IN,
  issuer: env.BASE_URL,
  audience: 'bamboo-mcp-client',
};

export interface CreateTokenOptions {
  userId: string;
  clientId: string;
  adAccountId?: string;
  scopes: string[];
}

export function createJWT(options: CreateTokenOptions): string {
  const { userId, clientId, adAccountId, scopes } = options;

  const payload = {
    userId,
    clientId,
    ...(adAccountId && { adAccountId }),
    scopes,
    jti: generateJTI(), // Unique token identifier
  };

  try {
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: jwtConfig.expiresIn,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    } as jwt.SignOptions);

    logger.info('JWT created', { userId, adAccountId, scopes: scopes.length });
    return token;
  } catch (error) {
    logger.error('JWT creation failed', { userId, error });
    throw new TokenError('Failed to create JWT token');
  }
}

export function verifyJWT(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [jwtConfig.algorithm],
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }) as JWTPayload;

    // Validate required fields
    if (!decoded.userId || !decoded.scopes || !Array.isArray(decoded.scopes)) {
      throw new TokenError('Invalid JWT payload structure');
    }

    logger.tokenUsage(decoded.userId, 'JWT_VERIFY', true);
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('JWT verification failed', { error: error.message });
      throw new TokenError(`Invalid JWT: ${error.message}`);
    }

    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT expired', { expiredAt: error.expiredAt });
      throw new TokenError('JWT token has expired');
    }

    if (error instanceof jwt.NotBeforeError) {
      logger.warn('JWT not yet valid', { date: error.date });
      throw new TokenError('JWT token not yet valid');
    }

    logger.error('JWT verification error', { error });
    throw new TokenError('JWT verification failed');
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new TokenError('Authorization header is required');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new TokenError('Authorization header must start with "Bearer "');
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new TokenError('JWT token is missing from Authorization header');
  }

  return token;
}

export function decodeJWTWithoutVerification(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.warn('JWT decode failed', { error });
    return null;
  }
}

function generateJTI(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeJWTWithoutVerification(token);
  if (!decoded?.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
}

export function isTokenExpiringSoon(token: string, minutesThreshold = 5): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true; // Treat unknown expiration as expiring
  }

  const thresholdTime = new Date(Date.now() + minutesThreshold * 60 * 1000);
  return expiration <= thresholdTime;
}
