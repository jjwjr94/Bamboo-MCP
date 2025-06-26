# Meta Ads MCP Server: Production Deployment Guide

This document provides a comprehensive guide for deploying, configuring, and operating the Meta Ads MCP Server in a production environment. It is intended for DevOps engineers, SREs, and developers responsible for system deployment and maintenance.

This guide assumes you have a foundational understanding of Node.js applications, Docker, PostgreSQL, and cloud infrastructure concepts.

## Table of Contents

- [1. Core Deployment Principles](#1-core-deployment-principles)
- [2. Infrastructure Prerequisites](#2-infrastructure-prerequisites)
- [3. Environment Configuration](#3-environment-configuration)
  - [Database Configuration](#database-configuration)
  - [Meta Application Configuration](#meta-application-configuration)
  - [JWT Authentication Configuration](#jwt-authentication-configuration)
  - [Server Configuration](#server-configuration)
- [4. Database Setup](#4-database-setup)
  - [Step 1: Provision PostgreSQL](#step-1-provision-postgresql)
  - [Step 2: Create Application Role (Critical for RLS)](#step-2-create-application-role-critical-for-rls)
  - [Step 3: Run Migrations](#step-3-run-migrations)
  - [Step 4: Grant Table Permissions](#step-4-grant-table-permissions)
- [5. Building for Production](#5-building-for-production)
- [6. Deployment Scenarios](#6-deployment-scenarios)
  - [Scenario A: Docker Deployment (Recommended)](#scenario-a-docker-deployment-recommended)
  - [Scenario B: Cloud Platform Deployment (e.g., Render, Heroku)](#scenario-b-cloud-platform-deployment-eg-render-heroku)
- [7. Operational Procedures](#7-operational-procedures)
  - [Health Checks](#health-checks)
  - [Logging](#logging)
  - [Monitoring](#monitoring)
  - [Scaling Considerations](#scaling-considerations)
  - [Secrets Management](#secrets-management)
- [8. Security Hardening](#8-security-hardening)

## 1. Core Deployment Principles

The server's architecture dictates its deployment strategy. Understanding these principles is key to a successful deployment:

-   **Statelessness**: The application is designed to be stateless. Session data, OAuth state, and user context are persisted in the PostgreSQL database. This allows for robust horizontal scaling behind a load balancer.
-   **Configuration via Environment**: All configuration is managed through environment variables. No configuration is stored in the codebase. This follows the 12-Factor App methodology.
-   **Security by Design**: The architecture relies on database-level Row-Level Security (RLS) for data isolation. Proper database role setup is **not optional** and is critical for security.
-   **Separation of Concerns**: The build process (`pnpm build`) transpiles TypeScript to optimized JavaScript in the `dist/` directory. The production environment should only run the code from `dist/`.

## 2. Infrastructure Prerequisites

Before deploying, ensure the following components are provisioned:

1.  **PostgreSQL Database**: Version 15 or higher is recommended. Use a managed service like AWS RDS, Google Cloud SQL, or Render Postgres for reliability, backups, and scaling.
2.  **Node.js Runtime**: A Node.js v18+ environment. This will typically be provided by a Docker container or a PaaS environment.
3.  **Reverse Proxy / Load Balancer**: A component like Nginx, Caddy, or a cloud-native load balancer (e.g., AWS ALB, Cloudflare) is required to handle TLS (HTTPS) termination and route traffic to the application instances.
4.  **Secrets Management Service**: A secure system for managing environment variables, such as AWS Secrets Manager, HashiCorp Vault, Doppler, or your cloud provider's integrated solution.
5.  **Log Aggregation Service**: A centralized logging platform like Datadog, Splunk, Logz.io, or CloudWatch Logs to collect and analyze the application's structured JSON logs.

## 3. Environment Configuration

The server is configured entirely through environment variables. The following variables **must** be set in the production environment.

### Database Configuration

| Variable                  | Description                                                                 | Example                                                         |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`            | **Required.** The full connection string for your PostgreSQL database.      | `postgresql://test_user:test_password@host:5432/bamboo_test`    |
| `DB_POOL_MAX`             | Max number of connections in the pool. Default: `10`.                       | `20`                                                            |
| `DB_POOL_IDLE_TIMEOUT`    | Idle connection timeout in seconds. Default: `30`.                          | `60`                                                            |
| `DB_POOL_CONNECT_TIMEOUT` | Connection attempt timeout in seconds. Default: `10`.                       | `15`                                                            |
| `DB_STATEMENT_TIMEOUT`    | Timeout for individual SQL statements in milliseconds. Default: `30000`.    | `60000`                                                         |
| `DB_POOL_MAX_LIFETIME`    | Max lifetime of a connection in seconds. Default: `1800` (30 mins).         | `3600`                                                          |

### Meta Application Configuration

| Variable                 | Description                                                                                                   | Example                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `FACEBOOK_APP_ID`        | **Required.** The ID of your Meta for Developers application.                                                 | `123456789012345`                                       |
| `FACEBOOK_APP_SECRET`    | **Required.** The secret for your Meta application.                                                           | `a1b2c3d4e5f6...`                                        |
| `FACEBOOK_CALLBACK_URL`  | **Required.** The absolute URL for the OAuth callback. Must match a "Valid OAuth Redirect URI" in your app dashboard. | `https://mcp.yourdomain.com/oauth/callback`             |
| `FACEBOOK_OAUTH_SCOPES`  | **Required.** Comma-separated list of Meta permissions the server will request.                               | `ads_management,ads_read,read_insights,business_management` |
| `META_API_VERSION`       | The Meta Graph API version to use.                                                                            | `v20.0`                                                 |

### JWT Authentication Configuration

| Variable          | Description                                                                          | Example                                |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `JWT_PRIVATE_KEY` | **Required.** The private JWK key (in PKCS8 format) used for signing internal JWTs.    | `'{"kty":"OKP", "crv":"Ed25519",...}'`  |
| `JWT_PUBLIC_KEY`  | **Required.** The corresponding public JWK key for verifying JWTs.                      | `'{"kty":"OKP", "crv":"Ed25519",...}'`  |
| `JWT_EXPIRES_IN`  | The expiration time for access tokens (JWTs).                                        | `1h`                                   |

> **To generate a key pair**, use the `jose` utility: `npx jose-util-generate-key-pair EdDSA`

### Server Configuration

| Variable              | Description                                                                                        | Example                            |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `BASE_URL`            | **Required.** The public base URL where the server is hosted. Used for issuer validation in JWTs.    | `https://mcp.yourdomain.com`       |
| `PORT`                | The port the Fastify server will listen on. Default: `3000`.                                       | `8080`                             |
| `ALLOWED_ORIGINS`     | **Required for security.** A comma-separated list of origins allowed for CORS requests.            | `https://app.yourdomain.com`       |
| `MCP_REQUEST_TIMEOUT` | Timeout in milliseconds for processing a single MCP request. Default: `180000` (3 minutes).        | `300000`                           |

## 4. Database Setup

Correct database setup is critical, especially for enabling Row-Level Security (RLS). Follow these steps precisely.

### Step 1: Provision PostgreSQL

Provision a PostgreSQL (v15+) database instance on your cloud provider. Ensure it is in a private network, and only allow connections from your application servers.

### Step 2: Create Application Role (Critical for RLS)

Before running migrations, you must create a dedicated, unprivileged role that the application will use for all its queries. This role is essential for RLS to function correctly.

Connect to your database as a superuser and run the following SQL:

```sql
-- Create the role that the application will use to connect.
-- It has login privileges but no other permissions initially.
CREATE ROLE app_user WITH LOGIN PASSWORD 'your_secure_password';

-- Grant the main database user (the one in your DATABASE_URL)
-- the ability to switch to the app_user role.
GRANT app_user TO your_main_database_user;
```

### Step 3: Run Migrations

With the `app_user` role created, you can now apply the database schema. Migrations should be run as part of your deployment pipeline, before the new application version is deployed.

```bash
# Ensure your DATABASE_URL environment variable is set
pnpm db:migrate
```

This command will connect to your database and apply all migrations found in `src/db/migrations`, creating the necessary tables and policies.

### Step 4: Grant Table Permissions

After migrations have created the tables, you must grant the `app_user` role permissions to access them.

Connect to your database as a superuser and run:

```sql
-- Grant basic DML permissions on all current tables in the public schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Grant usage on all sequences (for auto-incrementing IDs).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Ensure that any new tables created in the future will automatically get these permissions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

Your database is now ready for the application.

## 5. Building for Production

To create a production-ready build, run the following commands in your CI/CD environment:

```bash
# 1. Install all dependencies (including devDependencies for building)
pnpm install --frozen-lockfile --prod=false

# 2. Run the build script
pnpm build
```

This process will:
1.  Generate Zod schemas from the Meta SDK (`scripts/generateSchemas.ts`).
2.  Compile all TypeScript source from `src/` into JavaScript in the `dist/` directory.
3.  Copy necessary assets (like prompt `.md` files and `public/` assets) into `dist/`.

The `dist/` directory, along with the production `node_modules`, are the only artifacts needed to run the server.

## 6. Deployment Scenarios

### Scenario A: Docker Deployment (Recommended)

Using Docker is the recommended approach as it creates a portable, consistent, and secure environment.

**1. Create a `Dockerfile`**

Use a multi-stage build to create a small and secure production image. Place this `Dockerfile` in the project root:

```dockerfile
# ---- Base Stage ----
FROM node:18-alpine AS base
WORKDIR /usr/src/app
# Install pnpm
RUN npm install -g pnpm@10

# ---- Dependencies Stage ----
FROM base AS deps
# Copy only package files and install all dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ---- Builder Stage ----
FROM deps AS builder
# Copy the rest of the source code
COPY . .
# Generate schemas and build the application
RUN pnpm build

# ---- Production Stage ----
FROM base AS production
# Copy necessary artifacts from previous stages
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json .

# Set a non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Set the default command to start the server
CMD ["node", "dist/index.js"]
```

**2. Build and Run the Container**

```bash
# Build the Docker image
docker build -t bamboo-mcp-server:latest .

# Create a .env.production file with your production environment variables
# Example:
# DATABASE_URL=...
# JWT_PRIVATE_KEY=...

# Run the container, passing the environment file
docker run --name bamboo-mcp --rm -d \
  --env-file .env.production \
  -p 3000:3000 \
  bamboo-mcp-server:latest
```

### Scenario B: Cloud Platform Deployment (e.g., Render, Heroku)

For PaaS platforms, you can typically deploy directly from your Git repository.

1.  **Connect Your Git Repository**: Link your hosting provider to your Git repo.
2.  **Configure Build Settings**:
    -   **Build Command**: `pnpm install --frozen-lockfile --prod=false && pnpm build`
    -   **Start Command**: `pnpm start` or `node dist/index.js`
3.  **Set Environment Variables**: Use the platform's dashboard to securely set all the environment variables listed in [Section 3](#3-environment-configuration).
4.  **Database**: Provision a managed PostgreSQL database through the platform's addons and use the provided `DATABASE_URL` in your environment variables.
5.  **Run Migrations**: Use the platform's one-off job or release phase feature to run `pnpm db:migrate` after a successful build but before the new version goes live.

## 7. Operational Procedures

### Health Checks

The server exposes a health check endpoint at `/health`.

-   **Endpoint**: `GET /health`
-   **Success Response (200 OK)**:
    ```json
    {
      "status": "healthy",
      "timestamp": "...",
      "version": "0.1.0",
      "database": "connected",
      "mcp": "ready"
    }
    ```
-   **Failure Response (503 Service Unavailable)**: Returned if the database connection fails.
-   **Usage**: Configure your load balancer or container orchestrator (e.g., Kubernetes, ECS) to use this endpoint to check instance health and manage traffic routing.

### Logging

-   **Format**: All logs are structured JSON written to `stderr`.
-   **Action**: Configure your deployment environment to collect `stderr` streams and forward them to a log aggregation service.
-   **Key Events to Monitor**:
    -   `level: "error"`: General application errors.
    -   `message: "Unhandled Rejection"`: Critical unhandled promise rejections.
    -   `message: "SUSPICIOUS_ACTIVITY"`: Security-relevant events like data redaction.
    -   `message: "AUTH_ATTEMPT"`: User authentication attempts.

### Monitoring

Beyond basic health checks, monitor these key application metrics:

-   **Request Latency**: p95 and p99 latency for MCP `tools/call` requests.
-   **Error Rate**: The rate of HTTP 5xx responses.
-   **Database Performance**: Connection pool usage (`DB_POOL_MAX`), query latency, and CPU/memory utilization of the database instance.
-   **Resource Utilization**: CPU and memory usage of application instances.

### Scaling Considerations

-   **Horizontal Scaling**: The application is stateless and can be scaled horizontally by adding more instances. The primary scaling bottleneck will be the database.
-   **Database Scaling**: Monitor database connection limits. You may need to increase the size of your managed database instance (vertical scaling) or adjust the application's connection pool size (`DB_POOL_MAX`) to handle increased load.

### Secrets Management

**Do not** commit `.env` files or store production secrets in plain text. Use a dedicated secrets management service:

-   **AWS**: Secrets Manager or Parameter Store.
-   **Google Cloud**: Secret Manager.
-   **HashiCorp**: Vault.
-   Inject secrets into the application environment at runtime.

## 8. Security Hardening

-   **HTTPS Enforcement**: The application does not handle TLS termination. Your load balancer or reverse proxy **must** be configured to terminate HTTPS and only forward traffic to the application over a private network.
-   **CORS Configuration**: The `ALLOWED_ORIGINS` environment variable **must** be set to a strict allow-list of your front-end application's domains. A wildcard (`*`) is insecure and should not be used in production.
-   **Database Security**: Restrict database network access to only allow connections from your application's private IP addresses. Do not expose the database to the public internet.

This concludes the deployment guide. By following these procedures, you can deploy a secure, scalable, and maintainable instance of the Meta Ads MCP Server.

**Relevant Files:** `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `src/index.ts`, `test/setup.ts`