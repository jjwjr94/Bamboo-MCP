# Meta Ads MCP Server

An MCP (Model Context Protocol) server for Meta's Marketing API. This server handles OAuth flows, provides access to Meta's advertising APIs, and includes the tooling needed to run it in production.

## Status

The server is running in production and handles the core advertising workflows. Recent work focused on pagination safety, business account context, and making delete operations harder to accidentally trigger.

## What it does

### Tools (28 total)

**Ad Account Management**
- `get_ad_accounts` - List accessible ad accounts

**Campaign Management** 
- `get_campaigns` - List campaigns with filtering
- `create_campaign` - Create new campaigns
- `update_campaign` - Modify campaign settings and budgets
- `delete_campaign` - Archive campaigns (soft delete)

**Ad Set Management**
- `get_adsets` - List ad sets with targeting info
- `create_adset` - Create ad sets with targeting rules
- `update_adset` - Modify targeting, budgets, scheduling
- `delete_adset` - Archive ad sets (soft delete)

**Ad Management**
- `get_ads` - List ads with filtering
- `create_ad` - Create ads (links creatives to ad sets)
- `update_ad` - Modify ad configuration
- `delete_ad` - Permanent deletion (requires confirmation flag)

**Ad Creative Management**
- `get_ad_creatives` - List creatives
- `create_ad_creative` - Create new creatives
- `update_ad_creative` - Modify creative properties
- `delete_ad_creative` - Permanent deletion (requires confirmation flag)

**Insights & Analytics**
- `get_ad_insights` - Performance metrics for ads/sets/campaigns
- `get_ad_account_insights` - Account-level metrics

**Custom Audience Management**
- `get_custom_audiences` - List custom audiences
- `create_custom_audience` - Create audiences for targeting
- `delete_custom_audience` - Permanent deletion (requires confirmation flag)

**Pages Management**
- `get_pages` - List accessible Facebook Pages
- `get_page_posts` - List posts from pages
- `create_page_post_ad` - Promote existing posts

**Business Manager**
- `get_business_accounts` - List business accounts
- `get_business_users` - List business account users

### Security

Uses OAuth 2.1 with PKCE for Meta authentication. JWTs are signed with EdDSA and refresh tokens rotate on use. Database uses row-level security to isolate user data. Business context is validated to prevent cross-account access.

Input validation uses Zod schemas and all database queries are parameterized. The auth flow stores encrypted tokens and handles business-managed accounts properly.

### Reliability 

Circuit breakers prevent cascading failures and retries use exponential backoff. All list operations have configurable pagination limits. Database connections are pooled and health checks monitor external dependencies.

Error handling classifies Meta API errors and applies appropriate retry policies. Structured logging helps with debugging and monitoring.

## Setup

### Requirements

- Node.js 18+, pnpm
- PostgreSQL 14+
- Meta Developer Account with app setup

### Installation

```bash
git clone <repository-url>
cd mcp
pnpm install

# Configure environment
cp .env.example .env
# Edit .env file with your credentials

# Database setup
pnpm db:generate
pnpm db:migrate

# Start server
pnpm start
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mcp_db"

# Meta API
META_APP_ID="your_meta_app_id"
META_APP_SECRET="your_meta_app_secret"
META_REDIRECT_URI="http://localhost:3000/auth/callback"

# Security
JWT_SECRET="your-secure-jwt-secret"
ENCRYPTION_KEY="your-32-byte-encryption-key"

# Server
PORT=3000
NODE_ENV=production
```

## Usage

### Basic operations

```typescript
// List campaigns
const campaigns = await mcp.call("get_campaigns", {
  adAccountId: "act_123456789"
});

// Create campaign
const newCampaign = await mcp.call("create_campaign", {
  name: "Summer Sale 2024",
  objective: "CONVERSIONS",
  dailyBudget: 5000, // cents
  status: "PAUSED"
});

// Update campaign
await mcp.call("update_campaign", {
  campaignId: "campaign_123",
  status: "ACTIVE",
  dailyBudget: 7500
});
```

### Delete operations

Some deletes are permanent and require confirmation:

```typescript
// Permanent deletion (ads, creatives, audiences)
await mcp.call("delete_ad", {
  adId: "ad_123",
  confirmPermanentDelete: true // required
});

// Archive operations (campaigns, ad sets)
await mcp.call("delete_campaign", {
  campaignId: "campaign_123" // just sets status to DELETED
});
```

### Getting insights

```typescript
// Performance data
const insights = await mcp.call("get_ad_insights", {
  campaignId: "campaign_123",
  metrics: ["impressions", "clicks", "spend", "conversions"],
  breakdowns: ["age", "gender"],
  datePreset: "last_30d"
});

// Account totals
const accountInsights = await mcp.call("get_ad_account_insights", {
  adAccountId: "act_123456789",
  metrics: ["spend", "impressions", "clicks"],
  timeRange: {
    since: "2024-01-01",
    until: "2024-01-31"
  }
});
```

## Architecture

The server uses a layered approach:

```
AI Client
    ↓ MCP Protocol (JSON-RPC)
MCP Server (tool registration, error handling)
    ↓
Business Logic (handlers, validation)
    ↓
Integration Layer (Meta SDK, resilience, schemas)
    ↓
Data Access (Drizzle ORM, connection pooling)
    ↓
External Services (Meta API, PostgreSQL)
```

Key decisions:
- Security validation at multiple layers
- Circuit breakers for external service calls
- Type safety with auto-generated schemas
- Business context isolation in the database
- Structured logging for debugging

## Documentation

- [`API_REFERENCE.md`](./API_REFERENCE.md) - Complete tool reference and schemas
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System design and patterns
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Production deployment guide
- [`SECURITY.md`](./SECURITY.md) - Security implementation details

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN pnpm install --frozen-lockfile --prod
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

### Environment considerations

- **Development**: Local PostgreSQL, debug logging enabled
- **Staging**: Managed database, structured logging
- **Production**: Connection pooling, health checks, monitoring

The server is stateless and scales horizontally. Database connections use pooling and support read replicas.

## Monitoring

Logs are structured JSON with request IDs for tracing:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Executing get_campaigns",
  "userId": "user_123",
  "adAccountId": "act_456",
  "requestId": "req_789",
  "duration": 245
}
```

Health checks monitor database connectivity and Meta API availability. Error rates and response times are tracked per endpoint.

## Development

```bash
# Install dependencies
pnpm install

# Development database
pnpm db:generate
pnpm db:migrate

# Development mode with hot reload
pnpm dev

# Run tests
pnpm test

# Lint and type check
pnpm checks
```

### Code organization

- TypeScript with strict checking
- Zod for runtime validation
- Drizzle ORM for database access
- Biome for linting and formatting
- Comprehensive test coverage

## Troubleshooting

**Authentication issues**
- Check Meta app credentials and redirect URI
- Verify JWT secret is set correctly
- Ensure database migrations are applied

**Database connection problems**
- Validate connection string format
- Check PostgreSQL is running and accessible
- Verify connection pool configuration

**API rate limits**
- Monitor Meta API usage in dashboard
- Consider business manager accounts for higher limits
- Implement client-side request throttling if needed

## Contributing

1. Fork and create a feature branch
2. Add tests for new functionality
3. Run `pnpm checks` to verify code quality
4. Update documentation as needed
5. Submit PR with clear description

## License

Proprietary License - see [LICENSE](LICENSE) file.

---

This server handles production traffic and implements the patterns needed for reliable operation. The architecture prioritizes correctness and debuggability over cleverness. 