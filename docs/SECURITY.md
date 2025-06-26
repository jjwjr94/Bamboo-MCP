# Meta Ads MCP Server: Security Overview

This document provides a detailed overview of the security architecture, policies, and practices implemented in the Meta Ads MCP Server. It is intended for security engineers, developers, and DevOps teams to understand the measures taken to ensure the confidentiality, integrity, and availability of the service and its data.

Our security philosophy is grounded in **Security by Design** and **Defense in Depth**. Security is not an afterthought but a foundational component of the architecture, with multiple layers of protection at the transport, application, and data layers.

## Table of Contents

- [Core Security Principles](#core-security-principles)
- [Authentication and Authorization](#authentication-and-authorization)
  - [Client Authentication: OAuth 2.1 + PKCE Flow](#client-authentication-oauth-21--pkce-flow)
  - [Internal Authorization: JWTs](#internal-authorization-jwts)
- [Data Protection and Isolation](#data-protection-and-isolation)
  - [Database Row-Level Security (RLS)](#database-row-level-security-rls)
  - [Data in Transit](#data-in-transit)
  - [Data at Rest](#data-at-rest)
- [API and Application Security](#api-and-application-security)
  - [Threat Model and Mitigations](#threat-model-and-mitigations)
  - [Secure Asset Uploads](#secure-asset-uploads)
  - [Input Validation](#input-validation)
  - [Rate Limiting and Resilience](#rate-limiting-and-resilience)
- [Security Best Practices](#security-best-practices)
- [Deployment Considerations](#deployment-considerations)
- [Vulnerability Reporting](#vulnerability-reporting)

## Core Security Principles

Our architecture is built on these core principles:

1.  **Security by Design**: Every feature and component is designed with security as a primary requirement. We use modern, industry-standard protocols and a layered security model.
2.  **Principle of Least Privilege**: Users and systems are only granted the minimum access required to perform their functions. This is enforced at both the application and database levels.
3.  **Data Isolation**: As a multi-tenant service, the most critical security guarantee is that no user can access another user's data. This is enforced at the database level using PostgreSQL's Row-Level Security (RLS).
4.  **Resilience**: The system is designed to be resilient against external API failures and common web-based attacks, ensuring service stability and availability.
5.  **Auditability and Traceability**: All security-sensitive operations are logged to provide a clear audit trail for security analysis and incident response.

## Authentication and Authorization

The server employs a robust, two-token system to manage access:
1.  **Meta OAuth 2.1 Token**: A long-lived token from Meta, obtained via a secure user-facing flow. This token **never leaves the server** and is securely stored in the database.
2.  **Internal JWT**: A short-lived, stateless JSON Web Token signed by the server. This is the only token that clients interact with, providing a secure, abstract authorization layer.

### Client Authentication: OAuth 2.1 + PKCE Flow

The user and client authentication process follows the latest OAuth 2.1 standards, including Proof Key for Code Exchange (PKCE) to mitigate authorization code interception attacks. The flow is orchestrated by `MetaServerAuthProvider` (`src/auth/MetaServerAuthProvider.ts`).

1.  **Authorization Request**: The client initiates the flow by redirecting the user to the server's `/oauth/authorize` endpoint. The client provides a `code_challenge` for PKCE.
2.  **Session Creation**: The server generates a unique, unguessable `state` parameter. It then uses the `SessionManager` (`src/auth/SessionManager.ts`) to create a record in the `oauth_sessions` database table, storing the client's PKCE challenge, redirect URI, and the requested scopes. This database-backed session store is critical for our stateless, horizontally-scalable architecture.
3.  **Meta Redirect**: The server redirects the user to Meta's standard OAuth dialog, passing along the required scopes and our server's unique `state` parameter.
4.  **User Consent & Callback**: After the user grants consent, Meta redirects them to our server's `/oauth/callback` endpoint with a single-use Meta authorization `code`.
5.  **Code Exchange & Internal Token Issuance**:
    *   The server atomically retrieves and deletes the session data from the `oauth_sessions` table using the `state` parameter, preventing replay attacks.
    *   It securely exchanges the Meta `code` for a Meta access token. This token is immediately stored in the encrypted `oauth_tokens` database table and is never exposed to the client.
    *   A new internal, short-lived JWT is created and signed using our private EdDSA key.
    *   A secure, single-use authorization code is generated and stored in the `oauth_temp_auth_codes` table, associated with the internal JWT and the client's PKCE challenge.
    *   The user is redirected back to the client's `redirect_uri` with our server's authorization code.
6.  **Final Token Exchange**: The client sends our authorization code and the PKCE `code_verifier` to the server's token endpoint. The server validates the code and verifies that the `code_verifier` matches the stored `code_challenge`. Upon success, the `TokenManager` (`src/auth/TokenManager.ts`) creates a long-lived, hashed refresh token. The JWT (as the `access_token`) and the raw refresh token are returned to the client.

### Internal Authorization: JWTs

All authenticated API calls to the MCP server use an internal JWT, providing a secure and stateless authorization mechanism.

*   **Standard & Algorithm**: We use JSON Web Tokens (JWTs) signed with the **EdDSA (Ed25519)** algorithm, as implemented by the `jose` library (`src/auth/jwt.ts`). EdDSA is chosen for its high performance and strong security guarantees compared to RSA.
*   **Claims**: Each JWT contains the following critical claims:
    *   `userId`: Our internal, stable UUID for the user. This is the key used for RLS.
    *   `clientId`: The MCP client's unique identifier.
    *   `scopes`: The array of Meta permissions granted by the user during the OAuth flow.
    *   `exp`, `iat`, `iss`, `aud`: Standard JWT claims for expiration, issuance time, issuer, and audience, which are all strictly validated on every request.
*   **Lifecycle and Storage**:
    *   Access tokens (JWTs) are **short-lived** (e.g., 1 hour) and are not stored on the server.
    *   Refresh tokens are long-lived and used to obtain new JWTs. They are stored in the `oauth_refresh_tokens` table and are **hashed using SHA-256**, preventing direct token theft from the database.
    *   A secure **token rotation** strategy is implemented, where each use of a refresh token invalidates it and issues a new one, mitigating the risk of token leakage.

## Data Protection and Isolation

Our primary data protection strategy is to enforce strict tenant isolation at the database level, ensuring that one user's data is completely inaccessible to another.

### Database Row-Level Security (RLS)

This is the cornerstone of our multi-tenant security model, implemented in PostgreSQL and enforced by our application code.

*   **Mechanism**: We leverage PostgreSQL's native Row-Level Security. Every table containing user-specific data (e.g., `users`, `oauth_tokens`, `ad_accounts`) has a strict RLS policy attached (`src/db/schema.ts`).
*   **Enforcement**:
    1.  A dedicated, unprivileged database role, `app_user`, is used for all application queries. This role has no default access to tables.
    2.  The RLS policies grant access only when the row's `user_id` column matches a session-specific variable (`app.current_user_id`).
    3.  Every database query is executed within a transaction managed by the `withUserContext(userId, ...)` function (`src/db/client.ts`). This wrapper function first sets the user context (`SET LOCAL app.current_user_id = :userId`) before executing the query.
*   **Guarantee**: This provides a powerful, database-enforced guarantee that **no user can ever access another user's data**, regardless of any potential bugs in the application's business logic. It serves as a critical fail-safe against data leakage.

### Data in Transit

All communication between clients, the server, and the Meta API is secured using **TLS 1.2 or higher**. The server is configured with the `helmet` middleware, which sets security-related HTTP headers like `Strict-Transport-Security` to enforce HTTPS.

### Data at Rest

*   **Meta Tokens**: The user's Meta access token is stored in the `oauth_tokens` table. The production database instance must be configured with **encryption at rest**.
*   **Refresh Tokens**: Our internal refresh tokens are **hashed using SHA-256** before being stored in the `oauth_refresh_tokens` table, making them non-recoverable in the event of a database breach.
*   **Secrets**: All application secrets, including `JWT_PRIVATE_KEY`, `FACEBOOK_APP_SECRET`, and database credentials, are managed via environment variables and must be injected securely into the production environment using a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).

## API and Application Security

### Threat Model and Mitigations

| Threat                                     | Mitigation                                                                                                                                                                                                                                                                         |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unauthorized API Access**                | OAuth 2.1 with PKCE for client authentication. All tool calls are authorized with short-lived, EdDSA-signed JWTs. Refresh tokens are hashed and securely rotated.                                                                                                                      |
| **Broken Object Level Authorization (BOLA/IDOR)** | **Row-Level Security (RLS)** provides the primary defense, ensuring users can only access database rows they own. This prevents enumeration or direct reference attacks at the data layer.                                                                                      |
| **Multi-Tenant Data Leakage**              | RLS provides a hard guarantee of data isolation between users. The `withUserContext` wrapper ensures every query is correctly scoped.                                                                                                                                                |
| **Sensitive Data Exposure**                | The `redactSensitiveData` utility (`src/utils/securityUtils.ts`) proactively scrubs sensitive keys (`token`, `secret`, `password`, etc.) from logs and API responses. The `removeUnderscoreProperties` utility prevents internal SDK objects from leaking.                               |
| **Cross-Site Scripting (XSS)**             | All dynamic HTML content (e.g., asset upload pages) is sanitized using the `escapeHtml` utility. A strict **Content Security Policy (CSP)** is enforced via the `helmet` middleware (`src/index.ts`) to restrict script sources and prevent inline execution.                              |
| **Cross-Site Request Forgery (CSRF)**      | The use of JWTs in the `Authorization` header is the primary defense against CSRF for API calls. The OAuth 2.1 flow is protected by the mandatory `state` parameter, which is validated on the server.                                                                                |
| **Insecure File Uploads**                  | A secure, two-step upload flow is used. A unique, unguessable, and short-lived UUID is generated for each upload session. File types are validated on the backend against a strict allow-list of MIME types (`src/utils/mimeTypeDetector.ts`). Files are streamed directly to Meta's API. |
| **Dependency Vulnerabilities**             | The project uses `pnpm` for dependency management. Regular audits using `pnpm audit` are recommended to identify and patch vulnerable dependencies.                                                                                                                                     |

### Secure Asset Uploads

The server implements a secure two-step workflow for uploading creative assets, designed to work around the protocol limitations of AI agents that cannot send file data directly.

1.  **Request**: The `initiate_asset_upload` tool is called. It generates a unique, unguessable UUID and stores it in the `creative_asset_uploads` table, associated with the user and an expiry timestamp.
2.  **Upload**: A secure, single-use URL containing this UUID is returned. The user uploads the file to this URL. The endpoint does not require a JWT; its security relies on the unguessable and ephemeral nature of the UUID.
3.  **Processing**: The backend validates the upload session, then streams the file directly to Meta's API after validating its MIME type.
4.  **Status Check**: The client polls the `get_asset_upload_status` tool with the `uploadId` to get the final `metaAssetId`.

### Input Validation

All incoming data from the Meta API and tool call inputs are rigorously validated using **Zod schemas**. The `scripts/generateSchemas.js` script automatically generates these schemas from the Meta SDK, ensuring our server's data models are always synchronized with the API and protected against malformed or unexpected data.

### Deletion Safety and Data Loss Prevention

The server implements comprehensive safety mechanisms to prevent accidental data loss from destructive operations:

#### Multi-Layered Deletion Protection

1.  **Client-Side Requirements**: All deletion tool descriptions explicitly require that users must be prompted for confirmation before the tool is called, establishing a required workflow pattern for all clients.

2.  **Standardized Validation**: All deletion operations use a common `DeletionConfirmationSchema` (`src/mcp/registries/registryHelper.ts`) that enforces strict validation:
    ```typescript
    // Must be exactly boolean literal `true`, not truthy values
    confirmPermanentDelete: z.literal(true)
    ```

3.  **Pre-API Validation**: Confirmation validation occurs **before** any Meta API calls, ensuring:
    *   Fast failure with clear error messages
    *   No unintended side effects from invalid requests
    *   Consistent error responses across all deletion operations

4.  **Defense in Depth**: Each handler implements additional validation schemas that include the common deletion confirmation, providing multiple validation layers:
    ```typescript
    // Example from deletion handlers
    const DeleteValidationSchema = z.object({
      confirmPermanentDelete: DeletionConfirmationSchema,
      // ... other validations
    });
    ```

#### Validation Security Benefits

*   **Protection Against Automation Errors**: Prevents accidental bulk deletions from misconfigured automation scripts
*   **Clear Error Messaging**: Standardized validation errors guide users to correct their requests
*   **Audit Trail**: All deletion attempts (successful and failed) are logged for security analysis
*   **Type Safety**: Runtime validation prevents type coercion attacks (e.g., passing `"true"` string instead of boolean `true`)

This approach ensures that destructive operations require explicit, intentional user action while maintaining a consistent and secure developer experience.

### Rate Limiting and Resilience

The server implements resilience patterns to protect against and gracefully handle external API failures.

*   **Per-Request Policies**: A new resilience policy (`src/utils/resiliencePolicy.ts`) is created for each API call, wrapping it in a request-scoped **Circuit Breaker** and **Exponential Backoff Retry** policy.
*   **Isolation**: This per-request approach is a key security and stability feature. It ensures that a series of failures affecting one user (e.g., due to an invalid token or hitting a rate limit) will not open the circuit for the entire application, preserving service availability for all other users.

## Security Best Practices

*   **Secrets Management**: Secrets are managed via `.env` files and should be injected into production environments using a secure secret management system.
*   **Error Handling**: Errors are handled gracefully. Standardized, structured error responses are returned to clients (`src/mcp/errorHandler.ts`), avoiding the leakage of sensitive stack traces or internal system details.
*   **Dependency Auditing**: `pnpm audit` should be run regularly to check for vulnerabilities in third-party dependencies.

## Deployment Considerations

*   **Environment Variables**: The production environment must have all variables from `.env.example` configured securely. `JWT_PRIVATE_KEY` and `FACEBOOK_APP_SECRET` are particularly critical.
*   **Database**: The PostgreSQL instance should be configured with encryption at rest, and network access should be restricted to the application servers only.
*   **HTTPS**: The server must be deployed behind a load balancer or reverse proxy that terminates TLS and enforces HTTPS connections.
*   **CORS**: The `ALLOWED_ORIGINS` environment variable must be configured with a strict allow-list of domains that are permitted to access the API. A wildcard (`*`) configuration is highly discouraged in production.

## Vulnerability Reporting

We take security seriously and appreciate the community's help in keeping our service safe. If you discover a security vulnerability, please report it to us privately.

**Please do not disclose the vulnerability publicly until it has been addressed.**

To report a vulnerability, please email **`security@example.com`** (replace with a real security contact) with the following details:
- A clear description of the vulnerability.
- Steps to reproduce the issue.
- The potential impact of the vulnerability.

We will make every effort to acknowledge your report within 48 hours and provide a timeline for a fix. We appreciate your efforts and responsible disclosure.

---
**Relevant Files:**
*   `docs/ARCHITECTURE.md`
*   `src/auth/MetaServerAuthProvider.ts`
*   `src/auth/jwt.ts`
*   `src/db/schema.ts`
*   `src/db/client.ts`
*   `src/utils/securityUtils.ts`
*   `src/utils/uploadTemplates.ts`
*   `src/tools/meta/adCreativeUploadHandler.ts`
*   `src/index.ts`