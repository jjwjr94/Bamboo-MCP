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
- **Tool Registry**: Six core Meta Ads management tools
- **Resource Management**: Static prompt resources from filesystem

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

## Deployment Architecture

### Production Environment
- **Hosting**: Render.com with auto-scaling
- **Database**: Supabase managed PostgreSQL
- **Monitoring**: Health checks + structured logging
- **Security**: Environment-based configuration 