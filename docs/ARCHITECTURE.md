# Meta Ads MCP Server: Architecture Overview

This document provides a comprehensive overview of the Meta Ads MCP Server's architecture. It is intended for software engineers and technical stakeholders to understand the system's design, component interactions, and the rationale behind key architectural decisions.

## 1. Introduction

The Meta Ads MCP Server is an enterprise-grade service designed to provide secure, resilient, and scalable access to the Meta Marketing API. It serves as a bridge between AI agents (or other automated systems) and the complex world of Meta advertising, exposing the API's vast capabilities through a stable, tool-based interface defined by the Model Context Protocol (MCP).

The primary goal of this server is to abstract away the inherent complexities of the Meta API, such as:

*   Intricate OAuth 2.1 authentication and token management.
*   Inconsistent error patterns and transient failures.
*   The nuanced and often-problematic requirement for "business context" in API calls.
*   Complex data structures and pagination logic.

By handling these challenges, the server allows developers and AI agents to focus on building powerful advertising automation workflows with a simple, secure, and predictable set of tools.

## 2. Core Architectural Principles

The system is built upon four core principles that guide its design and evolution:

1.  **Security by Design**: Security is not an afterthought but a foundational layer. This is achieved through a multi-layered approach including modern authentication protocols (OAuth 2.1 + PKCE), cryptographically secure internal tokens (JWT with EdDSA), and robust data isolation at the database level using Row-Level Security (RLS).
2.  **Resilience and Stability**: The Meta API is known for transient failures and rate limiting. Our server is designed to be a resilient shield against this instability. We employ advanced resilience patterns like per-request Circuit Breakers and Exponential Backoff to handle API failures gracefully, ensuring that issues affecting one user do not impact the entire service.
3.  **Scalability and Performance**: The server is architected to be stateless, enabling horizontal scaling. Expensive operations are handled by shared singleton services, while individual requests are processed in isolation to ensure stability and prevent resource contention. Session state is managed in the database, not in memory.
4.  **Maintainability & Developer Experience**: A clear, layered architecture separates concerns, making the system easier to understand, maintain, and extend. We prioritize developer experience through features like modular tool registries and automated schema generation, which drastically reduces the effort required to stay in sync with the ever-changing Meta API.

## 3. System Architecture

The server is designed with a layered architecture, where each layer has a distinct responsibility. This separation of concerns is crucial for maintainability and testing.

```text
+----------------------------------+
|         MCP Client (AI)          |
+----------------------------------+
             ^      | (MCP over HTTP/Stdio)
             |      v
+----------------------------------+
|    Transport Layer (Fastify)     |  <-- src/index.ts, src/mcp/http.ts
| - Handles HTTP, CORS, Security   |
| - JWT Verification               |
+----------------------------------+
             |
+----------------------------------+
|           MCP Layer              |  <-- src/mcp/server.ts
| - BambooMCPServer (per-request)  |
| - Tool/Prompt/Resource Registries|  <-- src/mcp/registries/
| - Request/Response Formatting    |  <-- src/mcp/responseHelper.ts,errorHandler.ts
+----------------------------------+
             |
+----------------------------------+
|  Business Logic (Tool Handlers)  |  <-- src/tools/meta/
| - Encapsulates Meta API calls    |
| - MetaToolsHandler Facade        |
| - Business Context Management    |  <-- src/utils/businessContext*.ts
| - Resilience Policy Execution    |  <-- src/utils/resiliencePolicy.ts
+----------------------------------+
             ^      | (Meta Marketing API)
             |      v
+----------------------------------+
|    External: Meta Graph API      |
+----------------------------------+

+----------------------------------+
|   Authentication & Authz Layer   |  <-- src/auth/
| - OAuth 2.1 + PKCE Flow          |
| - JWT Management                 |
| - Session & Token Management     |
+----------------------------------+
             |
+----------------------------------+
|   Data Access Layer (Drizzle)    |  <-- src/db/
| - PostgreSQL with RLS            |
| - Schema, Migrations             |
| - `withUserContext` for RLS      |
+----------------------------------+
```

## 4. Component Deep Dive & Interaction Flows

### 4.1. Request Lifecycle (tools/call)

A typical `tools/call` request flows through the system as follows:

1.  **Transport Layer**: An HTTP POST request arrives at the Fastify server (`src/index.ts`). The `src/mcp/http.ts` transport handler extracts the JWT from the `Authorization` header.
2.  **Authentication**: The JWT is verified using our public EdDSA key (`src/auth/jwt.ts`). If valid, the request proceeds. If not, a 401 Unauthorized response is sent.
3.  **MCP Server Instantiation**: A new, lightweight `BambooMCPServer` instance is created for this single request (`src/mcp/server.ts`). This is a key design decision for request isolation, preventing state leakage. This is made performant by leveraging shared singleton services managed by `CoreServices` (`src/mcp/coreServices.ts`).
4.  **Tool Dispatch**: The MCP SDK routes the request to the appropriate tool registered in our `ToolRegistry` (`src/mcp/registries/toolRegistry.ts`).
5.  **Business Logic Execution**: The call is delegated to the `MetaToolsHandler` facade (`src/tools/meta/toolsHandler.ts`), which in turn calls the specific handler (e.g., `MetaCampaignHandler`).
6.  **Resilient API Call**: The handler uses `handleMetaApiCall` (`src/tools/meta/api.ts`) to wrap the Meta SDK call. This wrapper applies a **request-scoped resilience policy** (`src/utils/resiliencePolicy.ts`), providing circuit breaker and retry capabilities for this call only.
7.  **Response Handling**:
    *   On success, the response from the Meta API is validated against an auto-generated Zod schema. `createMcpSuccessResult` (`src/mcp/responseHelper.ts`) formats the response, sanitizing it by redacting sensitive fields and removing internal SDK properties.
    *   On failure, `createMcpErrorResult` (`src/mcp/errorHandler.ts`) catches the error, classifies it, and generates a standardized, actionable error response for the client.
8.  **Cleanup**: Upon request completion or disconnection, the per-request `BambooMCPServer` instance and its resources are automatically cleaned up.

### 4.2. Authentication Flow (OAuth 2.1 + PKCE)

The server implements a robust OAuth 2.1 flow with PKCE to securely authorize clients on behalf of a user. The entire flow is orchestrated by `MetaServerAuthProvider` (`src/auth/MetaServerAuthProvider.ts`).

**Flow Description:**

1.  **Authorization Request**: A client initiates the flow by directing the user to the server's `/oauth/authorize` endpoint.
2.  **Session Creation**: `MetaServerAuthProvider` generates a unique `state` parameter. It then uses `SessionManager` (`src/auth/SessionManager.ts`) to store the client's PKCE challenge, redirect URI, and granted scopes in the `oauth_sessions` database table, keyed by the `state`. This database-backed session store is critical for our stateless, scalable architecture.
3.  **Meta Redirect**: The server redirects the user to Meta's OAuth dialog, passing along the required scopes.
4.  **User Consent & Callback**: The user grants consent on Meta. Meta redirects back to our server's `/oauth/callback` with an authorization `code` and our original `state`.
5.  **Code Exchange & Token Issuance**:
    *   `handleCallback` atomically retrieves and deletes the session data using the `state` parameter.
    *   It exchanges the Meta `code` for a Meta `access_token`.
    *   It securely stores this Meta token in the `oauth_tokens` table.
    *   It creates a secure, internal **JWT** signed with our private EdDSA key. This JWT contains our internal `userId`, the `clientId`, and the `scopes` the user granted.
    *   It generates a new, single-use authorization code and stores it in the `oauth_temp_auth_codes` table, along with the internal JWT.
    *   Finally, it redirects the user back to the client's `redirect_uri` with our single-use code.
6.  **Final Token Exchange**: The client sends our single-use code back to the server. `exchangeAuthorizationCode` validates it, retrieves the associated JWT, and uses `TokenManager` (`src/auth/TokenManager.ts`) to create and store a long-lived, hashed refresh token. The JWT (as the access token) and the new refresh token are returned to the client.

This flow ensures that Meta's access tokens never leave our server. The client interacts with our tools using our short-lived internal JWT, which we can rotate and manage independently.

### 4.3. Database Design & Row-Level Security (RLS)

The database is the system's source of truth, designed for security and data integrity.

*   **Technology**: PostgreSQL with Drizzle ORM.
*   **Key Tables**:
    *   `users`: Stores our internal user record, linked to a `facebook_user_id`.
    *   `oauth_clients`: A registry of all authorized MCP clients.
    *   `oauth_tokens`: Securely stores the user's Meta access token, with a `UNIQUE` constraint on `user_id`.
    *   `oauth_refresh_tokens`: Stores our internal, hashed refresh tokens for long-term session management.
    *   `ad_accounts`: Caches a user's ad accounts and, critically, their associated `business_id`.
    *   `creative_asset_uploads`: Manages the state for the two-step creative asset upload flow.
*   **Data Isolation with RLS**: The cornerstone of our multi-tenant security model is PostgreSQL's Row-Level Security.
    *   We define an `app_user` role in the database with strict access policies on all user-specific tables (`src/db/schema.ts`).
    *   Every database query is wrapped in the `withUserContext(userId, ...)` function (`src/db/client.ts`).
    *   This function begins a transaction and executes `SET LOCAL app.current_user_id = :userId`.
    *   The RLS policies on our tables use this session variable to filter every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operation, e.g., `USING (user_id = current_setting('app.current_user_id')::uuid)`.
    *   This provides a powerful, database-enforced guarantee that **no user can ever access another user's data**, regardless of any potential bugs in the application code.

### 4.4. Business Context Management

A significant challenge with the Meta API is its requirement for a `business` parameter on calls related to business-managed ad accounts. Omitting it causes an error. Including it for a personal ad account also causes an error. Our server must transparently handle this.

*   **The Challenge**: The server needs to know whether an ad account is personal or belongs to a Meta Business Portfolio.
*   **The Solution**: A multi-layered, self-healing strategy orchestrated by `BusinessContextCoordinator` and `BusinessContextManager` (`src/utils/`).
    1.  **Database Cache**: The `business_id` is stored (or stored as `NULL` if personal) in our `ad_accounts` table. This is the fastest lookup path.
    2.  **Batch API Discovery**: If the context for an account is unknown (i.e., not in our DB), the system triggers `discoverAndCacheBusinessContext`. This function uses the efficient Meta Graph API Batch endpoint (`src/utils/metaBatchHelper.ts`) to fetch the business context for up to 50 accounts in a single network call.
    3.  **Automatic Recovery**: If an API call fails with the "business is required" error, `PermissionHandler` (`src/tools/meta/permissionHandler.ts`) can trigger the business context discovery process and retry the operation, making the system resilient to stale cache data.

This robust mechanism ensures API calls are correctly formatted, significantly improving the reliability of ad management operations.

### 4.5. Resilience Patterns

To shield clients from Meta API instability, the server implements two key resilience patterns using the `cockatiel` library (`src/utils/resiliencePolicy.ts`).

1.  **Per-Request Circuit Breaker**: Each API call is wrapped in its own circuit breaker. If an operation fails `5` consecutive times (e.g., due to a Meta outage), the circuit "opens" for that specific user and operation. Subsequent calls fail fast for `30` seconds, preventing the server from hammering a failing endpoint. Crucially, because the policy is created **per-request**, a failure for one user does not affect any other user.
2.  **Exponential Backoff Retries**: For transient, retryable errors (identified by `src/utils/metaErrorClassifier.ts`), the system will automatically retry the API call up to `3` times with an exponentially increasing delay. This handles temporary network glitches or brief API slowdowns without failing the entire operation.

These policies are composed such that a full set of retries counts as only a single failure towards the circuit breaker, providing a robust, layered defense against external API issues.

### 4.6. Developer Experience & Tooling

A key goal is to make the server easy to maintain and extend.

*   **Automated Schema Generation**: The `scripts/generateSchemas.js` script is a standout feature. It introspects the `facebook-nodejs-business-sdk`, identifies all available fields for core objects (Campaign, AdSet, etc.), and generates Zod schemas for them in `src/generated/schemas.ts`. This provides:
    *   **End-to-end type safety**.
    *   **Automated runtime validation** of all incoming data from the Meta API.
    *   **Effortless updates**: When the Meta SDK is updated, running this script automatically updates our server's data models to match.
*   **Modular Tool Registries**: The tool registration logic in `src/mcp/registries/` is highly modular. Each Meta entity (Campaign, AdSet, etc.) has its own `*ToolRegistry.ts` file. This makes it trivial to add, remove, or modify tools related to a specific domain without affecting others. The `createMcpTool` helper (`src/mcp/registries/registryHelper.ts`) further abstracts away MCP boilerplate.

This focus on tooling and abstraction ensures that developers can focus on implementing business logic, not wrestling with protocol details or API inconsistencies.

### 4.7. Validation Patterns & Safety Mechanisms

The server implements comprehensive validation at multiple layers to ensure data integrity, security, and operational safety.

#### 4.7.1. Declarative Validation with Zod

All tool input parameters and API responses are validated using **Zod schemas**, providing:

*   **Type Safety**: Runtime validation ensures data matches TypeScript types
*   **Clear Error Messages**: Invalid data produces actionable error messages
*   **Fail-Fast Behavior**: Validation occurs before any business logic or API calls

The validation architecture follows a layered approach:
1.  **Registry Level**: Input schemas defined in tool registries validate incoming parameters
2.  **Handler Level**: Business logic validation using dedicated Zod schemas for complex rules
3.  **Response Level**: Auto-generated schemas validate outgoing data from Meta API

#### 4.7.2. Common Validation Schemas (DRY Principle)

To ensure consistency and maintainability, shared validation patterns are centralized in `src/mcp/registries/registryHelper.ts`:

```typescript
// Common deletion confirmation schema for all deletion tools
export const DeletionConfirmationSchema = z.literal(true, {
  errorMap: () => ({
    message: 'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.',
  }),
});
```

This pattern provides:
*   **Single Source of Truth**: One schema definition for deletion confirmation across all tools
*   **Consistent Error Messages**: Uniform validation errors across the entire API
*   **Type Safety**: Enforces `boolean literal true` instead of truthy values
*   **Maintainability**: Changes to validation logic only need to be made in one place

#### 4.7.3. Deletion Safety Architecture

All destructive operations implement a multi-layered safety system:

1.  **Client-Side Prompting**: Tool descriptions explicitly require user confirmation before calling
2.  **Schema Validation**: `DeletionConfirmationSchema` ensures confirmation parameter is exactly `true`
3.  **Handler Validation**: Additional validation schemas in each handler provide defense-in-depth:

```typescript
// Example from campaignHandler.ts
const DeleteCampaignValidationSchema = z.object({
  confirmPermanentDelete: DeletionConfirmationSchema,
});

// Consistent validation pattern across all handlers
const validationResult = DeleteCampaignValidationSchema.safeParse(params);
if (!validationResult.success) {
  const error = validationResult.error.errors[0];
  throw new ValidationError(error.message);
}
```

4.  **Pre-API Validation**: All validation occurs before Meta API calls, ensuring fast failure with no side effects

This architecture prevents accidental data loss while maintaining a clean, consistent developer experience.

#### 4.7.4. Complex Business Rule Validation

For complex interdependent validation (e.g., ad set targeting rules), the system uses Zod's advanced features:

*   **`.refine()`**: For simple cross-field validation (e.g., budget mutual exclusivity)
*   **`.superRefine()`**: For complex multi-rule validation with custom error paths
*   **Separation of Concerns**: Synchronous validation in schemas, asynchronous validation requiring API calls kept in handlers

Example from ad set creation:
```typescript
const CreateAdSetValidationSchema = z.object({
  // ... base fields
}).superRefine((data, ctx) => {
  // Budget XOR validation
  if (data.dailyBudget && data.lifetimeBudget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either dailyBudget or lifetimeBudget, but not both.',
      path: ['dailyBudget'],
    });
  }
  // Geographic targeting validation
  // Promoted object validation
  // Billing event compatibility validation
});
```

This approach provides comprehensive validation while maintaining clear error reporting and type safety.
