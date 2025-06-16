# Deployment Guide

## Production Environment Setup

### Render.com Deployment

#### Step 1: Repository Setup
1. Push your code to GitHub repository
2. Connect repository to Render.com
3. Select **Web Service** deployment type

#### Step 2: Build Configuration
- **Environment**: Node
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Node Version**: 18+ (specified in package.json engines)
- **Runtime**: Node.js with ES modules support
- **Host Binding**: Fastify configured to bind to `0.0.0.0` in production (required for Render)

#### Step 3: Environment Variables
Add the following environment variables in Render dashboard:

**Important**: We use both `DATABASE_URL` and Supabase client variables because:
- `DATABASE_URL`: Direct PostgreSQL connection for Drizzle ORM (database operations)
- `SUPABASE_URL/KEYS`: Supabase client API for auth, storage, and RLS features

```env
NODE_ENV=production
PORT=3000

# Database Configuration (Drizzle ORM)
# Use Transaction pooler (port 6543) for serverless/Render deployment
DATABASE_URL=postgres://postgres.[project_ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Alternative connection strings:
# Direct connection (IPv6 only): postgresql://postgres:[password]@db.[project_ref].supabase.co:5432/postgres
# Session pooler (IPv4): postgres://postgres.[project_ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Supabase Configuration (Auth & API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Facebook OAuth Configuration
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
FACEBOOK_CALLBACK_URL=https://yourdomain.com/auth/facebook/callback
FACEBOOK_OAUTH_SCOPES=ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read

# JWT Configuration
JWT_SECRET=your-super-secure-secret-at-least-32-characters
JWT_EXPIRES_IN=24h

# Server Configuration
BASE_URL=https://yourdomain.com
```

#### Step 4: Health Check Configuration
- **Health Check Path**: `/health`
- **Health Check Grace Period**: 300 seconds

### Supabase Database Setup

#### Step 1: Create Supabase Project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create new project
3. Get connection details:
   - **Settings → Database → Connection string**: Copy **Transaction** pooler for `DATABASE_URL`
   - **Settings → API**: Copy `SUPABASE_URL` and API keys

#### Step 2: Database Schema Migration
Database schema and RLS policies are managed by Drizzle ORM with native Supabase integration.

**Option A: Automatic Migration (Recommended)**
```bash
# Generate and run migrations
pnpm db:generate
pnpm db:migrate
```

**Option B: Manual Verification (Optional)**
If you want to verify the schema manually, the following tables and policies will be created:

```sql
-- Tables created by Drizzle migrations:
-- - users (with native RLS policies)
-- - oauth_tokens (with user isolation policies)  
-- - ad_accounts (with user isolation policies)

-- Verify RLS is enabled:
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'oauth_tokens', 'ad_accounts');

-- View created policies:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('users', 'oauth_tokens', 'ad_accounts');
```

**Key Benefits of Standard PostgreSQL RLS:**
- Type-safe policies: Policies defined alongside schema in TypeScript
- Automatic RLS enabling: No manual `ALTER TABLE` commands needed
- Standard PostgreSQL: Works with any PostgreSQL database (Supabase, AWS RDS, etc.)
- Session-based isolation: Uses PostgreSQL session variables for user context
- Migration management: Policies versioned with schema changes
- Simplified setup: No additional client libraries or API keys required

### Facebook App Configuration

#### Step 1: Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create new app for "Business"
3. Add "Facebook Login" product

#### Step 2: Configure OAuth Settings
- **Valid OAuth Redirect URIs**: `https://yourdomain.com/auth/facebook/callback`
- **App Domains**: `yourdomain.com`

**Required Permissions (Comprehensive Meta API Access):**
```
ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read
```

**Core Advertising Permissions:**
- `ads_management`: Manage ad accounts, campaigns, ad sets, and ads
- `ads_read`: Access Ads Insights API and server-side events
- `business_management`: Manage Business Manager assets and users

**Page Management Permissions:**
- `pages_manage_ads`: Manage ads associated with Pages
- `pages_show_list`: Retrieve list of managed Pages
- `pages_read_engagement`: Read Page content and engagement
- `pages_manage_posts`: Create and manage Page posts
- `pages_manage_metadata`: Access Page settings and metadata
- `pages_manage_cta`: Manage call-to-action buttons
- `pages_messaging`: Send and receive Page messages

**Analytics Permissions:**
- `attribution_read`: Access Attribution API for reporting

#### Step 3: App Review Process
Submit for app review to access **all production permissions**:

**Required Documentation:**
- Detailed use case for each permission
- Privacy policy covering data usage
- Terms of service
- Video demonstration of app functionality
- Business verification documents

**Justification Examples:**
- `ads_management`: "Autonomous AI assistant for campaign optimization"
- `pages_manage_posts`: "Integrated social media content creation"
- `pages_messaging`: "Customer service automation via Pages"
- `attribution_read`: "Performance analytics and reporting"

## Local Development Setup

### Prerequisites
- Node.js 18+
- PNPM package manager
- Supabase CLI (optional)

### Installation
```bash
# Clone repository
git clone <your-repo-url>
cd bamboo-mcp

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### Environment Configuration (.env)
```env
NODE_ENV=development
PORT=3000

# Database Configuration (Direct PostgreSQL)
# Use Supabase PostgreSQL or any PostgreSQL instance
DATABASE_URL=postgres://postgres.[project_ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Facebook App (development)
FACEBOOK_APP_ID=your-dev-app-id
FACEBOOK_APP_SECRET=your-dev-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback
FACEBOOK_OAUTH_SCOPES=ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read

# JWT Configuration
JWT_SECRET=your-development-secret-key-32-chars-min
JWT_EXPIRES_IN=24h

# Server Configuration
BASE_URL=http://localhost:3000
```

### Development Commands
```bash
# Start development server with hot reload (uses Streamable HTTP transport)
pnpm dev

# Run MCP server in stdio mode for local testing
node dist/mcp/server.js

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run MCP Inspector for debugging
pnpm mcp:inspect

# Build for production
pnpm build

# Start production server (uses Streamable HTTP transport)
pnpm start

# Database operations
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations

# Type checking
pnpm lint
```

### MCP Transport Usage
- **Development**: Both stdio (for MCP Inspector) and HTTP (for web testing) supported
- **Production**: Streamable HTTP transport via `/mcp` endpoint
- **Local Testing**: Use `StdioServerTransport` for direct MCP client integration
- **Web Integration**: Use `StreamableHTTPServerTransport` for HTTP-based clients

## Testing & Debugging

### MCP Inspector
The MCP Inspector is an interactive tool for testing and debugging MCP servers:

```bash
# Install globally
npm install -g @modelcontextprotocol/inspector

# Run inspector (will connect to your server)
pnpm mcp:inspect

# Or run directly
npx @modelcontextprotocol/inspector
```

**Inspector Features:**
- Visual exploration of resources and tools
- Interactive tool testing with live results
- Real-time log monitoring
- Protocol message inspection
- Error debugging and stack traces

### Testing Strategy
1. **Unit Tests**: Test individual functions and modules
2. **Integration Tests**: Test MCP server interactions
3. **Manual Testing**: Use MCP Inspector for exploratory testing
4. **E2E Tests**: Test complete OAuth + MCP workflows

### Debugging Best Practices
- All logs go to `stderr` (not `stdout`) to avoid protocol interference
- Use structured JSON logging for easier parsing
- Include request IDs for tracing across systems
- Monitor both server and client logs during integration

---

## Production Checklist

### Security
- [ ] Environment variables set securely in Render dashboard
- [ ] JWT_SECRET is 32+ characters and cryptographically secure
- [ ] Facebook app configured with production callback URLs
- [ ] RLS policies enabled and tested
- [ ] HTTPS enforced for all endpoints

### Performance
- [ ] Health checks configured
- [ ] Structured logging implemented
- [ ] Database connection pooling configured
- [ ] Error monitoring set up

### Compliance
- [ ] PKCE implementation verified
- [ ] OAuth 2.1 compliance confirmed
- [ ] Data retention policies implemented
- [ ] GDPR compliance measures in place

## Monitoring & Maintenance

### Health Monitoring
The `/health` endpoint provides system status:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "mcp": "ready"
}
```

### Log Analysis
- Application logs available in Render dashboard
- Structured JSON logging for parsing
- Error tracking with stack traces
- Request/response logging for debugging

### Database Maintenance
- Regular backups via Supabase
- Monitor connection pool usage
- Optimize queries based on usage patterns
- Archive old tokens and audit logs periodically

## Troubleshooting

### Common Issues

**OAuth Flow Failures**
- Verify callback URLs match exactly
- Check Facebook app permissions
- Validate PKCE implementation

**Database Connection Issues**
- Verify Supabase credentials
- Check RLS policy implementation
- Monitor connection pool limits

**MCP Integration Problems**
- Validate JWT token format
- Check tool schema compliance
- Verify resource endpoint accessibility

**Meta API Rate Limits**
- Implement exponential backoff
- Monitor API usage quotas
- Use batch operations where possible 