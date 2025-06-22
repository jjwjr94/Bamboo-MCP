import '../../helpers/testEnv.js'; // Must be first to set environment variables
import * as crypto from 'node:crypto';
import type {
  AuthorizationParams,
  OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FastifyReply } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaServerAuthProvider } from '../../../src/auth/MetaServerAuthProvider.js';
import { SessionManager } from '../../../src/auth/SessionManager.js';
import { TokenManager } from '../../../src/auth/TokenManager.js';
import * as jwt from '../../../src/auth/jwt.js';
import { OAuthDatabaseService } from '../../../src/db/oauthDatabaseService.js';
import { MetaApiService } from '../../../src/tools/meta/ApiService.js';
import type { SessionData, TempAuthCodeData } from '../../../src/types/auth.js';
import { env } from '../../../src/utils/env.js';
import { TokenError, ValidationError } from '../../../src/utils/errors.js';

// Mock all external dependencies
vi.mock('../../../src/auth/SessionManager.js');
vi.mock('../../../src/auth/TokenManager.js');
vi.mock('../../../src/tools/meta/ApiService.js');
vi.mock('../../../src/db/oauthDatabaseService.js');
vi.mock('../../../src/auth/jwt.js');
vi.mock('node:crypto');

describe('MetaServerAuthProvider', () => {
  let provider: MetaServerAuthProvider;
  let mockSessionManager: vi.Mocked<SessionManager>;
  let mockTokenManager: vi.Mocked<TokenManager>;
  let mockDbService: vi.Mocked<OAuthDatabaseService>;

  const mockClient: OAuthClientInformationFull = {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uris: ['https://client.app/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'claudeai',
  };

  const mockReply = {
    redirect: vi.fn(),
  } as unknown as FastifyReply;

  beforeEach(() => {
    // Reset environment variables
    env.FACEBOOK_OAUTH_SCOPES = 'public_profile,email,ads_read';
    env.FACEBOOK_APP_ID = 'test-facebook-app-id';
    env.FACEBOOK_CALLBACK_URL = 'https://server.example/oauth/callback';
    env.META_API_VERSION = 'v22.0';

    // Mock SessionManager
    vi.mocked(SessionManager).mockImplementation(() => {
      mockSessionManager = {
        storeSessionData: vi.fn().mockResolvedValue(undefined),
        getSessionData: vi.fn(),
        getAndClearSessionData: vi.fn(),
        clearSessionData: vi.fn().mockResolvedValue(undefined),
        storeTempAuthCode: vi.fn().mockResolvedValue(undefined),
        getTempAuthCode: vi.fn(),
        getAndClearTempAuthCode: vi.fn(),
        clearTempAuthCode: vi.fn().mockResolvedValue(undefined),
        cleanupExpiredSessions: vi.fn().mockResolvedValue(undefined),
      } as unknown as vi.Mocked<SessionManager>;
      return mockSessionManager;
    });

    // Mock TokenManager
    vi.mocked(TokenManager).mockImplementation(() => {
      mockTokenManager = {
        createInitialRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
        rotateRefreshToken: vi.fn(),
        revokeToken: vi.fn(),
      } as unknown as vi.Mocked<TokenManager>;
      return mockTokenManager;
    });

    // Mock OAuthDatabaseService
    vi.mocked(OAuthDatabaseService.getInstance).mockReturnValue({
      findOrCreateUserByFacebookId: vi.fn().mockResolvedValue({
        id: 'user-uuid-123',
        facebookUserId: 'fb-user-id-456',
      }),
      storeMetaToken: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn().mockResolvedValue(mockClient),
    } as unknown as vi.Mocked<OAuthDatabaseService>);
    mockDbService = vi.mocked(OAuthDatabaseService.getInstance)();

    // Mock MetaApiService static methods
    vi.mocked(MetaApiService.exchangeMetaCodeForToken).mockResolvedValue({
      accessToken: 'meta-access-token',
      expiresIn: 3600,
    });
    vi.mocked(MetaApiService.getMetaUserInfo).mockResolvedValue({
      id: 'fb-user-id-456',
    });
    vi.mocked(MetaApiService.syncUserAdAccounts).mockResolvedValue(undefined);

    // Mock JWT functions
    vi.mocked(jwt.createJWT).mockResolvedValue('mock-internal-jwt');
    vi.mocked(jwt.verifyJWT).mockResolvedValue({
      userId: 'user-uuid-123',
      clientId: 'test-client-id',
      scopes: ['public_profile', 'email'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: 'test-issuer',
      aud: 'test-audience',
    });

    // Get provider instance
    provider = MetaServerAuthProvider.getInstance();
  });

  beforeEach(() => {
    // Clear all mocks and reset crypto mock with proper call tracking
    vi.clearAllMocks();

    // Mock crypto for predictable values - using 32 bytes for both state and temp auth codes
    // Strategy: Return the appropriate value based on the context
    vi.mocked(crypto.randomBytes).mockImplementation((size: number) => {
      if (size === 32) {
        // For 32-byte calls, check if this is being called from authorize (state) or handleCallback (temp code)
        const stack = new Error().stack || '';
        if (stack.includes('authorize')) {
          return Buffer.from('mock-random-state-bytes-000000000000000000000000000000');
        } else {
          // handleCallback or other contexts - return temp auth code
          return Buffer.from('mock-temp-auth-code-bytes000000000000000000000000000000');
        }
      } else {
        // For 64-byte calls (refresh tokens), return a different value
        return Buffer.from(
          'mock-refresh-token-bytes000000000000000000000000000000000000000000000000000000000000000000'
        );
      }
    });
  });

  describe('authorize()', () => {
    it('should generate state, store session data, and redirect to Meta with requested scopes', async () => {
      const params: AuthorizationParams = {
        scopes: ['public_profile', 'email'],
        state: 'client-state-123',
        codeChallenge: 'pkce-challenge-string',
        codeChallengeMethod: 'S256',
      };

      await provider.authorize(mockClient, params, mockReply);

      // Verify session data storage
      expect(mockSessionManager.storeSessionData).toHaveBeenCalledOnce();
      const [storedState, sessionData] = mockSessionManager.storeSessionData.mock.calls[0];

      expect(storedState).toBe(
        '6d6f636b2d72616e646f6d2d73746174652d62797465732d303030303030303030303030303030303030303030303030303030303030'
      );
      expect(sessionData.clientId).toBe(mockClient.client_id);
      expect(sessionData.redirectUri).toBe(mockClient.redirect_uris[0]);
      expect(sessionData.originalState).toBe('client-state-123');
      expect(sessionData.clientCodeChallenge).toBe('pkce-challenge-string');
      expect(sessionData.clientCodeChallengeMethod).toBe('S256');
      expect(sessionData.grantedScopes).toEqual(['public_profile', 'email']);

      // Verify redirect URL generation
      expect(mockReply.redirect).toHaveBeenCalledOnce();
      const redirectUrl = new URL(mockReply.redirect.mock.calls[0][0]);
      expect(redirectUrl.origin).toBe('https://www.facebook.com');
      expect(redirectUrl.pathname).toBe('/v22.0/dialog/oauth');
      expect(redirectUrl.searchParams.get('client_id')).toBe('test-facebook-app-id');
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
        'https://server.example/oauth/callback'
      );
      expect(redirectUrl.searchParams.get('state')).toBe(storedState);
      expect(redirectUrl.searchParams.get('scope')).toBe('public_profile,email');
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    });

    it('should use default server scopes if client requests none', async () => {
      const params: AuthorizationParams = {
        state: 'client-state-456',
        codeChallenge: 'pkce-challenge',
        codeChallengeMethod: 'S256',
      };

      await provider.authorize(mockClient, params, mockReply);

      const redirectUrl = new URL(mockReply.redirect.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get('scope')).toBe('public_profile,email,ads_read');

      const sessionData = mockSessionManager.storeSessionData.mock.calls[0][1];
      expect(sessionData.grantedScopes).toEqual(['public_profile', 'email', 'ads_read']);
    });

    it('should only grant scopes supported by the server', async () => {
      const params: AuthorizationParams = {
        scopes: ['email', 'invalid_scope', 'ads_read'],
        state: 'client-state-789',
        codeChallenge: 'pkce-challenge',
        codeChallengeMethod: 'S256',
      };

      await provider.authorize(mockClient, params, mockReply);

      const redirectUrl = new URL(mockReply.redirect.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get('scope')).toBe('email,ads_read');

      const sessionData = mockSessionManager.storeSessionData.mock.calls[0][1];
      expect(sessionData.grantedScopes).toEqual(['email', 'ads_read']);
    });

    it('should throw ValidationError if no valid scopes are requested', async () => {
      const params: AuthorizationParams = {
        scopes: ['invalid_scope_1', 'invalid_scope_2'],
        state: 'client-state-invalid',
        codeChallenge: 'pkce-challenge',
        codeChallengeMethod: 'S256',
      };

      await expect(provider.authorize(mockClient, params, mockReply)).rejects.toThrow(
        ValidationError
      );
      expect(mockReply.redirect).not.toHaveBeenCalled();
      expect(mockSessionManager.storeSessionData).not.toHaveBeenCalled();
    });

    it('should handle session storage errors gracefully', async () => {
      const params: AuthorizationParams = {
        scopes: ['email'],
        state: 'client-state-error',
        codeChallenge: 'pkce-challenge',
        codeChallengeMethod: 'S256',
      };

      mockSessionManager.storeSessionData.mockRejectedValue(new Error('Database error'));

      await expect(provider.authorize(mockClient, params, mockReply)).rejects.toThrow(
        'Database error'
      );
      expect(mockReply.redirect).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback()', () => {
    const metaCode = 'meta-auth-code-from-facebook';
    const metaState =
      '6d6f636b2d72616e646f6d2d73746174652d62797465732d303030303030303030303030303030303030303030303030303030303030';

    const validSessionData: SessionData = {
      clientId: mockClient.client_id,
      state: metaState,
      redirectUri: 'https://client.app/callback',
      originalState: 'client-state-original',
      clientCodeChallenge: 'pkce-challenge-from-client',
      clientCodeChallengeMethod: 'S256',
      grantedScopes: ['public_profile', 'email'],
    };

    it('should process a valid callback and return client redirect URL', async () => {
      mockSessionManager.getAndClearSessionData.mockResolvedValue(validSessionData);

      const result = await provider.handleCallback(metaCode, metaState);

      // Verify Meta API calls
      expect(MetaApiService.exchangeMetaCodeForToken).toHaveBeenCalledWith(metaCode);
      expect(MetaApiService.getMetaUserInfo).toHaveBeenCalledWith('meta-access-token');
      expect(mockDbService.findOrCreateUserByFacebookId).toHaveBeenCalledWith('fb-user-id-456');

      // Verify parallel operations
      expect(mockDbService.storeMetaToken).toHaveBeenCalledWith(
        'user-uuid-123',
        'meta-access-token',
        ['public_profile', 'email'],
        3600
      );
      expect(MetaApiService.syncUserAdAccounts).toHaveBeenCalledWith(
        'user-uuid-123',
        'meta-access-token'
      );

      // Verify JWT creation and temp auth code storage
      expect(jwt.createJWT).toHaveBeenCalledWith({
        userId: 'user-uuid-123',
        clientId: mockClient.client_id,
        scopes: ['public_profile', 'email'],
      });

      expect(mockSessionManager.storeTempAuthCode).toHaveBeenCalledOnce();
      const [tempCode, tempCodeData] = mockSessionManager.storeTempAuthCode.mock.calls[0];
      expect(tempCode).toBe(
        '6d6f636b2d74656d702d617574682d636f64652d6279746573303030303030303030303030303030303030303030303030303030303030'
      );
      expect(tempCodeData.sessionToken).toBe('mock-internal-jwt');
      expect(tempCodeData.clientId).toBe(mockClient.client_id);
      expect(tempCodeData.codeChallenge).toBe('pkce-challenge-from-client');
      expect(tempCodeData.codeChallengeMethod).toBe('S256');
      expect(tempCodeData.expires).toBeGreaterThan(Date.now());

      // Verify atomic session retrieval and cleanup (clearSessionData no longer called separately)
      expect(mockSessionManager.getAndClearSessionData).toHaveBeenCalledWith(metaState);

      // Verify successful result
      expect(result.success).toBe(true);
      const redirectUrl = new URL(result.redirectUrl);
      expect(redirectUrl.origin).toBe('https://client.app');
      expect(redirectUrl.pathname).toBe('/callback');
      expect(redirectUrl.searchParams.get('code')).toBe(tempCode);
      expect(redirectUrl.searchParams.get('state')).toBe('client-state-original');
    });

    it('should return failure for invalid state parameter', async () => {
      mockSessionManager.getAndClearSessionData.mockResolvedValue(undefined);

      const result = await provider.handleCallback(metaCode, 'invalid-state');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired state parameter');
      expect(result.redirectUrl).toBe('');

      // Verify no further processing occurred
      expect(MetaApiService.exchangeMetaCodeForToken).not.toHaveBeenCalled();
    });

    it('should return failure if Meta code exchange fails', async () => {
      mockSessionManager.getAndClearSessionData.mockResolvedValue(validSessionData);
      vi.mocked(MetaApiService.exchangeMetaCodeForToken).mockRejectedValue(
        new Error('Meta API authentication failed')
      );

      const result = await provider.handleCallback('invalid-meta-code', metaState);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Authentication callback failed: Meta API authentication failed'
      );
      expect(result.redirectUrl).toBe('');
    });

    it('should return failure if user info retrieval fails', async () => {
      mockSessionManager.getAndClearSessionData.mockResolvedValue(validSessionData);
      vi.mocked(MetaApiService.getMetaUserInfo).mockRejectedValue(
        new Error('Failed to get user info')
      );

      const result = await provider.handleCallback(metaCode, metaState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get user info');
    });

    it('should return failure if database operations fail', async () => {
      mockSessionManager.getAndClearSessionData.mockResolvedValue(validSessionData);
      mockDbService.findOrCreateUserByFacebookId.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await provider.handleCallback(metaCode, metaState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should use default scopes if grantedScopes is missing from session', async () => {
      const sessionDataWithoutScopes: SessionData = {
        ...validSessionData,
        grantedScopes: undefined,
      };
      mockSessionManager.getAndClearSessionData.mockResolvedValue(sessionDataWithoutScopes);

      const result = await provider.handleCallback(metaCode, metaState);

      expect(result.success).toBe(true);
      expect(mockDbService.storeMetaToken).toHaveBeenCalledWith(
        'user-uuid-123',
        'meta-access-token',
        ['public_profile', 'email', 'ads_read'], // Default scopes
        3600
      );
    });

    it('should proceed successfully even if PKCE challenge is missing from session', async () => {
      const sessionWithoutPkce: SessionData = {
        clientId: mockClient.client_id,
        state: metaState,
        redirectUri: 'https://client.app/callback',
        originalState: 'client-state-original',
        // clientCodeChallenge and clientCodeChallengeMethod are missing
        grantedScopes: ['public_profile', 'email'],
      };
      mockSessionManager.getAndClearSessionData.mockResolvedValue(sessionWithoutPkce);

      const result = await provider.handleCallback(metaCode, metaState);

      expect(result.success).toBe(true);
      // Verify it stores the temp auth code with an undefined challenge
      expect(mockSessionManager.storeTempAuthCode).toHaveBeenCalledOnce();
      const [, tempCodeData] = mockSessionManager.storeTempAuthCode.mock.calls[0];
      expect(tempCodeData.codeChallenge).toBeUndefined();
    });
  });

  describe('exchangeAuthorizationCode()', () => {
    const authCode = 'temp-authorization-code';
    const validTempCodeData: TempAuthCodeData = {
      sessionToken: 'mock-internal-jwt',
      clientId: mockClient.client_id,
      codeChallenge: 'pkce-challenge-from-client',
      codeChallengeMethod: 'S256',
      expires: Date.now() + 300000, // 5 minutes from now
    };

    it('should exchange a valid authorization code for tokens', async () => {
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(validTempCodeData);

      const tokens = await provider.exchangeAuthorizationCode(mockClient, authCode);

      // Verify atomic get-and-clear was used
      expect(mockSessionManager.getAndClearTempAuthCode).toHaveBeenCalledWith(authCode);

      // Verify JWT verification and token creation
      expect(jwt.verifyJWT).toHaveBeenCalledWith('mock-internal-jwt');
      expect(mockTokenManager.createInitialRefreshToken).toHaveBeenCalledWith(
        'user-uuid-123',
        mockClient.client_id
      );

      // Verify final token payload
      expect(tokens.access_token).toBe('mock-internal-jwt');
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.refresh_token).toBe('mock-refresh-token');
      expect(tokens.scope).toBe('public_profile email');
      expect(tokens.expires_in).toBeGreaterThan(3500);
      expect(tokens.expires_in).toBeLessThan(3601);
    });

    it('should throw TokenError for invalid or used authorization code', async () => {
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(undefined);

      await expect(provider.exchangeAuthorizationCode(mockClient, 'invalid-code')).rejects.toThrow(
        new TokenError('Invalid, expired, or already used authorization code')
      );

      expect(jwt.verifyJWT).not.toHaveBeenCalled();
      expect(mockTokenManager.createInitialRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw TokenError if code was issued for different client', async () => {
      const mismatchedTempCodeData: TempAuthCodeData = {
        ...validTempCodeData,
        clientId: 'different-client-id',
      };
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(mismatchedTempCodeData);

      await expect(provider.exchangeAuthorizationCode(mockClient, authCode)).rejects.toThrow(
        TokenError
      );

      expect(jwt.verifyJWT).not.toHaveBeenCalled();
      expect(mockTokenManager.createInitialRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw error if JWT verification fails', async () => {
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(validTempCodeData);
      vi.mocked(jwt.verifyJWT).mockRejectedValue(new Error('Invalid JWT signature'));

      await expect(provider.exchangeAuthorizationCode(mockClient, authCode)).rejects.toThrow(
        'Invalid JWT signature'
      );

      expect(mockTokenManager.createInitialRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw error if refresh token creation fails', async () => {
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(validTempCodeData);
      mockTokenManager.createInitialRefreshToken.mockRejectedValue(
        new Error('Failed to create refresh token')
      );

      await expect(provider.exchangeAuthorizationCode(mockClient, authCode)).rejects.toThrow(
        'Failed to create refresh token'
      );
    });
  });

  describe('challengeForAuthorizationCode()', () => {
    const authCode = 'pkce-test-auth-code';
    const validTempCodeData: TempAuthCodeData = {
      sessionToken: 'some-jwt',
      clientId: mockClient.client_id,
      codeChallenge: 'the-stored-pkce-challenge',
      codeChallengeMethod: 'S256',
      expires: Date.now() + 300000, // Expires in 5 minutes
    };

    it('should return the code challenge for a valid authorization code', async () => {
      mockSessionManager.getTempAuthCode.mockResolvedValue(validTempCodeData);

      const challenge = await provider.challengeForAuthorizationCode(mockClient, authCode);

      expect(mockSessionManager.getTempAuthCode).toHaveBeenCalledWith(authCode);
      expect(challenge).toBe('the-stored-pkce-challenge');
      expect(mockSessionManager.clearTempAuthCode).not.toHaveBeenCalled(); // Should not clear yet
    });

    it('should throw TokenError for an invalid or non-existent authorization code', async () => {
      mockSessionManager.getTempAuthCode.mockResolvedValue(undefined);

      await expect(
        provider.challengeForAuthorizationCode(mockClient, 'invalid-code')
      ).rejects.toThrow(new TokenError('Invalid or expired authorization code'));
    });

    it('should throw TokenError if the code has expired', async () => {
      const expiredTempCodeData = {
        ...validTempCodeData,
        expires: Date.now() - 1000, // Expired 1 second ago
      };
      mockSessionManager.getTempAuthCode.mockResolvedValue(expiredTempCodeData);

      await expect(provider.challengeForAuthorizationCode(mockClient, authCode)).rejects.toThrow(
        new TokenError('Invalid or expired authorization code')
      );
      // As per the implementation, it should clear an invalid code upon discovery
      expect(mockSessionManager.clearTempAuthCode).toHaveBeenCalledWith(authCode);
    });

    it('should throw TokenError if the code belongs to a different client', async () => {
      const mismatchedClientData = {
        ...validTempCodeData,
        clientId: 'another-client-id',
      };
      mockSessionManager.getTempAuthCode.mockResolvedValue(mismatchedClientData);

      await expect(provider.challengeForAuthorizationCode(mockClient, authCode)).rejects.toThrow(
        new TokenError('Invalid or expired authorization code')
      );
      expect(mockSessionManager.clearTempAuthCode).toHaveBeenCalledWith(authCode);
    });
  });

  describe('Full OAuth Flow Integration', () => {
    it('should handle complete OAuth flow from authorize to token exchange', async () => {
      // Step 1: Authorize
      const authorizeParams: AuthorizationParams = {
        scopes: ['email'],
        state: 'client-state-integration',
        codeChallenge: 'integration-pkce-challenge',
        codeChallengeMethod: 'S256',
      };

      await provider.authorize(mockClient, authorizeParams, mockReply);
      const [storedState, storedSessionData] = mockSessionManager.storeSessionData.mock.calls[0];

      // Step 2: Handle Callback
      mockSessionManager.getAndClearSessionData.mockResolvedValue(storedSessionData);

      const callbackResult = await provider.handleCallback('meta-integration-code', storedState);
      expect(callbackResult.success).toBe(true);

      const tempAuthCode = new URL(callbackResult.redirectUrl).searchParams.get('code')!;
      const [, storedTempCodeData] = mockSessionManager.storeTempAuthCode.mock.calls[0];

      // Step 3: Exchange Authorization Code
      mockSessionManager.getAndClearTempAuthCode.mockResolvedValue(storedTempCodeData);
      vi.mocked(jwt.verifyJWT).mockResolvedValue({
        userId: 'user-uuid-123',
        clientId: mockClient.client_id,
        scopes: ['email'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'test-issuer',
        aud: 'test-audience',
      });

      const finalTokens = await provider.exchangeAuthorizationCode(mockClient, tempAuthCode);

      // Final Assertions
      expect(finalTokens.scope).toBe('email');
      expect(finalTokens.access_token).toBe('mock-internal-jwt');
      expect(finalTokens.refresh_token).toBe('mock-refresh-token');
      expect(mockSessionManager.getAndClearTempAuthCode).toHaveBeenCalledWith(tempAuthCode);

      // Verify atomic session management occurred
      expect(mockSessionManager.getAndClearSessionData).toHaveBeenCalledWith(storedState);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle concurrent callback processing with same state', async () => {
      const sessionData: SessionData = {
        clientId: mockClient.client_id,
        state: 'concurrent-state',
        redirectUri: 'https://client.app/callback',
        originalState: 'original-state',
        clientCodeChallenge: 'challenge',
        clientCodeChallengeMethod: 'S256',
        grantedScopes: ['email'],
      };

      // Mock the atomic get-and-clear method
      mockSessionManager.getAndClearSessionData
        .mockResolvedValueOnce(sessionData) // First call succeeds
        .mockResolvedValueOnce(undefined); // Second call fails (already cleared)

      const [result1, result2] = await Promise.all([
        provider.handleCallback('code1', 'concurrent-state'),
        provider.handleCallback('code2', 'concurrent-state'),
      ]);

      // Only one should succeed
      const successes = [result1, result2].filter((r) => r.success);
      const failures = [result1, result2].filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].error).toBe('Invalid or expired state parameter');

      // Verify the new atomic method was called twice
      expect(mockSessionManager.getAndClearSessionData).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed redirect URI in session data', async () => {
      const sessionData: SessionData = {
        clientId: mockClient.client_id,
        state: 'malformed-state',
        redirectUri: 'not-a-valid-url',
        originalState: 'original-state',
        clientCodeChallenge: 'challenge',
        clientCodeChallengeMethod: 'S256',
        grantedScopes: ['email'],
      };

      mockSessionManager.getAndClearSessionData.mockResolvedValue(sessionData);

      const result = await provider.handleCallback('code', 'malformed-state');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication callback failed');
    });
  });
});
