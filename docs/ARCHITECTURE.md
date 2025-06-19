# Meta Ads MCP Server Architecture

This document provides a comprehensive overview of the Meta Ads MCP server architecture, detailing the design decisions, patterns, and implementations that make this a production-ready, enterprise-grade system.

## Executive Summary

The Meta Ads MCP server is built as a secure, scalable, and resilient system that provides AI agents with comprehensive access to Meta's Marketing API. The architecture emphasizes security, reliability, and maintainability through modern patterns and best practices.

**Key Architectural Principles:**
- **Security First**: Multi-layered security with OAuth 2.1, JWT, and database-level isolation
- **Resilience by Design**: Circuit breakers, intelligent retries, and graceful degradation
- **Production Ready**: Comprehensive error handling, logging, and monitoring
- **Developer Experience**: Type safety, consistent patterns, and clear abstractions
- **Enterprise Scale**: Business context handling, pagination safety, and resource protection

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Client                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP Protocol (JSON-RPC over stdio)
┌─────────────────────────▼───────────────────────────────────────┐
│                    MCP Server Layer                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  Tool Registry  │ │ Error Handler   │ │ Response Helper │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                   Business Logic Layer                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Tools Handler   │ │ Meta Handlers   │ │ Business Logic  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Integration Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Meta API SDK    │ │ Resilience      │ │ Schema          │   │
│  │                 │ │ Policies        │ │ Validation      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Data Access Layer                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Database Client │ │ Row-Level       │ │ Connection      │   │
│  │ (Drizzle ORM)   │ │ Security (RLS)  │ │ Pooling         │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    External Services                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Meta Marketing  │ │ PostgreSQL      │ │ Redis (Future)  │   │
│  │ API             │ │ Database        │ │ Cache           │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Server Layer

**Purpose**: Handles the Model Context Protocol communication and tool registration.

**Key Components:**
- **Tool Registries**: Category-specific tool registration and validation
- **Error Handler**: Centralized error processing and MCP response formatting
- **Response Helper**: Standardized success response creation and data sanitization

**Implementation Highlights:**
- Type-safe tool definitions using Zod schemas
- Automatic input validation and sanitization
- Structured error responses with retry guidance
- Consistent response formatting across all tools

### 2. Business Logic Layer

**Purpose**: Implements the core business logic and orchestrates operations.

**Key Components:**
- **MetaToolsHandler**: Central orchestrator for all Meta API operations
- **Specialized Handlers**: Domain-specific logic (campaigns, ads, insights, etc.)
- **Business Context Manager**: Handles business-managed account scenarios

**Implementation Highlights:**
- Consistent patterns across all handlers
- Business context detection and application
- Comprehensive input validation
- Intelligent error handling and recovery

### 3. Integration Layer

**Purpose**: Manages external API integration with resilience and reliability.

**Key Components:**
- **Meta API SDK**: Official Facebook Business SDK integration
- **Resilience Policies**: Circuit breakers and retry logic
- **Schema Validation**: Auto-generated and comprehensive validation

**Implementation Highlights:**
- Request-scoped resilience policies
- Intelligent error classification
- Automatic schema generation from SDK
- Comprehensive API response validation

### 4. Data Access Layer

**Purpose**: Provides secure and efficient data persistence.

**Key Components:**
- **Drizzle ORM**: Type-safe database operations
- **Row-Level Security**: Database-level user isolation
- **Connection Management**: Efficient connection pooling

**Implementation Highlights:**
- Automatic user context enforcement
- Type-safe queries and migrations
- Optimized database schema design
- Secure multi-tenant data isolation

## Security Architecture

### Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication Flow                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  OAuth 2.1 + PKCE Flow                                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Authorization   │ │ Token Exchange  │ │ Refresh Token   │   │
│  │ Code Generation │ │ with PKCE       │ │ Rotation        │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  JWT Token Management                                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ EdDSA Signing   │ │ Stateless       │ │ Secure Claims   │   │
│  │                 │ │ Verification    │ │ Validation      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  Database Security                                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Row-Level       │ │ User Context    │ │ Data Isolation  │   │
│  │ Security (RLS)  │ │ Enforcement     │ │                 │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Security Features:**
- **OAuth 2.1 with PKCE**: Latest security standards for authorization
- **Refresh Token Rotation**: Enhanced security with automatic token invalidation
- **JWT with EdDSA**: Cryptographically secure stateless tokens
- **Row-Level Security**: Database-enforced user data isolation
- **Business Context Validation**: Secure multi-tenant access control

### Data Protection

- **Input Sanitization**: Comprehensive validation at all entry points
- **Output Sanitization**: Automatic removal of sensitive internal data
- **SQL Injection Prevention**: Parameterized queries and ORM protection
- **Cross-User Data Access Prevention**: RLS enforcement
- **Token Security**: Secure storage and automatic rotation

## Resilience Architecture

### Error Handling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Error Classification                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  Transient Errors (Retryable)                                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Rate Limits     │ │ Network Issues  │ │ Server Errors   │   │
│  │ (429)           │ │ (5xx)           │ │ (502, 503, 504) │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  Permanent Errors (Non-Retryable)                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Authentication  │ │ Authorization   │ │ Validation      │   │
│  │ Failures (401)  │ │ Failures (403)  │ │ Errors (400)    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Resilience Patterns

**Circuit Breaker Pattern:**
- Automatic failure detection
- Graceful degradation during outages
- Automatic recovery testing
- Per-request isolation (prevents user cross-contamination)

**Retry Strategy:**
- Exponential backoff with jitter
- Intelligent error classification
- Maximum retry limits
- Request-scoped policies

**Resource Protection:**
- Pagination safety limits
- Memory usage controls
- Connection pooling
- Request timeouts

## Data Architecture

### Database Schema Design

```sql
-- Core user and authentication tables
users (id, facebook_user_id, created_at, updated_at)
oauth_tokens (user_id, access_token, refresh_token, expires_at)
auth_sessions (user_id, client_id, code_challenge, expires_at)

-- Ad account and business context
ad_accounts (id, user_id, name, status, currency, business_id)
  -- RLS: WHERE user_id = current_setting('app.current_user_id')::uuid

-- Audit and monitoring
api_requests (user_id, endpoint, status, duration, created_at)
error_logs (user_id, error_type, message, context, created_at)
```

**Design Principles:**
- **Row-Level Security**: Every user-specific table includes RLS policies
- **Audit Trail**: Comprehensive logging for debugging and compliance
- **Performance**: Optimized indexes and efficient queries
- **Scalability**: Designed for horizontal scaling
- **Data Integrity**: Foreign key constraints and validation

### Business Context Handling

The system seamlessly handles both personal and business-managed ad accounts:

```typescript
// Automatic business context detection
const businessId = await getBusinessIdForAdAccount(userId, adAccountId);
if (businessId) {
  apiParams.business_id = businessId; // Include in API calls
}
```

**Features:**
- Automatic detection of business-managed accounts
- Secure business context retrieval
- Transparent API parameter injection
- Multi-tenant business support

## Performance Architecture

### Pagination Strategy

All list operations implement comprehensive pagination safety:

```typescript
const MAX_ITEMS_TO_FETCH = 1000; // Configurable per endpoint

while (currentCursor && currentCursor.length > 0) {
  allItems.push(...currentCursor);
  
  if (allItems.length >= MAX_ITEMS_TO_FETCH) {
    logger.warn('Reached pagination limit', { limit: MAX_ITEMS_TO_FETCH });
    break;
  }
  
  if (currentCursor.hasNext()) {
    currentCursor = await currentCursor.next();
  } else {
    break;
  }
}
```

**Benefits:**
- Prevents resource exhaustion
- Protects against runaway queries
- Ensures consistent performance
- Provides clear limits and warnings

### Caching Strategy (Future Enhancement)

Planned caching layers for optimal performance:
- **Redis**: API response caching
- **Application Cache**: Schema and metadata caching
- **Database Cache**: Connection pooling and query optimization

## Monitoring & Observability

### Logging Architecture

Structured JSON logging throughout the system:

```typescript
logger.info('Executing API operation', {
  userId: authPayload.userId,
  operation: 'get_campaigns',
  adAccountId: params.adAccountId,
  requestId: context.requestId
});
```

**Log Categories:**
- **Request Logs**: All API operations with context
- **Error Logs**: Detailed error information with stack traces
- **Performance Logs**: Response times and resource usage
- **Security Logs**: Authentication and authorization events

### Health Monitoring

Comprehensive health checks:
- **Database Connectivity**: Connection pool status
- **Meta API Status**: External service health
- **Memory Usage**: Resource consumption monitoring
- **Error Rates**: Real-time error tracking

## Deployment Architecture

### Production Configuration

```typescript
// Environment-based configuration
const config = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10')
  },
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY
  }
};
```

### Container Strategy

Optimized for containerized deployment:
- **Stateless Design**: No local state dependencies
- **Health Endpoints**: Kubernetes-compatible health checks
- **Graceful Shutdown**: Proper connection cleanup
- **Resource Limits**: Memory and CPU optimization

### Scalability Considerations

**Horizontal Scaling:**
- Stateless server design
- Database connection pooling
- Request-scoped resilience policies
- Load balancer compatibility

**Vertical Scaling:**
- Efficient memory usage
- Optimized database queries
- Streaming response handling
- Resource monitoring

## Development Architecture

### Code Organization

```
src/
├── auth/                 # Authentication & authorization
│   ├── jwt.ts           # JWT token management
│   ├── MetaServerAuthProvider.ts  # OAuth 2.1 implementation
│   └── TokenManager.ts  # Token lifecycle management
├── db/                  # Database layer
│   ├── client.ts        # Database client and RLS
│   ├── schema.ts        # Database schema definitions
│   └── migrations/      # Database migrations
├── mcp/                 # MCP protocol layer
│   ├── registries/      # Tool registrations by category
│   ├── server.ts        # MCP server implementation
│   └── errorHandler.ts  # Error handling
├── tools/               # Business logic layer
│   └── meta/            # Meta API handlers
├── types/               # TypeScript type definitions
└── utils/               # Shared utilities
```

### Type Safety Strategy

Comprehensive TypeScript implementation:
- **Generated Types**: Auto-generated from Meta SDK
- **Validation Types**: Zod schemas for runtime validation
- **Business Types**: Domain-specific type definitions
- **Utility Types**: Helper types for common patterns

### Testing Strategy

Multi-layered testing approach:
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Contract Tests**: API contract validation
- **Performance Tests**: Load and stress testing

## Future Architecture Enhancements

### Planned Improvements

1. **Caching Layer**: Redis-based response caching
2. **Rate Limiting**: Advanced rate limiting with Redis
3. **Metrics Collection**: Prometheus/Grafana integration
4. **Distributed Tracing**: OpenTelemetry implementation
5. **Event Sourcing**: Audit trail and event replay
6. **Microservices**: Domain-specific service separation

### Scalability Roadmap

1. **Phase 1**: Current monolithic architecture (production-ready)
2. **Phase 2**: Caching and performance optimization
3. **Phase 3**: Microservices decomposition
4. **Phase 4**: Event-driven architecture
5. **Phase 5**: Multi-region deployment

This architecture provides a solid foundation for a production-ready Meta Ads MCP server while maintaining flexibility for future enhancements and scaling requirements.