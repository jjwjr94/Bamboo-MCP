# Security Guide

## Standards Compliance

OAuth 2.1 compliant with current security best practices.

## OAuth 2.0 Security

### PKCE Implementation (Required)
- **Code Challenge**: SHA256 hash of random code_verifier
- **Challenge Method**: S256 only (plain text not supported)
- **Entropy**: 43+ characters, cryptographically random
- **Validation**: Server-side code_verifier verification

```typescript
// PKCE Generation
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

### Authorization Flow
- **Redirect URI**: Exact match validation
- **State Parameter**: CSRF protection with secure random values
- **Response Type**: Authorization code flow only
- **Scope**: Least privilege principle

### Token Security
- **JWT Algorithm**: HS256 for internal access tokens (TODO: upgrade to RS256/ES256 for production)
- **Token Lifetime**: Configurable via `JWT_EXPIRES_IN`, defaults to 24 hours
- **Refresh Tokens**: Stored as SHA-256 hashes, automatic rotation on use
- **Breach Detection**: Token family revocation on invalid token replay
- **Token Revocation**: Immediate invalidation support

## JWT Security

### Configuration
```typescript
const jwtConfig = {
  algorithm: 'HS256' as const,
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  issuer: process.env.BASE_URL,
  audience: 'bamboo-mcp-client'
};
```

### Refresh Token Security

Token rotation with breach detection:

```typescript
// Generation and storage
const generateRefreshToken = () => {
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  
  // Store hash only
  await db.insert(oauthRefreshTokens).values({
    token: hashedToken,
    userId: user.id,
    clientId: client.client_id,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  });
  
  return refreshToken;
};

// Rotation with breach detection
const exchangeRefreshToken = async (refreshToken: string, clientId: string) => {
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  
  const storedToken = await db.query.oauthRefreshTokens.findFirst({
    where: and(
      eq(oauthRefreshTokens.token, hashedToken),
      eq(oauthRefreshTokens.clientId, clientId)
    ),
  });

  // Breach detection
  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    if (storedToken) {
      await revokeTokenFamily(storedToken.userId, clientId);
    }
    throw new Error('Invalid refresh token');
  }

  // Atomic rotation
  return await db.transaction(async (tx) => {
    await tx.update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthRefreshTokens.id, storedToken.id));
    
    const newAccessToken = createJWT({...});
    const newRefreshToken = generateRefreshToken();
    
    return { access_token: newAccessToken, refresh_token: newRefreshToken };
  });
};
```

**Security Features:**
- Hashed token storage (SHA-256)
- Automatic rotation on each use
- Breach detection triggers family revocation
- Atomic database operations
- Short-lived access tokens

### JWT Payload
```json
{
  "iss": "https://yourdomain.com",
  "aud": "bamboo-mcp-client",
  "sub": "user-uuid",
  "userId": "user-uuid",
  "adAccountId": "act_123456789",
  "scopes": ["ads_management"],
  "iat": 1640995200,
  "exp": 1641081600,
  "jti": "unique-token-id"
}
```

## Response Sanitization

Automatic removal of sensitive data from API responses.

### Implementation
All tool responses use `createMcpSuccessResult` which calls `removeUnderscoreProperties` to:
- Remove properties starting with underscore
- Strip internal Facebook SDK data
- Remove `_api` objects containing access tokens
- Prevent circular reference issues

```typescript
export function createMcpSuccessResult<T>(data: T): CallToolResult {
  const sanitizedData = removeUnderscoreProperties(data);
  
  return {
    content: [{ type: 'text', text: JSON.stringify(sanitizedData, null, 2) }],
    structuredContent: sanitizedData,
    isError: false,
  };
}
```

**Features:**
- Type-safe with `Sanitized<T>` mapped type
- Depth protection against DoS attacks
- Zero configuration required
- Performance optimized

## Database Security (RLS)

Row Level Security with Drizzle ORM:

```typescript
// Native Drizzle RLS policies
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

export const appUser = pgRole('app_user');

// User isolation
pgPolicy('users_select_own', {
  for: 'select',
  to: appUser,
  using: sql`${table.id} = current_setting('app.current_user_id')::uuid`,
}),

// Token protection
pgPolicy('tokens_select_own', {
  for: 'select', 
  to: appUser,
  using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
}),
```

**Session Context:**
```typescript
export const withUserContext = async <T>(
  userId: string,
  operation: (tx: DbTransaction) => Promise<T>
): Promise<T> => {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return await operation(tx);
  });
};
```

**Benefits:**
- Type-safe policies
- Standard PostgreSQL compatibility
- Session-based isolation
- Migration versioning
- No additional dependencies

### Connection Security
- SSL/TLS enforced
- Connection pooling limits
- SQL injection prevention via Drizzle ORM
- Separate service keys

## Input Validation

Zod schemas for all inputs:

```typescript
// Example from CampaignToolRegistry.ts
const inputSchema = {
  adAccountId: z.string().optional().describe("Ad account ID (e.g., 'act_12345')"),
  name: z.string().describe('Campaign name'),
  objective: z.enum([
    'OUTCOME_TRAFFIC',
    'OUTCOME_ENGAGEMENT', 
    'OUTCOME_LEADS',
    'OUTCOME_SALES',
    'OUTCOME_APP_PROMOTION',
    'OUTCOME_AWARENESS',
  ]).describe('Campaign objective'),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
  dailyBudget: z.number().int().positive().optional().describe('Daily budget in cents'),
};
```

## API Security

### Request Authentication
```typescript
const authenticateRequest = async (req: Request) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Authorization header required');
  }
  
  const token = authHeader.slice(7);
  const payload = verifyJWT(token);
  
  // Check revocation
  const tokenRecord = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.userId, payload.userId)
  });
  
  if (!tokenRecord || tokenRecord.revokedAt) {
    throw new Error('Token revoked or invalid');
  }
  
  return payload;
};
```

## Transport Security

### HTTPS Enforcement
```typescript
// Redirect to HTTPS
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

### CORS Configuration
```typescript
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

## Secret Management

### Environment Validation
```typescript
const envSchema = z.object({
  JWT_SECRET: z.string()
    .min(32, 'JWT secret must be at least 32 characters')
    .regex(/^[A-Za-z0-9+/=]+$/, 'Invalid JWT secret format'),
  FACEBOOK_APP_SECRET: z.string()
    .min(32, 'Facebook app secret required'),
  DATABASE_URL: z.string()
    .url('Invalid database URL format')
});
```

### Key Rotation Schedule
- JWT Keys: 90 days
- Facebook App Secret: 180 days
- Database Credentials: 60 days
- API Keys: On compromise

## Monitoring

### Security Logging
```typescript
const securityLogger = {
  authAttempt: (userId: string, success: boolean, ip: string) => {
    logger.info('AUTH_ATTEMPT', {
      userId, success, ip,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent']
    });
  },
  
  tokenUsage: (userId: string, tool: string, success: boolean) => {
    logger.info('TOKEN_USAGE', { userId, tool, success, timestamp: new Date().toISOString() });
  },
  
  suspiciousActivity: (event: string, details: any) => {
    logger.warn('SUSPICIOUS_ACTIVITY', { event, details, timestamp: new Date().toISOString() });
  }
};
```

### Alert Triggers
- Failed auth attempts (>5/minute)
- Unusual token usage patterns
- Database connection failures
- Invalid JWT signatures

## Data Protection

### Encryption
- **At Rest**: AES-256 (Supabase)
- **In Transit**: TLS 1.3 minimum
- **Backups**: Separate key encryption

### Data Retention
```typescript
// Cleanup expired tokens
const cleanupExpiredTokens = async () => {
  await db.delete(oauthTokens)
    .where(lt(oauthTokens.expiresAt, new Date()));
};
``` 