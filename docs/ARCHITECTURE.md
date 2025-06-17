# Bamboo MCP Architecture

## System Overview

Bamboo MCP is a stateless, production-ready Model Context Protocol server that enables Claude to autonomously manage Meta Ads campaigns. The architecture follows 2025 security best practices and implements a modular, scalable design.

## Core Components

### 1. Authentication Layer
- **OAuth 2.0 with PKCE**: Mandatory PKCE implementation for all clients
- **JWT Security**: RS256/ES256 signing with strict validation
- **Token Management**: Secure storage and refresh handling via Supabase

### 2. Database Layer
- **PostgreSQL**: Any PostgreSQL database (Supabase, AWS RDS, Google Cloud SQL, etc.)
- **Drizzle ORM**: Type-safe database operations with native RLS support
- **Row Level Security (RLS)**: Type-safe policies with session-based isolation
- **Multi-tenant Isolation**: Session variable-based user context enforcement

### 3. MCP Protocol Layer
- **Server Implementation**: @modelcontextprotocol/sdk v1.12.3
- **✅ MODERNIZED**: Now uses 2025 best practices with McpServer, registerTool, and StreamableHTTPServerTransport
- **Tool Registry**: Core Meta Ads management tools with modern registration API
- **Resource Management**: Static prompt resources with SDK-managed registration

### 4. Meta Ads Integration
- **Facebook Business SDK**: v22.0.3 with TypeScript support
- **Marketing API**: v18+ compatibility
- **Asset Management**: Dynamic asset retrieval from Meta Ads API

## Data Flow Architecture

```
Claude → OAuth → JWT → MCP Server → Meta Business SDK → Facebook Graph API
  ↓         ↓       ↓        ↓              ↓               ↓
Auth    Tokens  Tools   Validation    API Calls      Ad Operations
```

## Security Architecture

### Multi-Layer Security
1. **Transport Layer**: HTTPS enforcement
2. **Authentication**: OAuth 2.0 + PKCE + JWT
3. **Authorization**: RLS policies + user context validation
4. **Input Validation**: Zod schemas for all inputs
5. **API Security**: Facebook SDK with secure token handling

### RLS Policy Patterns
- **Type-safe Policies**: Defined in TypeScript alongside schema
- **Custom Role Management**: Uses application-specific `app_user` role
- **Session-based Access**: `current_setting('app.current_user_id')::uuid` patterns
- **Resource Isolation**: All tables protected by user context
- **Fail-secure Defaults**: Restrictive policies by default
- **Migration Versioning**: Policies tracked with schema changes
- **Database Agnostic**: Works with any PostgreSQL database

## Architecture Improvements Completed

### MCP SDK Modernization ✅ **COMPLETED**

#### 1. **Idiomatic MCP Implementation** ✅
- **Completed**: Migrated from deprecated `Server` class to modern `McpServer`
- **Completed**: Using high-level `registerTool`/`registerResource` instead of `setRequestHandler`
- **Completed**: SDK now handles schema validation automatically
- **Impact**: Full compliance with 2025 MCP SDK best practices, improved maintainability

#### 2. **Modern HTTP Transport** ✅
- **Completed**: Implemented `StreamableHTTPServerTransport` replacing custom `handleMcpRequest`
- **Completed**: Proper request routing and response formatting via SDK
- **Impact**: Modern streaming capabilities, reduced maintenance burden

#### 3. **Static Resource Patterns** ⚠️ **Phase 2 Pending**
- **Status**: Current static URIs work correctly with new registration API
- **Next**: Migration to `ResourceTemplate` for dynamic resources planned for Phase 2
- **Impact**: Foundation established for future scalability

### Architecture Changes Completed

#### Phase 1: MCP SDK Modernization ✅ **COMPLETED**
1. **Server Class Migration**: `Server` → `McpServer` ✅
2. **Registration Pattern**: `setRequestHandler` → `registerTool`/`registerResource` ✅
3. **Transport Upgrade**: Custom HTTP → `StreamableHTTPServerTransport` ✅
4. **Legacy Code Removal**: Removed deprecated patterns and custom handlers ✅

#### Phase 2: Enhanced Capabilities 📋 **PLANNED**
1. **Dynamic Resources**: Parameterized resources for ad accounts/campaigns
2. **Resource Templates**: Implementation of `ResourceTemplate` for scalable URIs
3. **Enhanced Discovery**: Improved resource and tool discovery capabilities

### Architecture Strengths to Preserve ✅
- **Authentication**: JWT + RLS pattern is excellent and more sophisticated than typical MCP examples
- **Database**: Current RLS implementation is production-ready
- **Security**: Multi-layer security architecture is well-designed

## Deployment Architecture

### Production Environment
- **Hosting**: Render.com with auto-scaling
- **Database**: Supabase managed PostgreSQL
- **Monitoring**: Health checks + structured logging
- **Security**: Environment-based configuration 