import * as crypto from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { withUserContext } from '../db/client.js';
import { OAuthDatabaseService } from '../db/oauthDatabaseService.js';
import { oauthTokens } from '../db/schema.js';
import { MetaApiService } from '../tools/meta/ApiService.js';
import type { SessionData } from '../types/auth.js';
import { env } from '../utils/env.js';
import { TokenError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { SessionManager } from './SessionManager.js';
import { TokenManager } from './TokenManager.js';
import { createJWT, verifyJWT } from './jwt.js';

export interface MetaServerAuthProviderDependencies {
  dbService: OAuthDatabaseService;
  sessionManager: SessionManager;
  tokenManager: TokenManager;
}

/**
 * Custom Meta OAuth Server Provider
 *
 * Implements the OAuthServerProvider interface to provide full control over
 * the OAuth flow with Meta, including dynamic client registration using our
 * existing database schema.
 *
 * Key features:
 * - Constructor dependency injection for testability
 * - Database-backed client registration via oauth_clients table
 * - Secure session management following 2025 OAuth best practices
 * - Integration with existing Meta OAuth business logic
 * - JWT-based internal token system
 */
export class MetaServerAuthProvider implements OAuthServerProvider {
  // OAuth authorization codes are now stored in database via SessionManager
  // to support horizontal scaling across multiple server instances

  private _clientsStoreImpl: OAuthRegisteredClientsStore;
  private dbService: OAuthDatabaseService;
  private sessionManager: SessionManager;
  private tokenManager: TokenManager;
  private cleanupTimer?: NodeJS.Timeout;

  public constructor(dependencies: MetaServerAuthProviderDependencies) {
    this.dbService = dependencies.dbService;
    this.sessionManager = dependencies.sessionManager;
    this.tokenManager = dependencies.tokenManager;
    this._clientsStoreImpl = {
      getClient: (clientId: string) => {
        logger.debug('Getting client', { clientId });
        return this.dbService.getClient(clientId);
      },
      registerClient: (client: OAuthClientInformationFull) => {
        logger.info('Registering client', { clientId: client.client_id });
        return this.dbService.registerClient(client);
      },
    };

    this.cleanupTimer = setInterval(
      () => {
        // Call the async method and attach a .catch() handler to the returned promise
        // to prevent unhandled promise rejections.
        this.cleanExpiredTokens().catch((error) => {
          logger.error('Unhandled error during scheduled token cleanup', {
            // Safely log the error message
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      15 * 60 * 1000 // 15 minutes
    );

    logger.info('MetaServerAuthProvider initialized with dependency injection');
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  public get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStoreImpl;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    reply: FastifyReply
  ): Promise<void> {
    logger.info('Starting OAuth authorization for MCP client', {
      clientId: client.client_id,
      requestedScopes: params.scopes,
    });

    try {
      // Define server-supported Facebook API scopes
      const serverSupportedScopes = env.FACEBOOK_OAUTH_SCOPES.split(',');

      // Get client-requested scopes, defaulting to all server-supported scopes if none specified
      // This maintains the business requirement that MCP clients get full access by default
      // while still allowing clients to request specific subsets for principle of least privilege
      const clientRequestedScopes = params.scopes || serverSupportedScopes;

      // Calculate intersection of requested and supported scopes
      const grantedScopes = clientRequestedScopes.filter((scope) =>
        serverSupportedScopes.includes(scope)
      );

      if (grantedScopes.length === 0) {
        throw new ValidationError(
          `No valid Facebook API scopes requested. Supported: ${serverSupportedScopes.join(', ')}, Requested: ${clientRequestedScopes.join(', ')}`
        );
      }

      logger.info('Granting Facebook API scopes to MCP client', {
        clientId: client.client_id,
        requested: clientRequestedScopes,
        granted: grantedScopes,
        isDefaultGrant: !params.scopes, // Log whether this used default scopes
      });

      const redirectUri = client.redirect_uris[0] as string;

      // Generate state parameter
      const state = crypto.randomBytes(32).toString('hex');

      // Store session data including the granted scopes
      const sessionData: SessionData = {
        clientId: client.client_id,
        state: state,
        redirectUri: redirectUri,
        originalState: params.state as string,
        clientCodeChallenge: params.codeChallenge as string,
        clientCodeChallengeMethod: 'S256',
        grantedScopes: grantedScopes, // Store the granted scopes for later use
      };

      await this.sessionManager.storeSessionData(state, sessionData);

      // Redirect to Meta OAuth with the granted Facebook API scopes
      const metaAuthUrl = new URL(`https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth`);
      metaAuthUrl.searchParams.append('client_id', env.FACEBOOK_APP_ID);
      metaAuthUrl.searchParams.append('redirect_uri', env.FACEBOOK_CALLBACK_URL);
      metaAuthUrl.searchParams.append('state', state);
      metaAuthUrl.searchParams.append('scope', grantedScopes.join(','));
      metaAuthUrl.searchParams.append('response_type', 'code');

      reply.redirect(metaAuthUrl.toString());
    } catch (error) {
      logger.error('Authorization setup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clientId: client.client_id,
      });
      throw error;
    }
  }

  // Called from /oauth/callback route to handle Meta OAuth callback
  async handleCallback(
    code: string,
    state: string
  ): Promise<{
    redirectUrl: string;
    success: boolean;
    error?: string;
  }> {
    try {
      // ATOMIC FIX: Use the new atomic method to prevent race conditions.
      const sessionData = await this.sessionManager.getAndClearSessionData(state);
      if (!sessionData) {
        // This now correctly handles both invalid and already-used states.
        return { redirectUrl: '', success: false, error: 'Invalid or expired state parameter' };
      }

      // VALIDATION FIX 1: Validate required session data fields.
      if (!sessionData.clientId || !sessionData.redirectUri) {
        logger.error('Session data is missing required fields', {
          state,
          clientId: sessionData.clientId,
          redirectUri: sessionData.redirectUri,
        });
        return {
          redirectUrl: '',
          success: false,
          error: 'Invalid session state: missing critical data.',
        };
      }

      // 1. Exchange Meta code for an access token
      const { accessToken, expiresIn } = await MetaApiService.exchangeMetaCodeForToken(code);

      // 2. Get user info and persist user
      const fbUser = await MetaApiService.getMetaUserInfo(accessToken);

      // VALIDATION FIX 2: Validate the response from Meta's API.
      if (!fbUser?.id) {
        logger.error('Failed to retrieve a valid user ID from Meta', { accessToken: '***' });
        return {
          redirectUrl: '',
          success: false,
          error: 'Authentication callback failed: Could not retrieve user profile from Meta.',
        };
      }

      const user = await this.dbService.findOrCreateUserByFacebookId(fbUser.id);

      // 3. Store Meta token and sync ad accounts (can run in parallel)
      await Promise.all([
        this.dbService.storeMetaToken(
          user.id,
          accessToken,
          sessionData.grantedScopes || env.FACEBOOK_OAUTH_SCOPES.split(','),
          expiresIn
        ),
        MetaApiService.syncUserAdAccounts(user.id, accessToken),
      ]);

      // 4. Create internal auth code and prepare redirect
      const jwt = await createJWT({
        userId: user.id,
        clientId: sessionData.clientId,
        scopes: sessionData.grantedScopes || env.FACEBOOK_OAUTH_SCOPES.split(','),
      });

      const tempAuthCode = crypto.randomBytes(32).toString('hex');

      // Store temporary auth code in database for horizontal scaling
      const authCodeData = {
        sessionToken: jwt,
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        clientId: sessionData.clientId,
        codeChallenge: sessionData.clientCodeChallenge as string,
        codeChallengeMethod: 'S256' as const,
      };

      await this.sessionManager.storeTempAuthCode(tempAuthCode, authCodeData);

      // VALIDATION FIX 3: Add specific error handling for URL parsing.
      let clientRedirectUrl: URL;
      try {
        clientRedirectUrl = new URL(sessionData.redirectUri);
      } catch (urlError) {
        logger.error('Invalid redirectUri in session data', {
          redirectUri: sessionData.redirectUri,
          error: urlError,
        });
        return {
          redirectUrl: '',
          success: false,
          error: 'Authentication callback failed: Invalid client redirect URI.',
        };
      }

      clientRedirectUrl.searchParams.append('code', tempAuthCode);
      clientRedirectUrl.searchParams.append('state', sessionData.originalState || '');

      // Note: Session data is already cleared by the atomic getAndClearSessionData operation

      return {
        redirectUrl: clientRedirectUrl.toString(),
        success: true,
      };
    } catch (error) {
      logger.error('Callback handling error', { error });
      return {
        redirectUrl: '',
        success: false,
        error: `Authentication callback failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    logger.info('Exchanging authorization code for tokens', { clientId: client.client_id });

    // Note: PKCE challenge check has already been performed by the SDK handler via challengeForAuthorizationCode.

    // ATOMIC GET & DELETE: This single call replaces the separate get and clear calls, preventing the race condition.
    const tempCodeData = await this.sessionManager.getAndClearTempAuthCode(authorizationCode);

    // The new method returns undefined if the code is not found, expired, or invalid.
    // We only need to check for existence and if the code belongs to the correct client.
    if (!tempCodeData || tempCodeData.clientId !== client.client_id) {
      throw new TokenError('Invalid, expired, or already used authorization code');
    }

    // Single-use temporary code is now guaranteed by the atomic database operation.

    const sessionToken = tempCodeData.sessionToken;
    const payload = await verifyJWT(sessionToken);

    // 1. Create refresh token using TokenManager
    const refreshToken = await this.tokenManager.createInitialRefreshToken(
      payload.userId,
      client.client_id
    );

    // 3. Return both access and refresh tokens
    // IMPORTANT: Return only the granted scopes from the JWT payload, not all possible scopes
    return {
      access_token: sessionToken,
      token_type: 'Bearer',
      expires_in: Math.floor((payload.exp * 1000 - Date.now()) / 1000),
      scope: payload.scopes.join(' '), // Return only granted scopes, not all possible scopes
      refresh_token: refreshToken, // Return the raw token to the client
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const payload = await verifyJWT(token);
      const oauthToken = await withUserContext(payload.userId, async (tx) => {
        return tx.query.oauthTokens.findFirst({
          where: eq(oauthTokens.userId, payload.userId),
          orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
        });
      });

      if (!oauthToken) {
        throw new TokenError('No OAuth token found for user');
      }

      // Use the new service method for validation
      const isMetaTokenValid = await MetaApiService.validateAccessToken(oauthToken.accessToken);
      if (!isMetaTokenValid) {
        throw new TokenError('Meta access token is invalid or expired');
      }

      return {
        token,
        clientId: payload.clientId,
        scopes: payload.scopes,
        expiresAt: payload.exp,
        extra: {
          userId: payload.userId,
          metaAccessToken: oauthToken.accessToken,
        },
      };
    } catch (error) {
      logger.error('Token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new TokenError('Invalid access token');
    }
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    logger.debug('Retrieving code challenge for PKCE validation', {
      clientId: client.client_id,
      authorizationCode,
    });
    const tempCodeData = await this.sessionManager.getTempAuthCode(authorizationCode);

    // Check for existence, expiration, and if the client_id matches.
    if (
      !tempCodeData ||
      tempCodeData.expires < Date.now() ||
      tempCodeData.clientId !== client.client_id
    ) {
      // As per security guidelines, if the code is invalid for any reason,
      // it should be deleted to prevent reuse attempts.
      if (tempCodeData) {
        await this.sessionManager.clearTempAuthCode(authorizationCode);
      }
      throw new TokenError('Invalid or expired authorization code');
    }

    // The SDK handler expects the challenge string to be returned.
    return tempCodeData.codeChallenge;
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[] // Note: Scopes are not used here but are part of the interface.
  ): Promise<OAuthTokens> {
    // Delegate the entire rotation logic to TokenManager
    return this.tokenManager.rotateRefreshToken(client, refreshToken);
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token, token_type_hint } = request;

    // Use a validation check instead of casting
    let hint: 'refresh_token' | 'access_token' | undefined;
    if (token_type_hint === 'refresh_token' || token_type_hint === 'access_token') {
      hint = token_type_hint;
    }

    // Delegate the entire revocation logic to TokenManager
    await this.tokenManager.revokeToken(client, token, hint);
  }

  private async cleanExpiredTokens(): Promise<void> {
    // Expired temp auth codes are now automatically cleaned up by the SessionManager's
    // database-level expiration handling, so this method just triggers that cleanup
    try {
      await this.sessionManager.cleanupExpiredSessions();
    } catch (error) {
      logger.error('Failed to clean up expired temp auth codes', { error });
    }
  }
}

// Production dependency composer
export function composeMetaServerAuthProvider(): MetaServerAuthProvider {
  logger.info('Composing new instance of MetaServerAuthProvider with its dependencies');

  const dbService = new OAuthDatabaseService();
  const sessionManager = new SessionManager();
  const tokenManager = new TokenManager(dbService);

  return new MetaServerAuthProvider({
    dbService,
    sessionManager,
    tokenManager,
  });
}
