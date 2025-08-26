import { SignJWT, decodeJwt, importPKCS8, importSPKI, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload } from '../types/auth.js';
import { env, getRequiredBaseUrl } from '../utils/env.js';
import { TokenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// JWT Configuration for EdDSA
const jwtConfig = {
  algorithm: 'EdDSA' as const,
  expiresIn: env.JWT_EXPIRES_IN,
  issuer: getRequiredBaseUrl('JWT issuer configuration'),
  audience: 'bamboo-mcp-client',
};

// Key import promises - loaded once at module startup for performance
// Only load keys if they are provided
const privateKeyPromise = env.JWT_PRIVATE_KEY ? importPKCS8(env.JWT_PRIVATE_KEY, 'EdDSA') : null;
const publicKeyPromise = env.JWT_PUBLIC_KEY ? importSPKI(env.JWT_PUBLIC_KEY, 'EdDSA') : null;

export interface CreateTokenOptions {
  userId: string;
  clientId: string;
  adAccountId?: string;
  scopes: string[];
}

export async function createJWT(options: CreateTokenOptions): Promise<string> {
  const { userId, clientId, adAccountId, scopes } = options;

  if (!privateKeyPromise) {
    throw new TokenError('JWT_PRIVATE_KEY not configured');
  }

  try {
    const privateKey = await privateKeyPromise;

    const token = await new SignJWT({
      userId,
      clientId,
      ...(adAccountId && { adAccountId }),
      scopes,
    })
      .setProtectedHeader({ alg: jwtConfig.algorithm })
      .setIssuedAt()
      .setExpirationTime(jwtConfig.expiresIn)
      .setIssuer(jwtConfig.issuer)
      .setAudience(jwtConfig.audience)
      .setJti(generateJTI())
      .sign(privateKey);

    logger.info('JWT created', { userId, adAccountId, scopes: scopes.length });
    return token;
  } catch (error) {
    logger.error('JWT creation failed', { userId, error });
    throw new TokenError('Failed to create JWT token');
  }
}

export async function verifyJWT(token: string): Promise<JWTPayload> {
  if (!publicKeyPromise) {
    throw new TokenError('JWT_PUBLIC_KEY not configured');
  }

  try {
    const publicKey = await publicKeyPromise;

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      algorithms: [jwtConfig.algorithm],
    });

    // Validate required fields
    if (!payload.userId || !payload.clientId || !payload.scopes || !Array.isArray(payload.scopes)) {
      throw new TokenError('Invalid JWT payload structure');
    }

    logger.tokenUsage(payload.userId as string, 'JWT_VERIFY', true);
    return payload as JWTPayload;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      logger.warn('JWT expired', { expiredAt: error.payload?.exp });
      throw new TokenError('JWT token has expired');
    }

    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      logger.warn('JWT claim validation failed', { error: error.message });
      throw new TokenError(`Invalid JWT: ${error.message}`);
    }

    if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
      logger.warn('JWT signature verification failed');
      throw new TokenError('Invalid JWT: signature verification failed');
    }

    if (error instanceof joseErrors.JWTInvalid) {
      logger.warn('JWT invalid format', { error: error.message });
      throw new TokenError(`Invalid JWT: ${error.message}`);
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
    const decoded = decodeJwt(token) as JWTPayload;
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
