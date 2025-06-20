import * as crypto from 'node:crypto';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthDatabaseService } from '../db/oauthDatabaseService.js';
import { TokenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { createJWT, verifyJWT } from './jwt.js';

/**
 * Token Manager
 *
 * Handles the lifecycle of OAuth refresh tokens including creation, rotation,
 * and revocation. Centralizes all token-related business logic and provides
 * a clean abstraction over database operations.
 *
 * Key responsibilities:
 * - Initial refresh token creation after authorization code exchange
 * - Token rotation (refresh token grant)
 * - Token revocation for both refresh and access tokens
 * - Security measures like token family revocation on replay attacks
 */
export class TokenManager {
  private dbService: OAuthDatabaseService;

  constructor(dbService: OAuthDatabaseService) {
    this.dbService = dbService;
    logger.info('TokenManager initialized');
  }

  /**
   * Creates and stores a new refresh token for a user and client.
   * Called after successful authorization code exchange.
   *
   * @param userId - The ID of the user
   * @param clientId - The ID of the OAuth client
   * @returns The raw (unhashed) refresh token to return to the client
   */
  public async createInitialRefreshToken(userId: string, clientId: string): Promise<string> {
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.dbService.createRefreshToken(userId, clientId, hashedRefreshToken);

    logger.info('Initial refresh token created and stored', { userId, clientId });
    return refreshToken; // Return the raw token to the client
  }

  /**
   * Exchanges a valid refresh token for new access and refresh tokens (token rotation).
   * Implements secure token rotation following OAuth 2.1 best practices.
   *
   * @param client - The OAuth client information
   * @param refreshToken - The refresh token provided by the client
   * @returns A new set of OAuth tokens
   * @throws An error if the refresh token is invalid, expired, or revoked
   */
  public async rotateRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    logger.info('Rotating refresh token', { clientId: client.client_id });

    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find and validate the refresh token (includes breach detection)
    const storedToken = await this.dbService.findAndValidateRefreshToken(
      hashedRefreshToken,
      client.client_id
    );

    // SECURITY: Fail-closed approach - require original scope grant to prevent privilege escalation
    // If the original OAuth token or scopes are missing, we cannot safely refresh the token
    // as we don't know what permissions the user originally granted. The secure approach is
    // to invalidate the refresh token and require re-authentication.
    const userOAuthToken = await this.dbService.getLatestUserOAuthToken(storedToken.userId);

    if (!userOAuthToken || !userOAuthToken.scopes) {
      // SECURITY FIX: Fail-closed to prevent privilege escalation
      logger.error('Cannot refresh token: original OAuth scope grant information is missing', {
        userId: storedToken.userId,
        clientId: client.client_id,
        reason: !userOAuthToken ? 'No OAuth token record found' : 'Scopes field is null/undefined',
      });

      // Invalidate the refresh token since we cannot safely refresh it
      await this.dbService.revokeTokenById(storedToken.id);

      throw new TokenError(
        'Token refresh failed: original authorization scope information is missing. Please re-authenticate to continue using the application.'
      );
    }

    // Use the originally granted scopes from the stored OAuth token
    // This preserves the principle of least privilege per OAuth 2.1
    const originallyGrantedScopes = userOAuthToken.scopes;

    // Generate new tokens with preserved scopes
    const newAccessToken = await createJWT({
      userId: storedToken.userId,
      clientId: client.client_id,
      scopes: originallyGrantedScopes, // FIXED: Use preserved scopes, not all scopes
    });
    const newPayload = await verifyJWT(newAccessToken);
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newHashedRefreshToken = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    // Rotate the token in the database (invalidates old, stores new)
    await this.dbService.rotateRefreshToken(
      storedToken.id,
      storedToken.userId,
      client.client_id,
      newHashedRefreshToken
    );

    logger.info('Refresh token rotated with preserved Facebook scopes', {
      userId: storedToken.userId,
      clientId: client.client_id,
      preservedScopes: originallyGrantedScopes,
    });

    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: Math.floor((newPayload.exp * 1000 - Date.now()) / 1000),
      refresh_token: newRefreshToken,
      scope: newPayload.scopes.join(' '),
    };
  }

  /**
   * Revokes a refresh token or all tokens associated with an access token.
   * Supports both refresh_token and access_token revocation.
   *
   * @param client - The OAuth client information
   * @param token - The token string to revoke
   * @param tokenTypeHint - A hint indicating whether it's a 'refresh_token' or 'access_token'
   */
  public async revokeToken(
    client: OAuthClientInformationFull,
    token: string,
    tokenTypeHint?: 'refresh_token' | 'access_token'
  ): Promise<void> {
    logger.info('Revoking token', { clientId: client.client_id, token_type_hint: tokenTypeHint });

    if (tokenTypeHint === 'refresh_token') {
      const hashedRefreshToken = crypto.createHash('sha256').update(token).digest('hex');
      const storedToken = await this.dbService.findRefreshTokenByHash(
        hashedRefreshToken,
        client.client_id
      );
      if (storedToken) {
        await this.dbService.revokeTokenById(storedToken.id);
        logger.info('Refresh token revoked successfully', { tokenId: storedToken.id });
      }
    } else if (tokenTypeHint === 'access_token') {
      // If an access token is revoked, we revoke the entire family of refresh tokens
      // for that user/client pair since JWTs are stateless
      try {
        const payload = await verifyJWT(token);
        await this.dbService.revokeActiveTokensForUser(payload.userId, client.client_id);
        logger.info('Revoked active refresh tokens for user due to access token revocation', {
          userId: payload.userId,
        });
      } catch (error) {
        // Ignore errors from invalid/expired JWTs, as they are effectively already "revoked"
        logger.warn('Attempted to revoke an invalid access token', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      logger.warn('Token revocation request with no or unsupported hint', {
        token_type_hint: tokenTypeHint,
      });
    }
  }
}
