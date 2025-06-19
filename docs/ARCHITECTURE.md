# Bamboo MCP Architecture

## Overview

Bamboo MCP is a stateless MCP server for Meta Ads management. Built for autonomous operation with Claude.

## Components

### 1. Authentication Layer

Custom `MetaServerAuthProvider` implementing the MCP `OAuthServerProvider` interface.

Components:
- **`OAuthDatabaseService`**: Database operations for users, OAuth clients, and tokens
- **`TokenManager`**: Refresh token lifecycle management
- **`SessionManager`**: Stateless OAuth flow state management

Features:
- OAuth 2.1 + PKCE (S256) mandatory
- JWT signed with HS256 (configurable for RS256/ES256)
- Refresh token rotation with breach detection
- SHA-256 hashed token storage

### 2. Database Layer

PostgreSQL with Drizzle ORM and Row-Level Security.

**Tables:**
- `users`: Core user information
- `oauth_clients`: MCP client registration
- `oauth_tokens`: Meta access tokens per user
- `oauth_refresh_tokens`: Hashed refresh tokens
- `oauth_sessions` & `oauth_temp_auth_codes`: OAuth flow state
- `ad_accounts`: User-specific ad account data

**Security:**
- Type-safe RLS policies in Drizzle schema
- Session variable (`app.current_user_id`) for user context
- Per-transaction user isolation via `withUserContext`

### 3. MCP Protocol Layer

- **Server**: `@modelcontextprotocol/sdk` v1.13.0
- **Transport**: `StreamableHTTPServerTransport` for production
- **Architecture**: Stateless - new `McpServer` instance per request
- **Tool Registry**: Modular organization with specialized registries
- **Resources**: Static prompts + dynamic templates for ad accounts

### 4. Meta Ads Integration
- Facebook Business SDK v22.0.3
- Marketing API v18+ compatibility
- 10 tools: account (2), campaign (4), ad set (4)

### 5. Resilience Layer

Circuit breaker and retry logic using `cockatiel` library.

- **Retry**: Exponential backoff for transient failures
- **Circuit Breaker**: Prevents cascading failures to Meta API
- **Error Classification**: Smart retry decisions via `shouldRetryMetaError`
- **API Service**: All Meta SDK calls wrapped in resilience policy

## Data Flow

```
Claude → OAuth → JWT → MCP Server → Meta Business SDK → Facebook Graph API
  ↓         ↓       ↓        ↓              ↓               ↓
Auth    Tokens  Tools   Validation    API Calls      Ad Operations
```

## Security

### Multi-Layer Defense
1. **Transport**: HTTPS + security headers
2. **Authentication**: OAuth 2.1 + PKCE + JWT
3. **Authorization**: Database RLS policies
4. **Input**: Zod schema validation
5. **API**: Facebook SDK token handling
6. **Response**: Automatic sanitization removes `_api` objects containing access tokens

### RLS Implementation
Type-safe policies in TypeScript alongside schema:
- `app_user` role for application access
- Session-based isolation: `current_setting('app.current_user_id')::uuid`
- Resource isolation across all protected tables
- Fail-secure defaults

## Implementation History

### MCP SDK Modernization (Completed)
- Migrated `Server` → `McpServer`
- `setRequestHandler` → `registerTool`/`registerResource`
- Custom HTTP → `StreamableHTTPServerTransport`
- Removed deprecated patterns

### Enhanced Capabilities (Completed)
- Dynamic resources with `ResourceTemplate`
- Parameterized URIs: `bamboo://ad-accounts/{accountId}`
- Account management and context switching
- Multi-user ad account access

### OAuth Security Enhancement (Completed)
- Custom OAuth provider replacing proxy pattern
- Refresh token rotation with 90-day expiry
- Breach detection and token family revocation
- Database-backed token management

## Deployment

- **Hosting**: Render.com auto-scaling
- **Database**: Supabase managed PostgreSQL
- **Monitoring**: Health checks + structured logging
- **Config**: Environment-based 