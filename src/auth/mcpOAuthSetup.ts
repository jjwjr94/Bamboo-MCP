import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { db } from '../db/client.js';
import { users, oauthTokens, adAccounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyJWT, createJWT } from './jwt.js';

export function createMCPOAuthProvider(): ProxyOAuthServerProvider {
  const provider = new ProxyOAuthServerProvider({
    endpoints: {
      authorizationUrl: 'https://www.facebook.com/v22.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v22.0/oauth/access_token',
    },
    
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      try {
        // Verify this is our JWT token
        const payload = verifyJWT(token);
        
        // Get user's current Meta OAuth token from database
        const oauthToken = await db.query.oauthTokens.findFirst({
          where: eq(oauthTokens.userId, payload.userId),
          orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
        });

        if (!oauthToken) {
          throw new Error('No OAuth token found for user');
        }

        // Verify Meta token is still valid by making a test API call
        try {
          const metaResponse = await fetch(`https://graph.facebook.com/v22.0/me?access_token=${oauthToken.accessToken}&fields=id`);
          if (!metaResponse.ok) {
            throw new Error('Meta access token is invalid or expired');
          }
        } catch (error) {
          logger.warn('Meta token validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
          throw new Error('Meta access token is invalid or expired');
        }

        return {
          token,
          clientId: 'bamboo-mcp-client',
          scopes: payload.scopes,
          expiresAt: payload.exp,
          extra: { 
            userId: payload.userId,
            metaAccessToken: oauthToken.accessToken 
          }
        };
      } catch (error) {
        logger.error('Token verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw new Error('Invalid access token');
      }
    },

    getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
      // Support the MCP client
      if (clientId === 'bamboo-mcp-client') {
        return {
          client_id: clientId,
          redirect_uris: [env.FACEBOOK_CALLBACK_URL],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none', // Public client
          scope: env.FACEBOOK_OAUTH_SCOPES,
        };
      }
      
      // Also support the Meta app client for proxying
      if (clientId === env.FACEBOOK_APP_ID) {
        return {
          client_id: clientId,
          client_secret: env.FACEBOOK_APP_SECRET,
          redirect_uris: [env.FACEBOOK_CALLBACK_URL],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'client_secret_post',
          scope: env.FACEBOOK_OAUTH_SCOPES,
        };
      }
      
      return undefined;
    }
  });

  // Let the ProxyOAuthServerProvider handle the OAuth flow with Facebook
  // We just need to override the token exchange to add our custom business logic
  const originalExchangeAuthorizationCode = provider.exchangeAuthorizationCode.bind(provider);
  provider.exchangeAuthorizationCode = async (client, authorizationCode, codeVerifier, redirectUri) => {
    // Let the SDK handle the OAuth flow with Facebook
    const tokens = await originalExchangeAuthorizationCode(client, authorizationCode, codeVerifier, redirectUri);
    
    // Now add our custom business logic: user creation, ad account storage, etc.
    try {
      // Get user info from Facebook using the access token
      const userResponse = await fetch(`https://graph.facebook.com/v22.0/me?access_token=${tokens.access_token}&fields=id,email`);
      if (!userResponse.ok) {
        throw new Error('Failed to get user info from Facebook');
      }
      const fbUser = await userResponse.json() as { id: string; email: string };

      // Create or update user in our database
      const user = await db.transaction(async (tx) => {
        const existingUser = await tx.query.users.findFirst({
          where: eq(users.email, fbUser.email),
        });

        if (existingUser) {
          return existingUser;
        }

        const [newUser] = await tx.insert(users).values({
          email: fbUser.email,
        }).returning();

        logger.info('New user created via MCP OAuth', { userId: newUser.id, email: fbUser.email });
        return newUser;
      });

      // Store the OAuth token
      await db.insert(oauthTokens).values({
        userId: user.id,
        accessToken: tokens.access_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        scopes: env.FACEBOOK_OAUTH_SCOPES.split(','),
      }).onConflictDoUpdate({
        target: oauthTokens.userId,
        set: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          updatedAt: new Date(),
        },
      });

      // Get and store ad accounts
      const adAccountsResponse = await fetch(`https://graph.facebook.com/v22.0/me/adaccounts?access_token=${tokens.access_token}&fields=id,name,account_status,currency,timezone_name,users{role}`);
      if (adAccountsResponse.ok) {
        const fbAdAccounts = await adAccountsResponse.json() as { data?: any[] };
        const accounts = fbAdAccounts.data || [];
        
        for (const account of accounts) {
          const permissions = account.users?.data?.[0]?.role ? [account.users.data[0].role] : ['VIEWER'];
          
          await db.insert(adAccounts).values({
            id: account.id,
            userId: user.id,
            name: account.name,
            status: account.account_status,
            currency: account.currency,
            timezone: account.timezone_name,
            permissions,
          }).onConflictDoUpdate({
            target: adAccounts.id,
            set: {
              name: account.name,
              status: account.account_status,
              currency: account.currency,
              timezone: account.timezone_name,
              permissions,
            },
          });
        }
      }

      // Create our internal JWT instead of returning the Facebook token
      const jwt = createJWT({
        userId: user.id,
        scopes: env.FACEBOOK_OAUTH_SCOPES.split(','),
      });

      // Return our JWT instead of the Facebook token
      return {
        access_token: jwt,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        scope: env.FACEBOOK_OAUTH_SCOPES,
      };
    } catch (error) {
      logger.error('Failed to process Facebook OAuth callback', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  return provider;
}

export function createMCPAuthRouter() {
  const provider = createMCPOAuthProvider();
  
  return mcpAuthRouter({
    provider,
    issuerUrl: new URL(env.BASE_URL),
    baseUrl: new URL(env.BASE_URL),
    serviceDocumentationUrl: new URL('https://docs.meta.com/'),
    scopesSupported: env.FACEBOOK_OAUTH_SCOPES.split(','),
    resourceName: 'Bamboo MCP Server',
  });
} 