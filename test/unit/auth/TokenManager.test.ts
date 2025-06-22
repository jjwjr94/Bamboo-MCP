import '../../helpers/testEnv.js'; // Must be first to set environment variables
import * as crypto from 'node:crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { type Mocked, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenManager } from '../../../src/auth/TokenManager.js';
import * as jwt from '../../../src/auth/jwt.js';
import type { OAuthDatabaseService } from '../../../src/db/oauthDatabaseService.js';
import type { OAuthRefreshToken, OAuthToken } from '../../../src/db/schema.js';
import { TokenError } from '../../../src/utils/errors.js';

// Mock all external dependencies
vi.mock('../../../src/db/oauthDatabaseService.js');
vi.mock('../../../src/auth/jwt.js');
vi.mock('node:crypto');

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let mockDbService: Mocked<OAuthDatabaseService>;

  const mockClient: OAuthClientInformationFull = {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uris: ['https://client.app/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'claudeai',
  };

  beforeEach(() => {
    // Mock OAuthDatabaseService
    mockDbService = {
      createRefreshToken: vi.fn().mockResolvedValue(undefined),
      findAndValidateRefreshToken: vi.fn(),
      getLatestUserOAuthToken: vi.fn(),
      rotateRefreshToken: vi.fn().mockResolvedValue(undefined),
      revokeTokenById: vi.fn().mockResolvedValue(undefined),
      findRefreshTokenByHash: vi.fn(),
      revokeActiveTokensForUser: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn(),
      registerClient: vi.fn(),
      findOrCreateUserByFacebookId: vi.fn(),
      storeMetaToken: vi.fn(),
    } as unknown as Mocked<OAuthDatabaseService>;

    // Mock JWT functions
    vi.mocked(jwt.createJWT).mockResolvedValue('new-access-token-jwt');
    vi.mocked(jwt.verifyJWT).mockResolvedValue({
      userId: 'user-id-123',
      clientId: 'test-client-id',
      scopes: ['read_profile', 'manage_ads'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: 'test-issuer',
      aud: 'test-audience',
    });

    // Define predictable token values for clear test expectations
    const initialTokenBuffer = Buffer.from('initial-refresh-token-bytes'.padEnd(64, '0'));
    const newTokenBuffer = Buffer.from('new-refresh-token-bytes'.padEnd(64, '0'));
    const MOCK_INITIAL_REFRESH_TOKEN_HEX = initialTokenBuffer.toString('hex');
    const MOCK_NEW_REFRESH_TOKEN_HEX = newTokenBuffer.toString('hex');
    const MOCK_OLD_REFRESH_TOKEN = 'test-refresh-token'; // Raw token from client

    // Mock crypto functions for predictable results
    // Provide deterministic token values based on the call stack (create-initial vs rotate)
    vi.mocked(crypto.randomBytes).mockImplementation((_size: number) => {
      // Check the call stack to determine context
      const stack = new Error().stack || '';
      if (stack.includes('createInitialRefreshToken')) {
        return initialTokenBuffer;
      }
      if (stack.includes('rotateRefreshToken')) {
        return newTokenBuffer;
      }
      // Default fallback – treat as a new token generation
      return newTokenBuffer;
    });

    // Mock hash creation - create fresh mock instance for each call
    vi.mocked(crypto.createHash).mockImplementation(() => {
      const mockUpdate = vi.fn().mockReturnThis();

      // Mapping of known input → deterministic mock hash
      const digestMap: Record<string, string> = {
        [MOCK_INITIAL_REFRESH_TOKEN_HEX]: 'hashed-initial-refresh-token',
        [MOCK_NEW_REFRESH_TOKEN_HEX]: 'hashed-new-refresh-token',
        [MOCK_OLD_REFRESH_TOKEN]: 'hashed-test-refresh-token',
      };

      const mockDigest = vi.fn().mockImplementation((encoding: string) => {
        if (encoding !== 'hex') {
          return Buffer.from('mocked-hash');
        }

        const input = mockUpdate.mock.calls[0]?.[0] as string;
        return digestMap[input] ?? 'unmocked-hashed-token';
      });

      return {
        update: mockUpdate,
        digest: mockDigest,
      } as unknown as crypto.Hash;
    });

    // Clear all mocks
    vi.clearAllMocks();

    // Create TokenManager instance with mocked database service
    tokenManager = new TokenManager(mockDbService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createInitialRefreshToken()', () => {
    it('should create, hash, and store a new refresh token', async () => {
      const userId = 'user-id-123';
      const clientId = 'test-client-id';

      const result = await tokenManager.createInitialRefreshToken(userId, clientId);

      // Verify the raw token is returned (hex-encoded)
      const expectedRawToken = Buffer.from('initial-refresh-token-bytes'.padEnd(64, '0')).toString(
        'hex'
      );
      expect(result).toBe(expectedRawToken);

      // Verify database storage with hashed token
      expect(mockDbService.createRefreshToken).toHaveBeenCalledOnce();
      expect(mockDbService.createRefreshToken).toHaveBeenCalledWith(
        userId,
        clientId,
        'hashed-initial-refresh-token'
      );

      // Verify crypto calls
      expect(crypto.randomBytes).toHaveBeenCalledWith(64);
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should handle database errors gracefully', async () => {
      const userId = 'user-id-123';
      const clientId = 'test-client-id';
      const dbError = new Error('Database connection failed');

      mockDbService.createRefreshToken.mockRejectedValue(dbError);

      await expect(tokenManager.createInitialRefreshToken(userId, clientId)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockDbService.createRefreshToken).toHaveBeenCalledOnce();
    });
  });

  describe('rotateRefreshToken()', () => {
    const oldRefreshToken = 'test-refresh-token';
    const storedToken = {
      id: 'token-id-123',
      userId: 'user-id-123',
      clientId: 'test-client-id',
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    };

    it('should successfully rotate a token and preserve originally granted scopes', async () => {
      const originalScopes = ['read_profile', 'manage_ads'];
      const userOAuthToken = {
        id: 'oauth-token-id',
        userId: 'user-id-123',
        accessToken: 'meta-access-token',
        scopes: originalScopes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock successful validation and retrieval
      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(
        userOAuthToken as unknown as OAuthToken
      );

      const result = await tokenManager.rotateRefreshToken(mockClient, oldRefreshToken);

      // Verify scope preservation in JWT creation
      expect(jwt.createJWT).toHaveBeenCalledWith({
        userId: 'user-id-123',
        clientId: 'test-client-id',
        scopes: originalScopes, // CRITICAL: Must preserve original scopes
      });

      // Verify database rotation
      expect(mockDbService.rotateRefreshToken).toHaveBeenCalledWith(
        'token-id-123',
        'user-id-123',
        'test-client-id',
        'hashed-new-refresh-token'
      );

      // Verify returned tokens
      expect(result.access_token).toBe('new-access-token-jwt');
      expect(result.token_type).toBe('Bearer');
      const expectedNewRefreshToken = Buffer.from(
        'new-refresh-token-bytes'.padEnd(64, '0')
      ).toString('hex');
      expect(result.refresh_token).toBe(expectedNewRefreshToken);
      expect(result.scope).toBe('read_profile manage_ads');
      expect(result.expires_in).toBeGreaterThan(3500);
      expect(result.expires_in).toBeLessThan(3601);
    });

    it('should throw error and revoke token if original OAuth token record is missing', async () => {
      // Mock successful refresh token validation
      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      // Mock missing user OAuth token (security issue)
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(undefined);

      await expect(tokenManager.rotateRefreshToken(mockClient, oldRefreshToken)).rejects.toThrow(
        new TokenError(
          'Token refresh failed: original authorization scope information is missing. Please re-authenticate to continue using the application.'
        )
      );

      // Verify security response: token is revoked
      expect(mockDbService.revokeTokenById).toHaveBeenCalledWith('token-id-123');

      // Verify no token rotation occurred
      expect(mockDbService.rotateRefreshToken).not.toHaveBeenCalled();
      expect(jwt.createJWT).not.toHaveBeenCalled();
    });

    it('should throw error and revoke token if original OAuth token has no scopes', async () => {
      const userOAuthTokenWithoutScopes = {
        id: 'oauth-token-id',
        userId: 'user-id-123',
        accessToken: 'meta-access-token',
        scopes: null, // Security issue: missing scope information
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(
        userOAuthTokenWithoutScopes as unknown as OAuthToken
      );

      await expect(tokenManager.rotateRefreshToken(mockClient, oldRefreshToken)).rejects.toThrow(
        TokenError
      );

      // Verify security response: token is revoked to prevent privilege escalation
      expect(mockDbService.revokeTokenById).toHaveBeenCalledWith('token-id-123');

      // Verify no privilege escalation occurred
      expect(mockDbService.rotateRefreshToken).not.toHaveBeenCalled();
      expect(jwt.createJWT).not.toHaveBeenCalled();
    });

    it('should propagate TokenError for replay attacks and invalid tokens', async () => {
      // Mock database detecting replay attack and throwing error
      const replayError = new TokenError('Invalid refresh token');
      mockDbService.findAndValidateRefreshToken.mockRejectedValue(replayError);

      await expect(tokenManager.rotateRefreshToken(mockClient, oldRefreshToken)).rejects.toThrow(
        'Invalid refresh token'
      );

      // Verify the error is propagated correctly (database handles family revocation)
      expect(mockDbService.getLatestUserOAuthToken).not.toHaveBeenCalled();
      expect(mockDbService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('should handle JWT creation failures gracefully', async () => {
      const originalScopes = ['read_profile'];
      const userOAuthToken = {
        id: 'oauth-token-id',
        userId: 'user-id-123',
        scopes: originalScopes,
      };

      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(
        userOAuthToken as unknown as OAuthToken
      );
      vi.mocked(jwt.createJWT).mockRejectedValue(new Error('JWT signing failed'));

      await expect(tokenManager.rotateRefreshToken(mockClient, oldRefreshToken)).rejects.toThrow(
        'JWT signing failed'
      );

      expect(mockDbService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('should handle database rotation failures gracefully', async () => {
      const originalScopes = ['read_profile'];
      const userOAuthToken = { scopes: originalScopes };

      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(
        userOAuthToken as unknown as OAuthToken
      );
      mockDbService.rotateRefreshToken.mockRejectedValue(new Error('Database rotation failed'));

      await expect(tokenManager.rotateRefreshToken(mockClient, oldRefreshToken)).rejects.toThrow(
        'Database rotation failed'
      );

      expect(jwt.createJWT).toHaveBeenCalled(); // JWT creation should have succeeded
    });
  });

  describe('revokeToken()', () => {
    const testToken = 'test-refresh-token';
    const hashedToken = 'hashed-test-refresh-token';

    it('should revoke a specific refresh token when hint is "refresh_token"', async () => {
      const storedToken = { id: 'token-id-123', userId: 'user-id-123' };
      mockDbService.findRefreshTokenByHash.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );

      await tokenManager.revokeToken(mockClient, testToken, 'refresh_token');

      expect(mockDbService.findRefreshTokenByHash).toHaveBeenCalledWith(
        hashedToken,
        mockClient.client_id
      );
      expect(mockDbService.revokeTokenById).toHaveBeenCalledWith('token-id-123');
    });

    it('should do nothing if the refresh token to revoke does not exist', async () => {
      mockDbService.findRefreshTokenByHash.mockResolvedValue(undefined);

      await tokenManager.revokeToken(mockClient, testToken, 'refresh_token');

      expect(mockDbService.findRefreshTokenByHash).toHaveBeenCalledWith(
        hashedToken,
        mockClient.client_id
      );
      expect(mockDbService.revokeTokenById).not.toHaveBeenCalled();
    });

    it('should revoke all active tokens for user/client when hint is "access_token"', async () => {
      const accessTokenPayload = {
        userId: 'user-id-123',
        clientId: 'test-client-id',
        scopes: ['read_profile'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'test-issuer',
        aud: 'test-audience',
      };
      vi.mocked(jwt.verifyJWT).mockResolvedValue(accessTokenPayload);

      await tokenManager.revokeToken(mockClient, testToken, 'access_token');

      expect(jwt.verifyJWT).toHaveBeenCalledWith(testToken);
      expect(mockDbService.revokeActiveTokensForUser).toHaveBeenCalledWith(
        'user-id-123',
        'test-client-id'
      );
    });

    it('should ignore revocation for an invalid or expired access token', async () => {
      vi.mocked(jwt.verifyJWT).mockRejectedValue(new TokenError('Invalid JWT'));

      // Should not throw an error
      await tokenManager.revokeToken(mockClient, 'invalid-access-token', 'access_token');

      expect(jwt.verifyJWT).toHaveBeenCalledWith('invalid-access-token');
      expect(mockDbService.revokeActiveTokensForUser).not.toHaveBeenCalled();
    });

    it('should do nothing if token_type_hint is missing', async () => {
      await tokenManager.revokeToken(mockClient, testToken);

      expect(mockDbService.findRefreshTokenByHash).not.toHaveBeenCalled();
      expect(mockDbService.revokeTokenById).not.toHaveBeenCalled();
      expect(mockDbService.revokeActiveTokensForUser).not.toHaveBeenCalled();
      expect(jwt.verifyJWT).not.toHaveBeenCalled();
    });

    it('should do nothing if token_type_hint is unsupported', async () => {
      await tokenManager.revokeToken(
        mockClient,
        testToken,
        'unsupported_hint' as unknown as 'refresh_token'
      );

      expect(mockDbService.findRefreshTokenByHash).not.toHaveBeenCalled();
      expect(mockDbService.revokeTokenById).not.toHaveBeenCalled();
      expect(mockDbService.revokeActiveTokensForUser).not.toHaveBeenCalled();
      expect(jwt.verifyJWT).not.toHaveBeenCalled();
    });
  });

  describe('Security and Edge Cases', () => {
    it('should maintain token family revocation security when database operations fail', async () => {
      const storedToken = { id: 'token-id-123', userId: 'user-id-123' };
      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(undefined);
      mockDbService.revokeTokenById.mockRejectedValue(new Error('Database error'));

      await expect(tokenManager.rotateRefreshToken(mockClient, 'test-token')).rejects.toThrow();

      // Even if revocation fails, ensure no token rotation occurs
      expect(mockDbService.rotateRefreshToken).not.toHaveBeenCalled();
      expect(jwt.createJWT).not.toHaveBeenCalled();
    });

    it('should handle concurrent rotation attempts through database layer', async () => {
      // The actual concurrency handling is at the database layer
      // This test ensures TokenManager doesn't interfere with database-level safeguards
      const concurrencyError = new TokenError('Token already used');
      mockDbService.findAndValidateRefreshToken.mockRejectedValue(concurrencyError);

      await expect(tokenManager.rotateRefreshToken(mockClient, 'concurrent-token')).rejects.toThrow(
        'Token already used'
      );

      // Verify proper error propagation without masking database-level security
      expect(mockDbService.getLatestUserOAuthToken).not.toHaveBeenCalled();
    });

    it('should preserve scope ordering and formatting in token rotation', async () => {
      const originalScopes = ['ads_read', 'public_profile', 'email']; // Different order
      const userOAuthToken = { scopes: originalScopes };
      const storedToken = { id: 'token-id-123', userId: 'user-id-123' };

      mockDbService.findAndValidateRefreshToken.mockResolvedValue(
        storedToken as unknown as OAuthRefreshToken
      );
      mockDbService.getLatestUserOAuthToken.mockResolvedValue(
        userOAuthToken as unknown as OAuthToken
      );
      vi.mocked(jwt.verifyJWT).mockResolvedValue({
        userId: 'user-id-123',
        clientId: 'test-client-id',
        scopes: originalScopes,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'test-issuer',
        aud: 'test-audience',
      });

      const result = await tokenManager.rotateRefreshToken(mockClient, 'test-refresh-token');

      expect(result.scope).toBe('ads_read public_profile email');
      expect(jwt.createJWT).toHaveBeenCalledWith({
        userId: 'user-id-123',
        clientId: 'test-client-id',
        scopes: originalScopes, // Exact preservation of original order
      });
    });
  });
});
