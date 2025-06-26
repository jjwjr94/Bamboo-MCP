# Meta Ads MCP Server

The Meta Ads MCP Server provides secure, scalable, and resilient access to the Meta Marketing API, designed for consumption by AI agents and other automated systems via the Model Context Protocol (MCP) - an open standard that enables AI models to securely interact with external tools and data sources. It wraps the complexity of the Meta Ads API in a set of well-defined, production-ready tools.

This server handles authentication, error resilience, business context, and API abstraction, allowing developers and AI agents to focus on building powerful advertising automation workflows without needing deep expertise in the underlying Meta Marketing API.

## Table of Contents

- [Key Features](#key-features)
- [Local Development Setup](#local-development-setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
  - [Environment Variables](#environment-variables)
  - [Running Migrations](#running-migrations)
  - [Starting the Server](#starting-the-server)
- [Testing with MCP Inspector](#testing-with-mcp-inspector)
- [Available Scripts](#available-scripts)
- [Project Architecture](#project-architecture)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Key Features

This server is built with enterprise-grade standards to ensure security, reliability, and ease of use.

-   **Comprehensive API Coverage**: Implements 38 granular tools covering the entire ad management lifecycle, from campaigns and ad sets to creatives and insights.
-   **Enterprise-Grade Security**:
    -   **OAuth 2.1 + PKCE**: Modern, secure authentication flow.
    -   **JWT with EdDSA**: Cryptographically secure, stateless tokens for internal authorization.
    -   **Row-Level Security (RLS)**: Database-level data isolation ensures users can only access their own data.
-   **Advanced Resilience**:
    -   **Circuit Breakers**: Automatically detects and recovers from external API failures.
    -   **Exponential Backoff**: Intelligent retry logic for transient Meta API errors.
    -   **Request-Scoped Policies**: Prevents failures for one user from impacting others.
-   **Business Context Handling**: Seamlessly manages both personal and business-managed ad accounts, automatically resolving and applying the correct business context for API calls.
-   **Production Ready**:
    -   **Pagination Safety**: Automatic limits on all list operations prevent resource exhaustion from runaway queries.
    -   **Delete Protection**: Multi-layered deletion safety with mandatory user prompting, standardized confirmation schemas, and pre-API validation to prevent accidental data loss.
    -   **Schema Validation**: Rigorous input/output validation using Zod for all 38 tools with shared validation patterns ensuring consistency.
-   **Superior Developer Experience**:
    -   **Fully Type-Safe**: End-to-end type safety from database to API handlers.
    -   **Auto-Generated Schemas**: A script (`scripts/generateSchemas.js`) generates Zod schemas directly from the Meta SDK, ensuring our server stays in sync with API changes.
    -   **Clear Abstractions**: Handlers are decoupled from the MCP protocol, simplifying tool implementation.

## Local Development Setup

Follow these steps to get the server running on your local machine.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18.0.0 or higher)
-   [pnpm](https://pnpm.io/) (v10.x or higher)
-   [Docker](https://www.docker.com/) and Docker Compose

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd bamboo-mcp
    ```
2.  Install dependencies using pnpm:
    ```bash
    pnpm install
    ```

### Database Setup

The project uses a PostgreSQL database. The test environment uses Testcontainers, but for local development, a persistent Docker container is recommended.

1.  **Start a PostgreSQL container:**

    ```bash
    docker run --name bamboo-postgres -e POSTGRES_USER=test_user -e POSTGRES_PASSWORD=test_password -e POSTGRES_DB=bamboo_test -p 5432:5432 -d postgres:15
    ```

    This command starts a PostgreSQL 15 container, creates the database and user, and maps port `5432` to your local machine.

### Environment Variables

1.  Create a `.env` file in the project root by copying the example:

    ```bash
    cp .env.example .env
    ```

2.  **Generate JWT Keys**: The server uses EdDSA keys for signing JWTs. Generate a key pair:

    ```bash
    npx jose-util-generate-key-pair EdDSA
    ```

3.  **Fill out the `.env` file** with the following values:

    ```env
    # .env

    # -- Database --
    # Connection string for the local Docker container
    DATABASE_URL="postgresql://test_user:test_password@localhost:5432/bamboo_test"

    # -- Meta App Credentials --
    # Get these from your Meta for Developers App Dashboard
    FACEBOOK_APP_ID="<your_facebook_app_id>"
    FACEBOOK_APP_SECRET="<your_facebook_app_secret>"
    # This must match the "Valid OAuth Redirect URIs" in your app settings
    FACEBOOK_CALLBACK_URL="http://localhost:3000/oauth/callback"

    # -- JWT Authentication --
    # Paste the keys generated in the previous step
    JWT_PRIVATE_KEY='<your_private_jwk_key>'
    JWT_PUBLIC_KEY='<your_public_jwk_key>'

    # -- Server Configuration --
    # Base URL for the running server
    BASE_URL="http://localhost:3000"
    # Scopes your server requests from Meta.
    FACEBOOK_OAUTH_SCOPES="ads_management,ads_read,read_insights,business_management,pages_show_list,pages_manage_posts,pages_read_engagement"
    ```

### Running Migrations

Once your database is running and your `.env` file is configured, apply the database schema:

```bash
pnpm db:migrate
```

This command uses Drizzle Kit to apply all migrations located in `src/db/migrations`. It will also set up the `app_user` role required for Row-Level Security.

### Starting the Server

You can now start the development server:

```bash
pnpm dev
```

The server will be running on `http://localhost:3000`. It automatically rebuilds on file changes.

## Testing with MCP Inspector

`mcp-inspector` is a powerful tool for interacting with MCP servers. This project is pre-configured to work with it.

1.  **Install MCP Inspector globally** (if you haven't already):
    ```bash
    npm install -g @modelcontextprotocol/inspector
    ```
2.  **Start the server** in one terminal:
    ```bash
    pnpm dev
    ```
3.  **Run the inspector** in another terminal. You can connect via HTTP or Stdio:

    -   **HTTP (Recommended for most development):**
        ```bash
        pnpm mcp:inspect:http
        ```
    -   **Stdio (For direct process communication):**
        ```bash
        pnpm mcp:inspect:stdio
        ```

This will open a web interface where you can browse and call all registered tools and prompts.

## Available Scripts

Here's a breakdown of the scripts in `package.json`:

| Script                  | Description                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `dev`                   | Starts the server in development mode with `tsx` for live reloading. Runs `prebuild` first.               |
| `build`                 | Compiles the TypeScript project to JavaScript in `dist/` and copies static assets.                      |
| `start`                 | Runs the production-ready server from the `dist/` directory.                                            |
| `test`                  | Runs the full test suite using Vitest.                                                                  |
| `test:ui`               | Runs Vitest with its interactive UI for a visual testing experience.                                    |
| `checks`                | Runs Biome for code formatting/linting and `tsc` for type-checking. Ideal for pre-commit hooks.         |
| `lint`                  | An alias for `biome check .`.                                                                           |
| `db:generate`           | Generates new SQL migration files based on changes to `src/db/schema.ts`.                               |
| `db:migrate`            | Applies pending database migrations to the configured database.                                         |
| `mcp:server:stdio`      | Runs the MCP server in Stdio mode for direct interaction.                                               |
| `mcp:inspect:http`      | Starts the MCP Inspector and connects to the running HTTP server.                                       |
| `mcp:inspect:stdio`     | Starts the MCP Inspector and connects to a new server instance via Stdio.                               |

## Project Architecture

The server is designed with a layered architecture to separate concerns and ensure maintainability. For a deep dive, see `docs/ARCHITECTURE.md`.

-   `src/auth`: Handles all OAuth 2.1, JWT, and session management logic.
-   `src/db`: Contains the Drizzle ORM schema, client, and migrations.
-   `src/mcp`: The core MCP layer, including tool/resource/prompt registries and the server implementations (HTTP and Stdio).
-   `src/tools/meta`: The business logic layer. Each `*Handler.ts` file encapsulates API calls for a specific Meta entity (e.g., `campaignHandler.ts`).
-   `src/utils`: Contains shared utilities for error handling, logging, resilience, and security.
-   `src/generated`: Contains Zod schemas automatically generated by `scripts/generateSchemas.js`. **Do not edit these manually.**
-   `src/prompts`: Contains the static text content for system prompts provided to the AI.

## Troubleshooting

| Problem                                                                         | Solution                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database Connection Fails**                                                   | Verify your Docker container is running (`docker ps`). Check that the `DATABASE_URL` in your `.env` file matches the user, password, port, and database name from your `docker run` command.                                                                                     |
| **`Invalid OAuth access token` Error**                                          | This is a common Meta API error. Your Meta access token has expired. You need to re-authenticate through the OAuth flow. If using `mcp-inspector`, generate a new authentication token. Check server logs for the `fbtrace_id` to provide to Meta support if needed.                                                                                         |
| **`Application does not have permission` or `App is in development mode` Error** | Your Meta App is in "Development Mode". To use the API, your Facebook account must be added as a "Tester" in the App Dashboard under "Roles". Alternatively, move the app to "Live Mode" after completing App Review.                                                               |
| **`(#3) To make this call... a business is required` Error**                     | The ad account is managed by a Meta Business Portfolio, but the `business` parameter was not sent. The server's business context resolution should handle this automatically, but a failure indicates a sync issue. Running `get_ad_accounts` usually resolves this by refreshing the context. |
| **`Permission denied` or `Insufficient permission` Error**                      | Your user account lacks the required permissions on the ad account (e.g., `MANAGE`, `ADVERTISE`) or your Meta App was not granted the necessary OAuth scopes (e.g., `ads_management`). Check your permissions in Meta Business Settings.                                            |
| **Tests are failing with timeouts or deadlocks**                                | The test suite is configured to run tests sequentially (`maxConcurrency: 1`) to prevent database deadlocks. If you see these issues, ensure this configuration in `vitest.config.ts` has not been changed.                                                                      |

## Contributing

Please follow these guidelines:

1.  **Branching**: Create a new feature branch from `main`.
2.  **Code Style**: Run `pnpm checks` before committing to ensure code is formatted, linted, and type-safe.
3.  **Testing**: Add unit and integration tests for new features. Ensure all existing tests pass by running `pnpm test`.
4.  **Pull Requests**: Open a PR against `main` with a clear description of the changes.

## License

This project is proprietary. Please refer to the license agreement for more details.