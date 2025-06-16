# Bamboo MCP Implementation Plan

## Research Summary & Version Updates

Based on current best practices:

**Current Versions:**
- `@modelcontextprotocol/sdk`: 1.12.3
- `facebook-nodejs-business-sdk`: 22.0.3  
- `@types/facebook-nodejs-business-sdk`: 22.0.0

**Key Updates:**
- **MCP Protocol**: Latest spec is 2025-03-26, SDK tracks closely with Streamable HTTP transport
- **HTTP Framework**: Fastify preferred over Express for TypeScript and performance
- **MCP Server**: Uses `Server` class with `StdioServerTransport` (dev) or `StreamableHTTPServerTransport` (prod)
- **Validation**: Fastify + Zod integration via `fastify-type-provider-zod`
- **Testing**: MCP Inspector for manual testing, Vitest for automated testing
- **OAuth Security**: PKCE now mandatory, using `pkce-challenge` helper library
- **JWT Security**: RS256/ES256 required, strict validation patterns
- **Facebook SDK**: Full TypeScript support, Marketing API v18+ compatibility
- **Drizzle + PostgreSQL**: Native RLS support with type-safe policies and session-based isolation
- **Row-Level Security**: Type-safe policies defined in TypeScript, automatic RLS enabling
- **Simplified Setup**: Direct PostgreSQL connection, no additional client libraries required
- **Render Deployment**: Enhanced environment variable security, health checks

---

## Dependencies

### Production Dependencies
```bash
# Core MCP and Server
pnpm add @modelcontextprotocol/sdk@1.12.3
pnpm add fastify@^5.1.0 @fastify/cors@^10.0.1
pnpm add fastify-type-provider-zod@^4.0.1

# Database and ORM  
pnpm add drizzle-orm@^0.33.0 @supabase/supabase-js@^2.45.4 postgres@^3.4.4

# Meta Ads Integration
pnpm add facebook-nodejs-business-sdk@22.0.3

# Authentication and Validation
pnpm add jsonwebtoken@^9.0.2 zod@^3.23.8 
pnpm add pkce-challenge@^5.0.0 crypto@^1.0.1

# Environment and Utilities
pnpm add dotenv@^16.4.5
```

### Development Dependencies
```bash
# TypeScript and Build Tools
pnpm add -D typescript@^5.5.4 @types/node@^22.5.4 ts-node@^10.9.2
pnpm add -D @types/jsonwebtoken@^9.0.6 @types/facebook-nodejs-business-sdk@22.0.0

# Database Tools
pnpm add -D drizzle-kit@^0.24.0

# Testing Framework
pnpm add -D vitest@^2.1.4 @vitest/ui@^2.1.4 supertest@^7.0.0 @types/supertest@^6.0.2

# Development Tools
pnpm add -D nodemon@^3.1.4 tsx@^4.19.2
```

---

## Project Structure

```
src/
├── types/
│   ├── index.ts          # Global type definitions
│   └── meta.ts           # Meta Ads API types
├── db/
│   ├── schema.ts         # Drizzle schemas with RLS
│   ├── client.ts         # Database clients (Drizzle + Supabase)
│   └── migrations/       # Schema migrations
├── auth/
│   ├── oauth.ts          # OAuth endpoints (PKCE compliant)
│   ├── jwt.ts            # JWT utilities
│   └── middleware.ts     # Auth middleware
├── mcp/
│   ├── server.ts         # MCP server setup  
│   └── http.ts           # Streamable HTTP transport for MCP
├── tools/
│   ├── metaTools.ts      # Meta Ads MCP tools
│   └── schemas.ts        # Zod validation schemas
├── prompts/
│   ├── system_prompt.txt     # Bamboo system prompt
│   └── best_practices.txt    # Meta Ads guidelines
├── utils/
│   ├── env.ts           # Environment validation
│   ├── logger.ts        # Structured logging
│   └── errors.ts        # Error handling
├── index.ts             # Fastify app entry point
├── health.ts            # Health check endpoint  
├── test/                # Test files
│   ├── mcp.test.ts      # MCP server tests
│   ├── auth.test.ts     # OAuth flow tests
│   └── tools.test.ts    # Tool implementation tests
package.json
tsconfig.json
drizzle.config.ts
.env.example
README.md
```

## Implementation Overview

This document provides the implementation plan for Bamboo MCP, an MCP server for Meta Ads management. The implementation includes:

- **OAuth 2.0 with PKCE compliance** for secure authentication
- **Dual Database Approach**: Drizzle ORM (direct PostgreSQL) + Supabase client (auth/API)
- **Meta Business SDK integration** with **complete API coverage**
- **MCP-compliant server** with **comprehensive toolset** (40+ tools)
- **Multi-account handling** with intelligent account selection
- **Production deployment** configuration for Render.com

## MCP Tools Implementation

### Meta API Coverage
The MCP server provides complete coverage of the Facebook Business SDK, supporting all major Meta business APIs through 40+ specialized tools plus a generic API access tool.

#### Account Management Tools (3 tools)
- `get_ad_accounts` - List all ad accounts with permissions and roles
- `get_business_accounts` - Retrieve business accounts and associated ad accounts  
- `select_ad_account` - Select an ad account for subsequent operations

#### Campaign Management Tools (4 tools)
- `get_campaigns` - Retrieve campaigns with filtering and field selection
- `create_campaign` - Create new campaigns with full configuration options
- `update_campaign` - Update existing campaigns (name, status, budget)
- `delete_campaign` - Delete campaigns (sets status to DELETED)

#### Ad Set Management Tools (4 tools)
- `get_adsets` - Retrieve ad sets for campaigns or accounts
- `create_adset` - Create ad sets with advanced targeting options
- `update_adset` - Update existing ad sets
- `delete_adset` - Delete ad sets

#### Ad Management Tools (4 tools)
- `get_ads` - Retrieve ads with filtering and field selection
- `create_ad` - Create individual ads with creative assignment
- `update_ad` - Update existing ads
- `delete_ad` - Delete ads

#### Creative Management Tools (6 tools)
- `get_ad_creatives` - List ad creatives with metadata
- `create_ad_creative` - Create new ad creatives with object story specs
- `update_ad_creative` - Update existing creatives
- `delete_ad_creative` - Delete creatives
- `get_uploaded_assets` - List media assets (images, videos)
- `upload_ad_asset` - Upload new images/videos for ads

#### Audience Management Tools (4 tools)
- `get_custom_audiences` - List custom audiences with details
- `create_custom_audience` - Create new custom audiences (website, app, etc.)
- `update_custom_audience` - Update existing audiences
- `delete_custom_audience` - Delete audiences

#### Insights & Reporting Tools (4 tools)
- `get_account_insights` - Account-level performance data with breakdowns
- `get_campaign_insights` - Campaign performance data
- `get_adset_insights` - Ad set performance data  
- `get_ad_insights` - Ad-level performance data

#### Page Management Tools (3 tools)
- `get_pages` - List Facebook Pages user manages
- `get_page_insights` - Page performance insights and metrics
- `create_page_post` - Create posts on Facebook Pages

#### Business Management Tools (2 tools)
- `get_business_users` - List users in business accounts with roles
- `get_business_assets` - List business assets (ad accounts, pages, catalogs)

#### Commerce & Catalog Tools (6 tools)
- `get_product_catalogs` - List product catalogs for commerce
- `create_product_catalog` - Create new product catalogs
- `get_product_feeds` - List product feeds for catalogs
- `create_product_feed` - Create new product feeds
- `get_products` - List products in catalogs with details
- `create_product` - Create new products in catalogs

#### Generic API Access (1 tool)
- `call_meta_api` - Direct access to any Meta API endpoint not covered by specific tools

### Multi-Account Handling Strategy

#### Intelligent Account Selection
1. Single Account Auto-Selection: If user has only one ad account, it's selected automatically
2. Multi-Account User Prompting: For multiple accounts, Claude will ask user to choose
3. Explicit Account Selection: Users can call `select_ad_account` to choose an account
4. Per-Operation Override: Users can specify `adAccountId` in individual tool calls
5. Session Persistence: Selected account persists throughout the user's conversation

#### Claude Integration Behavior
- Discovery Phase: Claude calls `get_ad_accounts` to discover available accounts and permissions
- User Interaction: When multiple accounts exist, Claude presents options and asks user to choose
- Context Maintenance: Claude remembers selected account throughout conversation
- Permission Awareness: Tools respect user's permission level (ADMIN, ADVERTISER, etc.) on each account
- Error Guidance: Clear error messages guide users when account selection is needed

#### Account Context Management
```typescript
// Example multi-account error message
"Multiple ad accounts available. Please specify which account to use:
- act_123456789: My Business Account (ADMIN)
- act_987654321: Client Account (ADVERTISER)
- act_555666777: Test Account (ADMIN)"
```

#### Permission-Based Access Control
- Role Validation: Tools check user's role on selected account before operations
- Operation Restrictions: Write operations require appropriate permissions
- Graceful Degradation: Read-only access when user has limited permissions

### Database Architecture
- Drizzle ORM: Direct PostgreSQL connection via `DATABASE_URL` for type-safe database operations
- Native RLS Support: Type-safe policies defined in TypeScript using `pgPolicy()` and custom roles
- Session-based Isolation: Uses PostgreSQL session variables for user context (`app.current_user_id`)
- Automatic RLS Enabling: Policies automatically enable RLS without manual SQL commands
- Migration Management: RLS policies versioned and tracked with schema changes
- Connection Pooling: Uses PostgreSQL connection pooling with `prepare: false` for optimal performance
- Database Agnostic: Works with any PostgreSQL database (Supabase, AWS RDS, Google Cloud SQL, etc.)

## Additional Documentation Files

This implementation plan is supplemented by additional documentation files:

- `ARCHITECTURE.md` - Detailed system architecture
- `API_REFERENCE.md` - Complete API endpoints and MCP tools reference
- `DEPLOYMENT.md` - Production deployment guide
- `SECURITY.md` - Security compliance and best practices 