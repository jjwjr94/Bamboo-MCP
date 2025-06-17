import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { and, eq, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { db } from './client.js';
import { oauthClients, oauthRefreshTokens, oauthTokens, users } from './schema.js';

// Type for the full refresh token record from the DB
type FullRefreshToken = typeof oauthRefreshTokens.$inferSelect;

// Type for user record from the DB
type User = typeof users.$inferSelect;

// Type for OAuth token record from the DB
type OAuthToken = typeof oauthTokens.$inferSelect;

/**
 * Service for handling all database operations related to the OAuth flow.
 *
 * This service encapsulates all Drizzle ORM queries for managing users,
 * OAuth clients, and tokens, providing a clean data access layer for
 * the authentication provider.
 */
export class OAuthDatabaseService {
  private static instance: OAuthDatabaseService;

  private constructor() {
    logger.info('OAuthDatabaseService initialized');
  }

  public static getInstance(): OAuthDatabaseService {
    if (!OAuthDatabaseService.instance) {
      OAuthDatabaseService.instance = new OAuthDatabaseService();
      logger.info('Created OAuthDatabaseService singleton instance');
    }
    return OAuthDatabaseService.instance;
  }

  // Client Management
  public async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    logger.debug('Getting OAuth client from database', { clientId });

    const client = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, clientId),
    });

    if (!client || !client.isActive) {
      logger.debug('Client not found or inactive', { clientId });
      return undefined;
    }

    return {
      client_id: client.clientId,
      client_secret: client.clientSecret || undefined,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method:
        client.tokenEndpointAuthMethod as OAuthClientInformationFull['token_endpoint_auth_method'],
      scope: client.allowedScopes.join(' '),
      client_id_issued_at: client.createdAt
        ? Math.floor(client.createdAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    };
  }

  public async registerClient(
    client: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    logger.info('Registering MCP client in database', { clientId: client.client_id });

    type ClientWithName = OAuthClientInformationFull & { client_name?: string };
    const clientName = (client as ClientWithName).client_name ?? 'Unnamed MCP Client';

    await db.insert(oauthClients).values({
      clientId: client.client_id,
      clientSecret: client.client_secret || null,
      clientName,
      redirectUris: client.redirect_uris,
      allowedScopes: client.scope?.split(' ') || [],
      grantTypes: client.grant_types || ['authorization_code'],
      responseTypes: client.response_types || ['code'],
      tokenEndpointAuthMethod: client.token_endpoint_auth_method || 'none',
      isActive: true,
    });

    logger.info('Successfully registered MCP client in database', {
      clientId: client.client_id,
      clientName,
    });
    return client;
  }

  // User and Token Management
  public async findOrCreateUser(email: string): Promise<User> {
    return db.transaction(async (tx) => {
      const existingUser = await tx.query.users.findFirst({ where: eq(users.email, email) });
      if (existingUser) {
        return existingUser;
      }

      const [newUser] = await tx.insert(users).values({ email }).returning();
      logger.info('New user created via OAuth', { userId: newUser.id, email: newUser.email });
      return newUser;
    });
  }

  public async storeMetaToken(
    userId: string,
    accessToken: string,
    scopes: string[],
    expiresIn?: number
  ): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await db
      .insert(oauthTokens)
      .values({
        userId,
        accessToken,
        expiresAt,
        scopes,
      })
      .onConflictDoUpdate({
        target: oauthTokens.userId,
        set: {
          accessToken,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  }

  public async getLatestUserOAuthToken(userId: string): Promise<OAuthToken | undefined> {
    return db.query.oauthTokens.findFirst({
      where: eq(oauthTokens.userId, userId),
      orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
    });
  }

  public async createRefreshToken(
    userId: string,
    clientId: string,
    hashedToken: string
  ): Promise<void> {
    await db.insert(oauthRefreshTokens).values({
      token: hashedToken,
      userId,
      clientId,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90-day expiry
    });
  }

  public async findAndValidateRefreshToken(
    hashedRefreshToken: string,
    clientId: string
  ): Promise<FullRefreshToken> {
    const storedToken = await db.query.oauthRefreshTokens.findFirst({
      where: and(
        eq(oauthRefreshTokens.token, hashedRefreshToken),
        eq(oauthRefreshTokens.clientId, clientId)
      ),
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        // Potential breach: an invalid token was used. Revoke the entire family.
        await this.revokeTokenFamily(storedToken.userId, clientId);
      }
      throw new Error('Invalid refresh token');
    }
    return storedToken;
  }

  public async findRefreshTokenByHash(
    hashedToken: string,
    clientId: string
  ): Promise<FullRefreshToken | undefined> {
    return db.query.oauthRefreshTokens.findFirst({
      where: and(
        eq(oauthRefreshTokens.token, hashedToken),
        eq(oauthRefreshTokens.clientId, clientId)
      ),
    });
  }

  public async rotateRefreshToken(
    oldTokenId: string,
    userId: string,
    clientId: string,
    newHashedToken: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Invalidate the used refresh token
      await tx
        .update(oauthRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(oauthRefreshTokens.id, oldTokenId));

      // 2. Store the new refresh token
      await tx.insert(oauthRefreshTokens).values({
        token: newHashedToken,
        userId: userId,
        clientId: clientId,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    });
  }

  // Token Revocation
  public async revokeTokenById(tokenId: string): Promise<void> {
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthRefreshTokens.id, tokenId));
  }

  public async revokeActiveTokensForUser(userId: string, clientId: string): Promise<void> {
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthRefreshTokens.userId, userId),
          eq(oauthRefreshTokens.clientId, clientId),
          isNull(oauthRefreshTokens.revokedAt)
        )
      );
  }

  private async revokeTokenFamily(userId: string, clientId: string): Promise<void> {
    logger.warn('Invalid or expired refresh token used, revoking token family', {
      clientId,
      userId,
    });
    await this.revokeActiveTokensForUser(userId, clientId);
    logger.warn('All active refresh tokens revoked for user/client due to breach detection', {
      userId,
      clientId,
    });
  }
}
