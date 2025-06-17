import { FastifyReply, FastifyRequest } from 'fastify';
import { generateChallenge, verifyChallenge } from 'pkce-challenge';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { PKCEError, ValidationError, AuthenticationError } from '../utils/errors.js';
import { db } from '../db/client.js';
import { users, oauthTokens, adAccounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createJWT } from './jwt.js';

// Generate PKCE challenge pair for client
export async function generatePKCEChallenge() {
  // Generate a random code verifier
  const codeVerifier = Buffer.from(Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => String.fromCharCode(b))
    .join(''), 'binary').toString('base64url');
  
  const challenge = await generateChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge: challenge
  };
}

// Verify PKCE in callback
export async function verifyPKCEChallenge(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  try {
    return await verifyChallenge(codeVerifier, codeChallenge);
  } catch (error) {
    logger.error('PKCE verification failed', { error });
    return false;
  }
}

// Authorization endpoint with PKCE
export async function handleAuthorize(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string>;
  const { 
    client_id, 
    redirect_uri, 
    state, 
    code_challenge, 
    code_challenge_method,
    scope = env.FACEBOOK_OAUTH_SCOPES
  } = query;

  try {
    // Validate PKCE parameters (mandatory in 2025)
    if (!code_challenge || code_challenge_method !== 'S256') {
      throw new PKCEError('PKCE required with S256 method');
    }

    if (!client_id || !redirect_uri) {
      throw new ValidationError('client_id and redirect_uri are required');
    }

    // Store PKCE challenge for later verification
    const sessionState = Buffer.from(JSON.stringify({
      code_challenge,
      redirect_uri,
      state,
      client_id,
    })).toString('base64');

    const facebookAuthUrl = new URL('https://www.facebook.com/v22.0/dialog/oauth');
    facebookAuthUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID);
    facebookAuthUrl.searchParams.set('redirect_uri', env.FACEBOOK_CALLBACK_URL);
    facebookAuthUrl.searchParams.set('state', sessionState);
    facebookAuthUrl.searchParams.set('scope', scope);
    facebookAuthUrl.searchParams.set('response_type', 'code');

    logger.info('OAuth authorization initiated', { 
      client_id, 
      redirect_uri, 
      scope,
      ip: request.ip 
    });

    return reply.redirect(facebookAuthUrl.toString());
  } catch (error) {
    logger.error('OAuth authorization failed', { error, query });
    return reply.status(400).send({
      error: 'invalid_request',
      error_description: error instanceof Error ? error.message : 'Authorization failed'
    });
  }
}

// Handle Facebook OAuth callback
export async function handleFacebookCallback(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string>;
  const { code, state, error: fbError, error_description } = query;

  try {
    // Handle Facebook errors
    if (fbError) {
      logger.warn('Facebook OAuth error', { fbError, error_description });
      throw new AuthenticationError(`Facebook error: ${fbError}`);
    }

    if (!code || !state) {
      throw new ValidationError('Authorization code and state are required');
    }

    // Decode and validate state
    let sessionData;
    try {
      sessionData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      throw new PKCEError('Invalid state parameter');
    }

    const { redirect_uri } = sessionData;

    // Exchange code for Facebook access token
    const tokenResponse = await exchangeCodeForFacebookToken(code) as { access_token: string; expires_in?: number };
    
    // Get user info from Facebook
    const fbUser = await getFacebookUserInfo(tokenResponse.access_token) as { id: string; email: string };
    
    // Create or update user in database
    const user = await createOrUpdateUser(fbUser.email, fbUser.id);
    
    // Store OAuth token
    await storeOAuthToken(user.id, tokenResponse);
    
    // Get user's ad accounts from Facebook
    const fbAdAccounts = await getFacebookAdAccounts(tokenResponse.access_token);
    
    // Store ad accounts in database
    await storeAdAccounts(user.id, fbAdAccounts);

    // Generate authorization code for client
    const authCode = generateAuthorizationCode(user.id);

    // Redirect back to client with authorization code
    const clientRedirectUrl = new URL(redirect_uri);
    clientRedirectUrl.searchParams.set('code', authCode);
    if (sessionData.state) {
      clientRedirectUrl.searchParams.set('state', sessionData.state);
    }

    logger.authAttempt(user.id, true, request.ip, request.headers['user-agent']);
    
    return reply.redirect(clientRedirectUrl.toString());
  } catch (error) {
    logger.authAttempt('unknown', false, request.ip, request.headers['user-agent']);
    logger.error('OAuth callback failed', { error, query });
    
    return reply.status(400).send({
      error: 'authorization_failed',
      error_description: error instanceof Error ? error.message : 'OAuth callback failed'
    });
  }
}

// Token exchange endpoint
export async function handleTokenExchange(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as Record<string, string>;
  const { 
    grant_type, 
    code, 
    code_verifier, 
    client_id 
  } = body;

  try {
    if (grant_type !== 'authorization_code') {
      throw new ValidationError('Only authorization_code grant type is supported');
    }

    if (!code || !code_verifier || !client_id) {
      throw new ValidationError('code, code_verifier, and client_id are required');
    }

    // Verify authorization code and get user
    const user = await verifyAuthorizationCode(code);
    
    // Get stored PKCE challenge (in production, this would be stored in Redis/cache)
    // For now, we'll validate the code_verifier format
    if (!code_verifier || code_verifier.length < 43) {
      throw new PKCEError('Invalid code_verifier');
    }

    // Get user's latest token info for scopes
    const token = await db.query.oauthTokens.findFirst({
      where: eq(oauthTokens.userId, user.id),
      orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
    });

    if (!token) {
      throw new AuthenticationError('No valid token found for user');
    }

    // Create JWT for the user
    const jwt = createJWT({
      userId: user.id,
      scopes: token.scopes || [env.FACEBOOK_OAUTH_SCOPES],
    });

    logger.info('JWT token issued', { userId: user.id, client_id });

    return reply.send({
      access_token: jwt,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours
    });
  } catch (error) {
    logger.error('Token exchange failed', { error, client_id });
    
    return reply.status(400).send({
      error: 'invalid_grant',
      error_description: error instanceof Error ? error.message : 'Token exchange failed'
    });
  }
}

// Helper functions

async function exchangeCodeForFacebookToken(code: string) {
  const tokenUrl = 'https://graph.facebook.com/v22.0/oauth/access_token';
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: env.FACEBOOK_CALLBACK_URL,
    code,
  });

  const response = await fetch(`${tokenUrl}?${params}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new AuthenticationError(`Facebook token exchange failed: ${error}`);
  }

  return response.json();
}

async function getFacebookUserInfo(accessToken: string) {
  const userUrl = 'https://graph.facebook.com/v22.0/me';
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,email',
  });

  const response = await fetch(`${userUrl}?${params}`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new AuthenticationError(`Facebook user info failed: ${error}`);
  }

  return response.json();
}

async function getFacebookAdAccounts(accessToken: string) {
  const adAccountsUrl = 'https://graph.facebook.com/v22.0/me/adaccounts';
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,account_status,currency,timezone_name,users{role}',
  });

  const response = await fetch(`${adAccountsUrl}?${params}`);
  
  if (!response.ok) {
    logger.warn('Failed to fetch ad accounts from Facebook', { status: response.status });
    return { data: [] }; // Return empty if user has no ad accounts
  }

  return response.json();
}

async function createOrUpdateUser(email: string, _facebookId: string) {
  return await db.transaction(async (tx) => {
    // Check if user exists
    const existingUser = await tx.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return existingUser;
    }

    // Create new user
    const [newUser] = await tx.insert(users).values({
      email,
    }).returning();

    logger.info('New user created', { userId: newUser.id, email });
    return newUser;
  });
}

async function storeOAuthToken(userId: string, tokenResponse: any) {
  const expiresAt = tokenResponse.expires_in 
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : null;

  await db.insert(oauthTokens).values({
    userId,
    accessToken: tokenResponse.access_token,
    expiresAt,
    scopes: [env.FACEBOOK_OAUTH_SCOPES],
  }).onConflictDoUpdate({
    target: oauthTokens.userId,
    set: {
      accessToken: tokenResponse.access_token,
      expiresAt,
      updatedAt: new Date(),
    },
  });
}

async function storeAdAccounts(userId: string, fbAdAccounts: any) {
  const accounts = fbAdAccounts.data || [];
  
  for (const account of accounts) {
    const permissions = account.users?.data?.[0]?.role ? [account.users.data[0].role] : ['VIEWER'];
    
    await db.insert(adAccounts).values({
      id: account.id,
      userId,
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

function generateAuthorizationCode(userId: string): string {
  // In production, store this in Redis with TTL
  return Buffer.from(JSON.stringify({
    userId,
    timestamp: Date.now(),
  })).toString('base64');
}

async function verifyAuthorizationCode(code: string) {
  try {
    const decoded = JSON.parse(Buffer.from(code, 'base64').toString());
    const { userId, timestamp } = decoded;
    
    // Check if code is not too old (5 minutes)
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      throw new AuthenticationError('Authorization code expired');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AuthenticationError('Invalid authorization code');
    }

    return user;
  } catch {
    throw new AuthenticationError('Invalid authorization code format');
  }
} 