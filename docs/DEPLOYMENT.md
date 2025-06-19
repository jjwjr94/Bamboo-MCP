# Deployment Guide

## Production Setup

### Render.com Deployment

#### Repository Setup
1. Push code to GitHub
2. Connect to Render.com
3. Select Web Service

#### Build Configuration
- **Environment**: Node
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Node Version**: 18+ (package.json engines)
- **Runtime**: Node.js with ES modules
- **Host Binding**: Fastify binds to `0.0.0.0` (required for Render)
- **Note**: `pnpm prebuild` generates Zod schemas from Meta SDK before TypeScript compilation

#### Environment Variables
```env
NODE_ENV=production
PORT=3000

# Database (Drizzle ORM)
# Use Transaction pooler (port 6543) for serverless deployment
DATABASE_URL=postgres://postgres.[project_ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
DB_STATEMENT_TIMEOUT=10000

# Facebook OAuth
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
FACEBOOK_CALLBACK_URL=https://yourdomain.com/auth/facebook/callback
FACEBOOK_OAUTH_SCOPES=ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read

# JWT
JWT_SECRET=your-super-secure-secret-at-least-32-characters
JWT_EXPIRES_IN=24h

# Server
BASE_URL=https://yourdomain.com
MCP_REQUEST_TIMEOUT=30000
META_API_TIMEOUT=15000

# Resilience Policy
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=30000
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY=1000
RETRY_MAX_DELAY=10000
```

#### Health Check
- **Path**: `/health`
- **Grace Period**: 300 seconds

### Supabase Database Setup

#### Create Project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create new project
3. Get connection details (Transaction pooler for `DATABASE_URL`)

#### Database Migration
Managed by Drizzle ORM with native PostgreSQL integration.

**Automatic Migration (Recommended)**
```bash
pnpm db:generate
pnpm db:migrate
```

**Manual Verification (Optional)**
```sql
-- Tables created by Drizzle migrations:
-- - users
-- - ad_accounts
-- - oauth_clients
-- - oauth_refresh_tokens
-- - oauth_tokens
-- - oauth_sessions
-- - oauth_temp_auth_codes

-- Verify RLS enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'oauth_tokens', 'ad_accounts');

-- View policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('users', 'oauth_tokens', 'ad_accounts');
```

**Standard PostgreSQL RLS Benefits:**
- Type-safe policies defined in TypeScript
- No manual ALTER TABLE commands
- Works with any PostgreSQL database
- Session-based isolation
- Migration versioning
- No additional libraries required

### Facebook App Configuration

#### Create App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create new app for Business
3. Add Facebook Login product

#### OAuth Settings
- **Valid OAuth Redirect URIs**: `https://yourdomain.com/auth/facebook/callback`
- **App Domains**: `yourdomain.com`

**Required Permissions:**
```
ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read
```

**Core Advertising:**
- `ads_management`: Manage ad accounts, campaigns, ad sets, ads
- `ads_read`: Access Ads Insights API and server-side events
- `business_management`: Manage Business Manager assets and users

**Page Management:**
- `pages_manage_ads`: Manage ads associated with Pages
- `pages_show_list`: Retrieve list of managed Pages
- `pages_read_engagement`: Read Page content and engagement
- `pages_manage_posts`: Create and manage Page posts
- `pages_manage_metadata`: Access Page settings and metadata
- `pages_manage_cta`: Manage call-to-action buttons
- `pages_messaging`: Send and receive Page messages

**Analytics:**
- `attribution_read`: Access Attribution API for reporting

#### App Review Process
Submit for production permissions:

**Required Documentation:**
- Use case for each permission
- Privacy policy
- Terms of service
- Video demonstration
- Business verification

**Justification Examples:**
- `ads_management`: "AI assistant for campaign optimization"
- `pages_manage_posts`: "Integrated social media content creation"
- `pages_messaging`: "Customer service automation"
- `attribution_read`: "Performance analytics and reporting"

## Local Development

### Prerequisites
- Node.js 18+
- PNPM
- Supabase CLI (optional)

### Installation
```bash
git clone <your-repo-url>
cd bamboo-mcp
pnpm install
cp .env.example .env
# Edit .env
```

### Environment Configuration
```env
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://postgres.[project_ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Facebook (development app)
FACEBOOK_APP_ID=your-dev-app-id
FACEBOOK_APP_SECRET=your-dev-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback
FACEBOOK_OAUTH_SCOPES=ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read

# JWT
JWT_SECRET=your-development-secret-key-32-chars-min
JWT_EXPIRES_IN=24h

# Server
BASE_URL=http://localhost:3000
```

### Development Commands
```bash
pnpm dev              # Start development server
pnpm checks           # Run lint, format, TypeScript check
pnpm test             # Run tests
pnpm db:generate      # Generate database migrations
pnpm db:migrate       # Run migrations
pnpm mcp:inspect:http # MCP Inspector
```

### Database Setup
```bash
# Auto-migration
pnpm db:generate
pnpm db:migrate

# Manual setup (if needed)
# Create tables and RLS policies via Drizzle schema
# See src/db/schema.ts for complete schema
```

### MCP Testing
```bash
# Start server
pnpm dev

# Complete OAuth flow (create test user)
# Visit: http://localhost:3000/authorize?client_id=test&redirect_uri=http://localhost:3000&code_challenge=test&code_challenge_method=S256

# Run MCP Inspector
pnpm mcp:inspect:http
```

## Production Monitoring

### Health Check
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "mcp": "ready"
}
```

### Logs
- Structured JSON logging
- Authentication events
- API errors
- Performance metrics

### Alerts
- Health check failures
- Database connection issues
- API rate limits
- Security events

## Troubleshooting

### Common Issues
- **OAuth failures**: Check callback URLs and PKCE
- **Database errors**: Verify RLS policies and user context
- **API rate limits**: Implement backoff, monitor usage
- **Token issues**: Validate JWT format and expiration

### Debugging
1. Check logs for detailed error information
2. Verify environment variables
3. Test OAuth flow manually
4. Validate database connection
5. Check MCP Inspector output

### Performance Optimization
- Use connection pooling (transaction pooler)
- Enable query caching where appropriate
- Monitor API response times
- Set appropriate timeouts 