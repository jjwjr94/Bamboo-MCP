# Security & Compliance Guide

## Security Standards Compliance

Bamboo MCP implements comprehensive security measures following current industry standards and best practices.

## OAuth 2.0 Security (OAuth 2.1 Compliant)

### PKCE Implementation (Mandatory)
- **Code Challenge**: SHA256 hashing of random code_verifier
- **Challenge Method**: S256 (SHA256) only - plain text deprecated
- **Entropy Requirements**: Minimum 43 characters, cryptographically random
- **Validation**: Server-side verification of code_verifier against stored challenge

```typescript
// PKCE Generation Example
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

### Authorization Flow Security
- **Redirect URI Validation**: Exact match against pre-registered URIs
- **State Parameter**: CSRF protection with cryptographically secure random values
- **Response Type**: Authorization code flow only (implicit flow deprecated)
- **Scope Limitation**: Principle of least privilege

### Token Security
- **JWT Algorithm**: RS256/ES256 only (HS256 deprecated for production)
- **Token Lifetime**: 24 hours maximum, configurable via JWT_EXPIRES_IN
- **Refresh Tokens**: Secure storage with rotation on use
- **Token Revocation**: Immediate invalidation capability

## JWT Security Implementation

### Signing and Verification
```typescript
// JWT Configuration
const jwtConfig = {
  algorithm: 'RS256', // or ES256
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  issuer: process.env.BASE_URL,
  audience: 'bamboo-mcp-client'
};

// Token Validation
const verifyJWT = (token: string) => {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256', 'ES256'],
    issuer: process.env.BASE_URL,
    audience: 'bamboo-mcp-client'
  });
};
```

### JWT Payload Structure
```json
{
  "iss": "https://yourdomain.com",
  "aud": "bamboo-mcp-client",
  "sub": "user-uuid",
  "userId": "user-uuid",
  "adAccountId": "act_123456789",
  "scopes": ["ads_management", "business_management"],
  "iat": 1640995200,
  "exp": 1641081600,
  "jti": "unique-token-id"
}
```

## Database Security (RLS Implementation)

### Row Level Security Policies
Implemented using Drizzle ORM's native RLS support with standard PostgreSQL:

```typescript
// Native Drizzle RLS policies with type safety
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

// Define application role
export const appUser = pgRole('app_user');

// User data isolation - users can only access their own data
pgPolicy('users_select_own', {
  for: 'select',
  to: appUser,
  using: sql`${table.id} = current_setting('app.current_user_id')::uuid`,
}),

// OAuth token protection - users can only access their own tokens
pgPolicy('tokens_select_own', {
  for: 'select', 
  to: appUser,
  using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
}),

// Ad account access control - users can only access their own accounts
pgPolicy('ad_accounts_select_own', {
  for: 'select',
  to: appUser, 
  using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
}),
```

**Session Context Management:**
```typescript
// Set user context per connection
export const createUserScopedDb = (userId: string) => {
  const userClient = postgres(env.DATABASE_URL, {
    onconnect: async (connection) => {
      await connection.query(`SET app.current_user_id = '${userId}'`);
    },
  });
  return drizzle(userClient);
};
```

**Key Security Benefits:**
- Type-safe policies: Compile-time validation of policy logic
- Automatic RLS enabling: No manual SQL commands required
- Standard PostgreSQL: Works with any PostgreSQL database
- Session-based isolation: Uses PostgreSQL session variables
- Migration versioning: Policies tracked with schema changes
- Multi-operation support: Separate policies for SELECT, INSERT, UPDATE, DELETE
- Simplified setup: No additional client libraries required

### Database Connection Security
- **SSL/TLS**: Enforced for all database connections
- **Connection Pooling**: Limited to prevent resource exhaustion
- **Prepared Statements**: SQL injection prevention via Drizzle ORM
- **Service Keys**: Separate keys for different access levels

## Input Validation & Sanitization

### Zod Schema Validation
All inputs validated using Zod schemas with strict type checking:

```typescript
const CreateCampaignSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid characters'),
  objective: z.enum([
    'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS'
  ]),
  dailyBudget: z.number()
    .min(100, 'Minimum budget $1.00')
    .max(100000000, 'Maximum budget $1M'),
  adAccountId: z.string()
    .regex(/^act_\d+$/, 'Invalid ad account format')
});
```

### File Upload Security
```typescript
const UploadAssetSchema = z.object({
  filename: z.string()
    .regex(/^[a-zA-Z0-9\-_.]+\.(jpg|jpeg|png|mp4|mov)$/i),
  data: z.string()
    .refine(data => {
      try {
        const buffer = Buffer.from(data, 'base64');
        return buffer.length <= 50 * 1024 * 1024; // 50MB limit
      } catch {
        return false;
      }
    }),
  type: z.enum(['image', 'video'])
});
```

## API Security

### Rate Limiting
```typescript
// Express rate limiting middleware
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
});

// Tool-specific limits
const toolLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // requests per minute per user
  keyGenerator: (req) => req.user?.id || req.ip,
});
```

### Request Authentication
```typescript
const authenticateRequest = async (req: Request) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Authorization header required');
  }
  
  const token = authHeader.slice(7);
  const payload = verifyJWT(token);
  
  // Validate token hasn't been revoked
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
// Redirect HTTP to HTTPS
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

app.use(cors(corsOptions));
```

## Secret Management

### Environment Variables
```typescript
// Environment validation with security requirements
const envSchema = z.object({
  JWT_SECRET: z.string()
    .min(32, 'JWT secret must be at least 32 characters')
    .regex(/^[A-Za-z0-9+/=]+$/, 'Invalid JWT secret format'),
  FACEBOOK_APP_SECRET: z.string()
    .min(32, 'Facebook app secret required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string()
    .startsWith('eyJ', 'Invalid Supabase service key format')
});
```

### Key Rotation
- **JWT Keys**: Rotate every 90 days
- **Facebook App Secret**: Rotate every 180 days
- **Database Credentials**: Rotate every 60 days
- **API Keys**: Monitor usage and rotate on compromise

## Audit & Monitoring

### Security Logging
```typescript
const securityLogger = {
  authAttempt: (userId: string, success: boolean, ip: string) => {
    logger.info('AUTH_ATTEMPT', {
      userId,
      success,
      ip,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent']
    });
  },
  
  tokenUsage: (userId: string, tool: string, success: boolean) => {
    logger.info('TOKEN_USAGE', {
      userId,
      tool,
      success,
      timestamp: new Date().toISOString()
    });
  },
  
  suspiciousActivity: (event: string, details: any) => {
    logger.warn('SUSPICIOUS_ACTIVITY', {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }
};
```

### Monitoring Alerts
- Failed authentication attempts (>5 per minute)
- Unusual token usage patterns
- Database connection failures
- API rate limit violations
- Invalid JWT signatures

## Data Protection

### Encryption at Rest
- **Database**: Supabase provides AES-256 encryption
- **File Storage**: Encrypted with customer-managed keys
- **Backups**: Encrypted with separate keys

### Encryption in Transit
- **API Calls**: TLS 1.3 minimum
- **Database**: SSL connections required
- **Third-party APIs**: HTTPS only

### Data Retention
```typescript
// Automated cleanup policies
const cleanupExpiredTokens = async () => {
  await db.delete(oauthTokens)
    .where(lt(oauthTokens.expiresAt, new Date()));
};

const cleanupOldLogs = async () => {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
  
  // Clean up old audit logs to maintain performance
  await db.delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff));
};
```

## Compliance Requirements

### GDPR Compliance
- **Data Minimization**: Collect only necessary data
- **Right to Delete**: User data deletion on request
- **Data Portability**: Export functionality for user data
- **Consent Management**: Clear consent for data processing

### SOC 2 Type II
- **Access Controls**: Role-based access with MFA
- **Change Management**: Controlled deployment processes
- **Monitoring**: Comprehensive logging and alerting
- **Incident Response**: Documented procedures

### PCI DSS (if handling payments)
- **Network Security**: Firewall and network segmentation
- **Access Control**: Unique user IDs and strong authentication
- **Data Protection**: Encryption of cardholder data
- **Monitoring**: Real-time monitoring of network resources

## Incident Response

### Security Incident Classification
1. **Low**: Minor security events (failed login attempts)
2. **Medium**: Potential security issues (unusual API usage)
3. **High**: Confirmed security breaches (data exposure)
4. **Critical**: Active attacks or major data breaches

### Response Procedures
```typescript
const incidentResponse = {
  detect: (event: SecurityEvent) => {
    // Automated detection and alerting
    if (event.severity >= 'HIGH') {
      alertSecurityTeam(event);
      temporaryLockdown(event.affectedResources);
    }
  },
  
  contain: (incident: SecurityIncident) => {
    // Immediate containment measures
    revokeCompromisedTokens(incident.affectedTokens);
    blockSuspiciousIPs(incident.sourceIPs);
    isolateAffectedAccounts(incident.userIds);
  },
  
  recover: (incident: SecurityIncident) => {
    // Recovery and restoration
    generateNewTokens(incident.affectedUsers);
    restoreFromCleanBackup(incident.affectedData);
    updateSecurityPolicies(incident.lessons);
  }
};
```

## Security Testing

### Automated Security Scanning
- **Dependency Scanning**: Regular vulnerability scans
- **SAST**: Static Application Security Testing
- **DAST**: Dynamic Application Security Testing
- **Container Scanning**: Docker image vulnerability assessment

### Penetration Testing
- **Quarterly**: External penetration testing
- **Continuous**: Automated security testing in CI/CD
- **Annual**: Comprehensive security audit

## Security Checklist

### Pre-Deployment
- [ ] All environment variables properly configured
- [ ] JWT secrets are cryptographically secure (32+ chars)
- [ ] RLS policies tested and verified
- [ ] Rate limiting configured and tested
- [ ] HTTPS enforced with proper certificates
- [ ] CORS policies restrict to known origins
- [ ] Input validation schemas comprehensive
- [ ] Error handling doesn't leak sensitive information

### Post-Deployment
- [ ] Security monitoring active
- [ ] Log aggregation and alerting configured
- [ ] Backup and recovery procedures tested
- [ ] Incident response plan documented
- [ ] Security training completed for team
- [ ] Compliance requirements verified
- [ ] Regular security assessments scheduled 