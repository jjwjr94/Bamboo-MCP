# Bamboo MCP Gateway

**An All-in-One Model Context Protocol (MCP) Gateway combining Meta Ads and PostgreSQL functionality with enterprise-grade authentication, prompt seeding, and company profile management.**

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Bamboo MCP Gateway is a sophisticated Model Context Protocol server that acts as a unified gateway for Meta Ads management and PostgreSQL database operations. Built with TypeScript and Node.js, it provides enterprise-grade features including multi-provider authentication, intelligent prompt seeding, company profile management, and comprehensive rate limiting.

The gateway implements the MCP specification to enable seamless integration with AI assistants like Claude Desktop, providing a secure and efficient way to manage advertising campaigns and database operations through natural language interactions.

### Key Benefits

- **Unified Interface**: Single MCP endpoint for both Meta Ads and PostgreSQL operations
- **Enterprise Security**: Multi-provider authentication with JWT tokens and rate limiting
- **Intelligent Context**: Automatic prompt seeding with company-specific guidelines
- **Scalable Architecture**: Docker-ready with Redis caching and PostgreSQL storage
- **Production Ready**: Comprehensive monitoring, health checks, and deployment configurations

---

## Features

### 🔐 Multi-Provider Authentication
- **Facebook OAuth 2.0**: Direct integration with Meta's authentication system
- **Pipeboard Integration**: Support for Pipeboard API tokens
- **JWT Token Management**: Secure token generation, validation, and refresh
- **Redis Session Storage**: Distributed session management with automatic expiration

### 📊 Meta Ads Management
- **Campaign Operations**: Create, read, update, and delete advertising campaigns
- **Performance Analytics**: Real-time metrics and reporting capabilities
- **Audience Management**: Advanced targeting and lookalike audience creation
- **Budget Optimization**: Automated bid adjustments and budget allocation
- **Compliance Monitoring**: Built-in policy compliance and approval workflows

### 🗄️ PostgreSQL Integration
- **Database Operations**: Full CRUD operations with parameterized queries
- **Company Profiles**: JSONB-based flexible company data storage
- **Audit Logging**: Comprehensive change tracking and compliance reporting
- **Query Optimization**: Intelligent indexing and performance monitoring
- **Security Controls**: Role-based access and SQL injection prevention

### 🧠 Intelligent Prompt Seeding
- **Context Injection**: Automatic company-specific prompt injection
- **Resource Management**: Dynamic loading of guidelines and best practices
- **Conversation Tracking**: Session-based context management
- **Custom Templates**: Configurable prompt templates per organization

### 🚀 Enterprise Features
- **Rate Limiting**: Configurable per-user request throttling
- **Health Monitoring**: Comprehensive service health checks
- **Caching Layer**: Redis-based performance optimization
- **Audit Trails**: Complete operation logging and compliance reporting
- **Docker Support**: Container-ready with orchestration configurations

---



## Architecture

Bamboo MCP Gateway implements a sophisticated microservices-inspired architecture while maintaining the simplicity of a single deployable unit. The system is designed around the Model Context Protocol specification, providing a standardized interface for AI assistant integration.

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Desktop                           │
│                     (MCP Client)                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │ MCP Protocol (SSE/HTTP)
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                 Bamboo MCP Gateway                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   Auth      │ │   Gateway   │ │   Prompt    │ │  Company  │ │
│  │  Service    │ │   Core      │ │   Seeder    │ │ Profiles  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│  ┌─────────────┐ ┌─────────────┐                               │
│  │  Meta Ads   │ │ PostgreSQL  │                               │
│  │   Proxy     │ │   Proxy     │                               │
│  └─────────────┘ └─────────────┘                               │
└─────────────────────┬───────────────────┬───────────────────────┘
                      │                   │
            ┌─────────▼─────────┐ ┌───────▼────────┐
            │   Meta Ads MCP    │ │ PostgreSQL MCP │
            │     Server        │ │     Server     │
            └─────────┬─────────┘ └───────┬────────┘
                      │                   │
            ┌─────────▼─────────┐ ┌───────▼────────┐
            │   Meta Graph      │ │   PostgreSQL   │
            │      API          │ │   Database     │
            └───────────────────┘ └────────────────┘
```

### Data Flow Architecture

The gateway implements a sophisticated request routing and processing pipeline:

1. **Authentication Layer**: All requests are authenticated using JWT tokens obtained through Facebook OAuth or Pipeboard API integration
2. **Rate Limiting**: Per-user request throttling using Redis-based sliding window counters
3. **Tool Routing**: Intelligent routing based on tool name prefixes (`ads.*` for Meta Ads, `pg.*` for PostgreSQL)
4. **Prompt Injection**: Automatic context seeding on first tool usage per conversation session
5. **Upstream Proxying**: Transparent proxying to specialized MCP servers with error handling and retry logic
6. **Response Caching**: Strategic caching of company profiles and frequently accessed data

### Security Architecture

Security is implemented through multiple layers of protection:

- **Transport Security**: HTTPS/TLS encryption for all communications
- **Authentication**: Multi-provider OAuth 2.0 with JWT token validation
- **Authorization**: Role-based access control with company-specific permissions
- **Input Validation**: Comprehensive request validation using Joi schemas
- **SQL Injection Prevention**: Parameterized queries and prepared statements
- **Rate Limiting**: Distributed rate limiting with Redis backend
- **Audit Logging**: Complete operation tracking for compliance and security monitoring

---

## Quick Start

Get Bamboo MCP Gateway running in under 5 minutes using Docker Compose.

### Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/bamboo-mcp.git
cd bamboo-mcp
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your credentials:

```bash
# Database Configuration
DATABASE_URL=postgresql://bamboo:bamboo_password@localhost:5432/bamboo_mcp
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
PIPEBOARD_API_TOKEN=your-pipeboard-api-token

# Meta Ads Configuration
FACEBOOK_CALLBACK_URL=http://localhost:8443/auth/facebook/callback
```

### 3. Start Services

```bash
# Start all services including PostgreSQL and Redis
docker-compose up -d

# View logs
docker-compose logs -f bamboo-mcp
```

### 4. Verify Installation

```bash
# Check health endpoint
curl http://localhost:8443/health

# Check MCP manifest
curl http://localhost:8443/manifest
```

### 5. Configure Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "bamboo-mcp": {
      "command": "node",
      "args": ["/path/to/bamboo-mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://bamboo:bamboo_password@localhost:5432/bamboo_mcp",
        "REDIS_URL": "redis://localhost:6379",
        "JWT_SECRET": "your-jwt-secret"
      }
    }
  }
}
```

---

## Installation

### Development Installation

For local development and testing:

```bash
# Clone repository
git clone https://github.com/your-org/bamboo-mcp.git
cd bamboo-mcp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env

# Build application
npm run build

# Start development server
npm run dev
```

### Production Installation

#### Option 1: Docker Deployment

```bash
# Build production image
docker build -t bamboo-mcp:latest .

# Run with external database
docker run -d \
  --name bamboo-mcp \
  -p 8443:8443 \
  -e DATABASE_URL="your-postgres-url" \
  -e REDIS_URL="your-redis-url" \
  -e JWT_SECRET="your-jwt-secret" \
  bamboo-mcp:latest
```

#### Option 2: Direct Installation

```bash
# Install Node.js dependencies
npm ci --only=production

# Install Python dependencies for MCP servers
pip install uvx
uvx install meta-ads-mcp

# Build application
npm run build

# Start production server
NODE_ENV=production node dist/index.js
```

#### Option 3: Render.com Deployment

1. Fork this repository
2. Connect to Render.com
3. Set environment variables in Render dashboard
4. Deploy using the included `render.yaml` configuration

### System Requirements

#### Minimum Requirements
- **CPU**: 1 vCPU
- **Memory**: 512 MB RAM
- **Storage**: 1 GB available space
- **Network**: Stable internet connection

#### Recommended Requirements
- **CPU**: 2 vCPUs
- **Memory**: 2 GB RAM
- **Storage**: 10 GB available space
- **Database**: PostgreSQL 15+ with 1 GB storage
- **Cache**: Redis 7+ with 256 MB memory

#### Production Requirements
- **CPU**: 4+ vCPUs
- **Memory**: 4+ GB RAM
- **Storage**: 50+ GB SSD storage
- **Database**: PostgreSQL cluster with backup
- **Cache**: Redis cluster with persistence
- **Load Balancer**: For high availability
- **Monitoring**: Application and infrastructure monitoring

---


## Configuration

Bamboo MCP Gateway uses environment variables for configuration, providing flexibility across different deployment environments. All configuration options are validated at startup using Joi schemas.

### Environment Variables

#### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Application environment (development/production/test) |
| `PORT` | No | `8443` | HTTP server port |
| `LOG_LEVEL` | No | `info` | Logging level (error/warn/info/debug) |

#### Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |

#### Authentication Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT token signing (min 32 chars) |
| `JWT_EXPIRES_IN` | No | `24h` | JWT token expiration time |
| `FACEBOOK_APP_ID` | Yes | - | Facebook application ID |
| `FACEBOOK_APP_SECRET` | Yes | - | Facebook application secret |
| `FACEBOOK_CALLBACK_URL` | Yes | - | Facebook OAuth callback URL |
| `PIPEBOARD_API_TOKEN` | No | - | Pipeboard API token for Meta Ads access |

#### Rate Limiting Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | No | `60` | Maximum requests per window per user |

#### MCP Server Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `META_ADS_MCP_COMMAND` | No | `uvx` | Command to run Meta Ads MCP server |
| `META_ADS_MCP_ARGS` | No | `meta-ads-mcp` | Arguments for Meta Ads MCP server |
| `POSTGRES_MCP_COMMAND` | No | `postgres-mcp` | Command to run PostgreSQL MCP server |

#### Security Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` | No | `*` | CORS allowed origins (comma-separated) |

### Configuration Examples

#### Development Configuration

```bash
# .env.development
NODE_ENV=development
PORT=8443
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://bamboo:bamboo_password@localhost:5432/bamboo_mcp_dev
REDIS_URL=redis://localhost:6379/0

# Authentication
JWT_SECRET=development-secret-key-change-in-production
JWT_EXPIRES_IN=24h
FACEBOOK_APP_ID=your-dev-facebook-app-id
FACEBOOK_APP_SECRET=your-dev-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:8443/auth/facebook/callback

# Rate Limiting (more permissive for development)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# CORS (allow all origins in development)
CORS_ORIGIN=*
```

#### Production Configuration

```bash
# .env.production
NODE_ENV=production
PORT=8443
LOG_LEVEL=info

# Database (use connection pooling in production)
DATABASE_URL=postgresql://bamboo:secure_password@prod-db.example.com:5432/bamboo_mcp?sslmode=require
REDIS_URL=rediss://prod-redis.example.com:6380

# Authentication (use strong secrets)
JWT_SECRET=super-secure-random-string-with-at-least-32-characters
JWT_EXPIRES_IN=24h
FACEBOOK_APP_ID=your-prod-facebook-app-id
FACEBOOK_APP_SECRET=your-prod-facebook-app-secret
FACEBOOK_CALLBACK_URL=https://your-domain.com/auth/facebook/callback

# Rate Limiting (stricter for production)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# CORS (restrict to your domains)
CORS_ORIGIN=https://your-app.com,https://admin.your-app.com
```

### Configuration Validation

The application validates all configuration at startup. If any required variables are missing or invalid, the application will fail to start with detailed error messages:

```bash
Configuration validation failed: 
- "DATABASE_URL" is required
- "JWT_SECRET" length must be at least 32 characters long
- "FACEBOOK_APP_ID" is required
```

### Dynamic Configuration

Some configuration options can be updated at runtime through the admin API (when implemented):

- Rate limiting parameters
- Log levels
- CORS origins
- Cache TTL values

---

## Authentication

Bamboo MCP Gateway implements a comprehensive authentication system supporting multiple providers and enterprise security requirements.

### Authentication Flow

The authentication system follows OAuth 2.0 best practices with JWT token management:

1. **Initial Authentication**: Users authenticate via Facebook OAuth or provide Pipeboard API tokens
2. **Token Generation**: System generates JWT access tokens with configurable expiration
3. **Token Storage**: Tokens are cached in Redis with automatic expiration
4. **Request Authentication**: All MCP requests require valid JWT tokens in Authorization headers
5. **Token Refresh**: Automatic token refresh using stored refresh tokens

### Facebook OAuth Integration

#### Setup Facebook App

1. Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
2. Add Facebook Login product
3. Configure OAuth redirect URIs
4. Obtain App ID and App Secret

#### Configuration

```bash
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=https://your-domain.com/auth/facebook/callback
```

#### Authentication Endpoints

**POST /auth/facebook/token**
Authenticate using Facebook access token:

```bash
curl -X POST http://localhost:8443/auth/facebook/token \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "facebook-user-access-token"
  }'
```

Response:
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "userId": "facebook-user-id",
    "email": "user@example.com",
    "provider": "facebook"
  }
}
```

### Pipeboard Integration

For users with Pipeboard accounts, direct API token authentication is supported:

**POST /auth/pipeboard**
```bash
curl -X POST http://localhost:8443/auth/pipeboard \
  -H "Content-Type: application/json" \
  -d '{
    "pipeboardToken": "your-pipeboard-api-token"
  }'
```

### JWT Token Management

#### Token Structure

JWT tokens contain the following claims:

```json
{
  "userId": "user-identifier",
  "email": "user@example.com",
  "provider": "facebook|pipeboard",
  "iat": 1640995200,
  "exp": 1641081600
}
```

#### Token Validation

All MCP requests must include the JWT token in the Authorization header:

```bash
curl -H "Authorization: Bearer your-jwt-token" \
  http://localhost:8443/manifest
```

#### Token Refresh

**POST /auth/token/refresh**
```bash
curl -X POST http://localhost:8443/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token"
  }'
```

### Security Features

#### Rate Limiting

Authentication endpoints are protected by rate limiting:
- 5 attempts per minute per IP address
- 10 attempts per hour per user account
- Exponential backoff for repeated failures

#### Token Security

- JWT tokens are signed with HMAC SHA-256
- Tokens include expiration timestamps
- Refresh tokens are stored securely in Redis
- Automatic token blacklisting on logout

#### Session Management

- Sessions are stored in Redis with automatic expiration
- Concurrent session limits per user
- Session invalidation on password change
- Geographic session tracking (optional)

### Error Handling

Authentication errors return standardized error responses:

```json
{
  "error": "authentication_failed",
  "message": "Invalid or expired token",
  "code": 401,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

Common error codes:
- `401`: Invalid or expired token
- `403`: Insufficient permissions
- `429`: Rate limit exceeded
- `500`: Internal authentication error

---


## API Reference

Bamboo MCP Gateway implements the Model Context Protocol specification with additional gateway-specific endpoints for authentication and management.

### MCP Protocol Endpoints

#### GET /manifest

Returns the MCP server manifest describing available capabilities.

**Request:**
```bash
curl http://localhost:8443/manifest
```

**Response:**
```json
{
  "version": "0.2.0",
  "name": "bamboo-mcp",
  "description": "All-in-One MCP Gateway combining Meta Ads and PostgreSQL functionality",
  "author": {
    "name": "Jay Wong",
    "email": "jay@example.com"
  },
  "license": "MIT",
  "homepage": "https://github.com/example/bamboo-mcp",
  "repository": {
    "type": "git",
    "url": "https://github.com/example/bamboo-mcp.git"
  }
}
```

#### GET /sse

Establishes Server-Sent Events connection for real-time MCP communication.

**Headers:**
- `Authorization: Bearer <jwt-token>`
- `Accept: text/event-stream`

#### POST /stream

Main MCP communication endpoint for tool calls and resource requests.

**Headers:**
- `Authorization: Bearer <jwt-token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/call",
  "params": {
    "name": "ads.get_campaigns",
    "arguments": {
      "account_id": "act_123456789",
      "limit": 10
    }
  }
}
```

### Available Tools

#### Meta Ads Tools (ads.* prefix)

All Meta Ads MCP tools are available with the `ads.` prefix:

- `ads.get_campaigns` - Retrieve advertising campaigns
- `ads.create_campaign` - Create new advertising campaigns
- `ads.update_campaign` - Update existing campaigns
- `ads.get_adsets` - Retrieve ad sets
- `ads.create_adset` - Create new ad sets
- `ads.get_ads` - Retrieve individual ads
- `ads.create_ad` - Create new ads
- `ads.get_insights` - Retrieve performance insights
- `ads.get_audiences` - Retrieve custom audiences

#### PostgreSQL Tools (pg.* prefix)

All PostgreSQL MCP tools are available with the `pg.` prefix:

- `pg.execute_query` - Execute SQL queries
- `pg.describe_table` - Get table schema information
- `pg.list_tables` - List available tables
- `pg.get_table_data` - Retrieve table data with filtering

#### Gateway Tools

Company profile management tools:

- `get_company_profile` - Retrieve company profile data
- `update_company_profile` - Update company profile information
- `delete_company_profile` - Delete company profile
- `list_company_profiles` - List all company profiles

### Authentication Endpoints

#### POST /auth/facebook/token

Authenticate using Facebook access token.

**Request:**
```json
{
  "access_token": "facebook-access-token"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "provider": "facebook"
  }
}
```

#### POST /auth/pipeboard

Authenticate using Pipeboard API token.

**Request:**
```json
{
  "pipeboardToken": "pipeboard-api-token"
}
```

#### POST /auth/token/verify

Verify JWT token validity.

**Request:**
```json
{
  "token": "jwt-token"
}
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "provider": "facebook"
  }
}
```

#### POST /auth/logout

Invalidate current session and blacklist token.

**Headers:**
- `Authorization: Bearer <jwt-token>`

### Management Endpoints

#### GET /health

System health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "0.2.0",
  "uptime": 3600,
  "memory": {
    "rss": 52428800,
    "heapTotal": 29360128,
    "heapUsed": 20971520,
    "external": 1048576
  },
  "environment": "production"
}
```

### Error Responses

All endpoints return standardized error responses:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "details": "Additional error information"
    }
  }
}
```

Common error codes:
- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

---

## Deployment

Bamboo MCP Gateway supports multiple deployment strategies for different environments and requirements.

### Docker Deployment

#### Single Container

For simple deployments with external database services:

```bash
# Build image
docker build -t bamboo-mcp:latest .

# Run container
docker run -d \
  --name bamboo-mcp \
  -p 8443:8443 \
  -e DATABASE_URL="postgresql://user:pass@db-host:5432/bamboo_mcp" \
  -e REDIS_URL="redis://redis-host:6379" \
  -e JWT_SECRET="your-secret-key" \
  -e FACEBOOK_APP_ID="your-app-id" \
  -e FACEBOOK_APP_SECRET="your-app-secret" \
  bamboo-mcp:latest
```

#### Docker Compose

For complete local development environment:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

For production with external services:

```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d
```

### Cloud Deployment

#### Render.com

1. **Fork Repository**: Fork this repository to your GitHub account

2. **Create Render Account**: Sign up at [render.com](https://render.com)

3. **Connect Repository**: Connect your forked repository to Render

4. **Configure Environment Variables**:
   ```
   DATABASE_URL=<render-postgres-url>
   REDIS_URL=<render-redis-url>
   JWT_SECRET=<secure-random-string>
   FACEBOOK_APP_ID=<your-facebook-app-id>
   FACEBOOK_APP_SECRET=<your-facebook-app-secret>
   FACEBOOK_CALLBACK_URL=<your-render-url>/auth/facebook/callback
   PIPEBOARD_API_TOKEN=<your-pipeboard-token>
   ```

5. **Deploy**: Render will automatically deploy using the included `render.yaml`

#### AWS ECS

Deploy using AWS Elastic Container Service:

```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker build -t bamboo-mcp .
docker tag bamboo-mcp:latest <account>.dkr.ecr.us-east-1.amazonaws.com/bamboo-mcp:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/bamboo-mcp:latest

# Create ECS task definition and service
aws ecs create-task-definition --cli-input-json file://ecs-task-definition.json
aws ecs create-service --cluster bamboo-cluster --service-name bamboo-mcp --task-definition bamboo-mcp
```

#### Google Cloud Run

Deploy to Google Cloud Run:

```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/PROJECT-ID/bamboo-mcp

# Deploy to Cloud Run
gcloud run deploy bamboo-mcp \
  --image gcr.io/PROJECT-ID/bamboo-mcp \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="your-db-url",REDIS_URL="your-redis-url"
```

### Kubernetes Deployment

For enterprise Kubernetes deployments:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bamboo-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: bamboo-mcp
  template:
    metadata:
      labels:
        app: bamboo-mcp
    spec:
      containers:
      - name: bamboo-mcp
        image: bamboo-mcp:latest
        ports:
        - containerPort: 8443
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bamboo-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: bamboo-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8443
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8443
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Environment-Specific Configurations

#### Development

- Enable debug logging
- Relaxed rate limiting
- Local database connections
- Hot reloading enabled

#### Staging

- Production-like configuration
- Moderate rate limiting
- Staging database isolation
- Performance monitoring

#### Production

- Optimized for performance
- Strict rate limiting
- High availability setup
- Comprehensive monitoring
- Automated backups

### Monitoring and Observability

#### Health Checks

The `/health` endpoint provides comprehensive system status:

- Database connectivity
- Redis connectivity
- Upstream service status
- Memory usage
- System uptime

#### Logging

Structured JSON logging with configurable levels:

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "context": "MCPGateway",
  "message": "Tool call executed",
  "userId": "user-123",
  "toolName": "ads.get_campaigns",
  "duration": 250,
  "success": true
}
```

#### Metrics

Key metrics to monitor:

- Request rate and latency
- Authentication success/failure rates
- Tool call success rates
- Database query performance
- Cache hit rates
- Error rates by endpoint

---

## Development

### Local Development Setup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/your-org/bamboo-mcp.git
   cd bamboo-mcp
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Services**:
   ```bash
   # Start PostgreSQL and Redis
   docker-compose up -d postgres redis
   
   # Start development server
   npm run dev
   ```

### Development Scripts

```bash
# Development server with hot reload
npm run dev

# Build application
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

### Project Structure

```
bamboo-mcp/
├── src/
│   ├── auth/           # Authentication services
│   ├── core/           # Core gateway functionality
│   ├── proxy/          # Upstream proxy implementations
│   ├── resources/      # Resource and prompt management
│   ├── types/          # TypeScript type definitions
│   └── index.ts        # Application entry point
├── scripts/            # Deployment and utility scripts
├── docs/               # Documentation
├── examples/           # Configuration examples
├── docker-compose.yml  # Development environment
├── Dockerfile          # Container configuration
└── package.json        # Node.js configuration
```

### Contributing Guidelines

1. **Fork Repository**: Create a fork of the repository
2. **Create Branch**: Create a feature branch from main
3. **Make Changes**: Implement your changes with tests
4. **Run Tests**: Ensure all tests pass
5. **Submit PR**: Create a pull request with description

### Code Style

- Use TypeScript for all new code
- Follow ESLint configuration
- Use Prettier for code formatting
- Write comprehensive tests
- Document public APIs

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [GitHub Wiki](https://github.com/your-org/bamboo-mcp/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/bamboo-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/bamboo-mcp/discussions)
- **Email**: support@bamboo-mcp.com

---

*Built with ❤️ by the Bamboo MCP team*

