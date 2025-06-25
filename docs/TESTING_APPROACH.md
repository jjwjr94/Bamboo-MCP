# Testing Strategy

This document outlines the testing strategy for the Meta Ads MCP Server, ensuring high confidence in its reliability, security, and correctness. Our approach is centered around comprehensive integration testing that validates the entire application stack from the business logic down to the database, while mocking external dependencies to ensure fast, deterministic, and reliable tests.

## 1. Overall Testing Philosophy and Approach

Our testing philosophy is built on three core principles that together provide maximum confidence in our codebase with minimal friction for developers.

*   **Integration-First**: We prioritize integration tests that cover the full request lifecycle. A typical test validates a tool's handler, its interaction with the database, and the data transformations in between. This approach provides the highest confidence that our components work together as expected in a production-like environment. Unit tests are used more sparingly for complex, pure-logic utility functions.

*   **Database Integrity via Real Instances**: All tests that interact with the data layer run against a real, ephemeral PostgreSQL database instance managed by **Testcontainers**. This is a cornerstone of our strategy. By testing against the actual database engine used in production, we guarantee that our Drizzle ORM queries, schema definitions, and, most importantly, our Row-Level Security (RLS) policies work exactly as designed. This eliminates an entire class of bugs that can arise from differences between a real database and in-memory mocks.

*   **Mocking at the Boundary**: We treat the Meta Graph API as an external dependency. All outbound network requests to `graph.facebook.com` are intercepted and mocked at the network layer using **Mock Service Worker (MSW)**. This allows us to deterministically test our system's behavior against a wide range of success, failure, and edge-case API responses without depending on the availability or state of the live Meta API. This makes our test suite faster, more reliable, and free from external flakiness.

*   **Complete Test Isolation**: Each test file runs in a clean environment. The database is completely wiped and re-seeded with necessary data before each test suite runs, preventing state leakage between tests and ensuring they are independent and reproducible. As seen in `vitest.config.ts`, tests are run sequentially (`maxConcurrency: 1`) to prevent database deadlocks in our integration-heavy suite.

## 2. Testing Tools and Frameworks

We have standardized on a modern, efficient, and powerful toolset for our testing needs:

*   **Test Runner**: [**Vitest**](https://vitest.dev/) is used as our test runner for its speed, modern ESM support, and compatibility with the Vite ecosystem.
*   **Database**: [**PostgreSQL**](https://www.postgresql.org/) managed by [**Testcontainers**](https://testcontainers.com/). This allows us to spin up a fresh, ephemeral PostgreSQL container for each test run, as defined in `test/setup.ts`.
*   **API Mocking**: [**Mock Service Worker (MSW)**](https://mswjs.io/) is used to intercept and mock all outgoing HTTP requests to the Meta Graph API. The setup and helpers for this can be found in `test/helpers/msw.ts`.
*   **ORM & Migrations**: [**Drizzle ORM**](https://orm.drizzle.team/) is used for all database interactions. Tests use the same Drizzle client as the application, ensuring our queries are validated against the real schema.

## 3. Test Organization and File Structure

Our test suite is organized logically within the `test/` directory to ensure clarity and maintainability.

```
test/
├── fixtures/               # Mock API response data for MSW
│   └── meta/
│       ├── api-errors.json
│       ├── campaigns.json
│       └── success-responses.json
├── helpers/                # Shared test utilities
│   ├── db.ts               # Database seeding and cleanup utilities
│   ├── msw.ts              # MSW server setup and response helpers
│   └── testEnv.js          # Test-specific environment variable setup
├── integration/            # Integration tests covering multiple components
│   ├── database/           # Tests for DB connection and RLS policies
│   ├── mcp-protocol/       # Tests for the core MCP server protocol
│   └── meta/               # Tests for each Meta API tool handler
└── unit/                   # Unit tests for isolated, pure-logic functions
    ├── auth/
    ├── mcp/
    ├── tools/
    └── utils/
```

-   **`fixtures/`**: Contains static JSON files that represent mock responses from the Meta API. This allows our tests to be deterministic and cover a wide range of API scenarios without hardcoding JSON in test files.
-   **`helpers/`**: A crucial directory containing reusable utilities for setting up test conditions. `db.ts` provides functions for seeding users and ad accounts, while `msw.ts` offers helpers for creating mock API handlers.
-   **`integration/`**: This is where the majority of our tests reside, reflecting our integration-first philosophy. Each file in `test/integration/meta/` typically corresponds to a handler file in `src/tools/meta/`, testing its public methods end-to-end.
-   **`unit/`**: These tests focus on small, isolated pieces of logic that do not require a database or network mocking, such as our error classifiers (`metaErrorClassifier.test.ts`) and resilience policies (`resiliencePolicy.test.ts`).

## 4. How to Run Tests

You can run the test suite using the following `pnpm` scripts defined in `package.json`:

*   **Run the full test suite:**
    ```bash
    pnpm test
    ```
*   **Run the tests with an interactive UI:**
    ```bash
    pnpm test:ui
    ```
*   **Run only tests in a specific directory (e.g., integration tests):**
    ```bash
    pnpm test test/integration
    ```
*   **Run a single test file:**
    ```bash
    pnpm test test/integration/meta/campaignHandler.test.ts
    ```

## 5. Key Coverage Areas

Our tests are designed to cover the most critical and complex parts of the system.

### A. Core Business Logic (Tool Handlers)
*Files: `test/integration/meta/*.test.ts`*

These are the most important tests in the suite. Each handler (e.g., `MetaCampaignHandler`) has a corresponding test file that covers:
-   **CRUD Operations**: Successful creation, reading, updating, and deletion of Meta objects.
-   **Parameter Validation**: Ensuring that invalid or incomplete input to a tool is rejected correctly.
-   **API Error Handling**: Verifying that our handlers correctly interpret and transform errors from the Meta API into standardized, actionable MCP errors.
-   **Database State**: Asserting that database records are correctly created, updated, or deleted after a tool is executed.

### B. Security: Row-Level Security (RLS)
*File: `test/integration/database/rls.test.ts`*

This suite is critical for our multi-tenant security model. It seeds data for multiple users and verifies that the `withUserContext` wrapper and our PostgreSQL RLS policies correctly enforce data isolation. It explicitly tests that one user **cannot** read, update, or delete another user's data under any circumstances.

### C. Resilience and Error Handling
*Files: `test/unit/utils/resiliencePolicy.test.ts`, `test/unit/utils/metaErrorClassifier.test.ts`*

These unit tests validate our resilience patterns:
-   **Error Classification**: Ensures that Meta API errors are correctly identified as `retryable` or `non-retryable`.
-   **Retry Logic**: Verifies that the exponential backoff policy is triggered for transient failures.
-   **Circuit Breaker**: Confirms that the circuit breaker trips after a configured number of consecutive failures to protect the system.

### D. Business Context Management
*File: `test/integration/meta/businessManagerHandler.test.ts`*

This test suite validates one of the most complex features of the server: the automatic detection and caching of "business context" for ad accounts. It ensures that the system can distinguish between personal and business-managed accounts and correctly format API calls for each, which is a common source of errors when interacting with the Meta API.

## 6. Guide for Developers: Writing and Debugging Tests

### Writing a New Test

1.  **Determine the Test Type**:
    *   Is it a new tool handler? Create an integration test in `test/integration/meta/`.
    *   Is it a new standalone utility function? Create a unit test in `test/unit/utils/`.

2.  **Follow the Arrange-Act-Assert Pattern**:
    *   **Arrange**:
        *   In your `beforeEach` block, seed the database with necessary data using helpers from `test/helpers/db.ts` (e.g., `seedTestUserAndToken`, `seedTestAdAccount`).
        *   Set up your MSW handlers using helpers from `test/helpers/msw.ts`. Use `createSuccessHandler` for happy paths and `createErrorHandler` for failure cases, pulling response bodies from the `.json` files in `test/fixtures/`.
    *   **Act**: Call the method on your handler instance with a mock authentication payload.
    *   **Assert**:
        *   Check the return value of the method.
        *   If the operation modified the database, query the DB within a `withUserContext` block to assert that the state was correctly changed.

3.  **Isolate and Clean Up**: Use `beforeEach` and `afterEach` with the `cleanupTestData()` helper to ensure your test does not affect others.

### Debugging a Failing Test

1.  **Isolate the Failure**: Run the failing test file by itself: `pnpm test path/to/your/test.file.ts`.
2.  **Check Mock API Handlers**: The most common source of failure is a mismatch between the URL the application is trying to call and the URL mocked by MSW. MSW will print an "unhandled request" error to the console with the exact URL that was called. Ensure your MSW handler in the test matches it.
3.  **Inspect Database State**: If you suspect a database issue, you can add `console.log` statements within your `withUserContext` blocks to inspect the state of the database during the test execution.
4.  **Review Error Messages**: Our `MetaApiError` class and test fixtures are designed to provide detailed error messages. Read the assertion failure message carefully; it often points directly to the problem.
5.  **Check Timeouts**: Our integration tests have a generous 30-second timeout (`vitest.config.ts`). If a test is timing out, it may indicate a deadlock or an unhandled promise that is preventing the test from completing.

By adhering to this strategy, we maintain a robust, reliable, and secure server while enabling developers to contribute with confidence.

## 7. Code Coverage Standards

To ensure high quality and reliability, we enforce code coverage thresholds on critical modules. These are defined in `vitest.config.ts` and checked during our CI pipeline. Key targets include:

- `src/auth/`: 85% branch coverage, 90% function coverage, 85% line coverage
- `src/tools/meta/adAccountHandler.ts`: 80% branch coverage, 85% function coverage, 80% line coverage  
- `src/utils/metaErrorClassifier.ts`: 90% branch coverage, 95% function coverage, 90% line coverage

This practice ensures that new code is written with testability in mind and that critical logic paths are validated.

## 8. Example Test Implementation

Here's a complete example of how to write a new integration test following our established patterns:

```typescript
// Import test environment setup first
import '../../helpers/testEnv.js';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MetaCampaignHandler } from '../../../src/tools/meta/campaignHandler.js';
import {
  TEST_AD_ACCOUNT_ID,
  cleanupTestData,
  createTestAuthPayload,
  seedTestAdAccount,
  seedTestUserAndToken,
} from '../../helpers/db.js';
import {
  createSuccessHandler,
  createMetaUrl,
  server,
} from '../../helpers/msw.js';
import campaignFixtures from '../../fixtures/meta/campaigns.json' assert { type: 'json' };

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Seed database before each test and clean up after
beforeEach(async () => {
  await seedTestUserAndToken();
  await seedTestAdAccount();
});
afterEach(async () => {
  await cleanupTestData();
});

describe('MetaCampaignHandler', () => {
  const handler = new MetaCampaignHandler();
  const mockAuthPayload = createTestAuthPayload();

  it('should return campaigns successfully', async () => {
    // Arrange: Mock successful Meta API response
    server.use(
      createSuccessHandler(
        'get',
        createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
        campaignFixtures.get.success
      )
    );

    // Act: Call the handler method
    const result = await handler.getCampaigns(mockAuthPayload, {
      adAccountId: TEST_AD_ACCOUNT_ID,
    });

    // Assert: Verify response structure and data
    expect(result.campaigns).toBeInstanceOf(Array);
    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0].id).toBe('23844883336250011');
    expect(result.campaigns[0].name).toBe('Test Campaign 1');
  });
});
```

This example demonstrates the complete Arrange-Act-Assert pattern with proper setup, MSW mocking, and database seeding.

## 9. Testing Deletion Confirmation and Validation Patterns

Given the critical importance of deletion safety in our system, comprehensive testing of validation patterns is essential.

### 9.1. Deletion Confirmation Testing Strategy

All deletion tools must have thorough test coverage for their safety mechanisms:

#### A. Validation Error Testing
Every deletion tool should test the standardized validation behavior:

```typescript
describe('delete confirmation validation', () => {
  it('should reject deletion when confirmPermanentDelete is missing', async () => {
    const params = { campaignId: 'test_123' }; // Missing confirmPermanentDelete
    
    await expect(handler.deleteCampaign(mockAuthPayload, params))
      .rejects
      .toThrow('Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.');
  });

  it('should reject deletion when confirmPermanentDelete is false', async () => {
    const params = { campaignId: 'test_123', confirmPermanentDelete: false };
    
    await expect(handler.deleteCampaign(mockAuthPayload, params))
      .rejects
      .toThrow('Permanent deletion was not confirmed');
  });

  it('should reject deletion when confirmPermanentDelete is truthy but not literal true', async () => {
    const params = { campaignId: 'test_123', confirmPermanentDelete: 1 }; // Truthy but not boolean true
    
    await expect(handler.deleteCampaign(mockAuthPayload, params))
      .rejects
      .toThrow('Permanent deletion was not confirmed');
  });

  it('should succeed when confirmPermanentDelete is exactly true', async () => {
    // Arrange: Mock successful deletion response
    server.use(createSuccessHandler('delete', createMetaUrl('/test_123'), { success: true }));
    
    const params = { campaignId: 'test_123', confirmPermanentDelete: true };
    
    // Act & Assert: Should succeed without throwing
    const result = await handler.deleteCampaign(mockAuthPayload, params);
    expect(result.campaignId).toBe('test_123');
  });
});
```

#### B. Pre-API Validation Testing
Ensure validation happens **before** any Meta API calls:

```typescript
it('should validate confirmation before making API calls', async () => {
  // Arrange: Set up MSW to track if any requests are made
  let apiCallMade = false;
  server.use(
    rest.delete(createMetaUrl('/test_123'), (req, res, ctx) => {
      apiCallMade = true;
      return res(ctx.json({ success: true }));
    })
  );

  const params = { campaignId: 'test_123', confirmPermanentDelete: false };

  // Act: Attempt deletion with invalid confirmation
  try {
    await handler.deleteCampaign(mockAuthPayload, params);
    fail('Expected validation error');
  } catch (error) {
    // Assert: Validation should fail AND no API call should be made
    expect(error.message).toContain('Permanent deletion was not confirmed');
    expect(apiCallMade).toBe(false);
  }
});
```

### 9.2. Complex Validation Testing

For tools with complex business rules (e.g., ad set creation), test validation patterns comprehensively:

#### A. Cross-Field Validation Testing
```typescript
describe('budget validation', () => {
  it('should reject when both dailyBudget and lifetimeBudget are provided', async () => {
    const params = {
      campaignId: 'test_123',
      name: 'Test AdSet',
      dailyBudget: 1000,
      lifetimeBudget: 5000, // Invalid: both budgets provided
      // ... other required fields
    };

    await expect(handler.createAdSet(mockAuthPayload, params))
      .rejects
      .toThrow('Provide either dailyBudget or lifetimeBudget, but not both');
  });

  it('should reject when neither budget is provided', async () => {
    const params = {
      campaignId: 'test_123',
      name: 'Test AdSet',
      // Missing: no budget provided
      // ... other required fields
    };

    await expect(handler.createAdSet(mockAuthPayload, params))
      .rejects
      .toThrow('Either dailyBudget or lifetimeBudget is required');
  });
});
```

#### B. Geographic Targeting Validation
```typescript
describe('geographic targeting validation', () => {
  it('should reject when no geographic targeting is provided', async () => {
    const params = {
      // ... other fields
      targeting: {
        geoLocations: {} // Empty: no countries, regions, or cities
      }
    };

    await expect(handler.createAdSet(mockAuthPayload, params))
      .rejects
      .toThrow('At least one of countries, regions, or cities must be specified');
  });
});
```

### 9.3. Testing Best Practices for Validation

#### A. Test Organization
- Group validation tests in dedicated `describe` blocks
- Test each validation rule independently
- Include both positive and negative test cases

#### B. Error Message Testing
- Always test the exact error message to ensure consistency
- Use `toThrow()` with specific message strings, not just error types
- Verify error messages are actionable and clear

#### C. Validation Timing
- Test that validation occurs before API calls (fail-fast principle)
- Use MSW request tracking to ensure no unintended API calls
- Test that validation errors don't cause state changes

#### D. Common Schema Testing
When testing tools that use shared schemas (like `DeletionConfirmationSchema`):

```typescript
// Create reusable test helpers for common validation patterns
const testDeletionConfirmation = (handlerMethod: Function, idField: string) => {
  describe('standardized deletion confirmation', () => {
    it('should use DeletionConfirmationSchema for validation', async () => {
      const params = { [idField]: 'test_123', confirmPermanentDelete: 'true' }; // String instead of boolean
      
      await expect(handlerMethod(mockAuthPayload, params))
        .rejects
        .toThrow('Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.');
    });
  });
};

// Apply to all deletion tools
testDeletionConfirmation(handler.deleteCampaign, 'campaignId');
testDeletionConfirmation(handler.deleteAdSet, 'adSetId');
// ... etc
```

### 9.4. Coverage Requirements for Validation

Validation-related code should have **high coverage** due to its critical nature:

- **95%+ line coverage** for validation schemas and logic
- **100% branch coverage** for safety-critical deletion validation
- **Test all error paths** for validation failures
- **Test edge cases** like boundary values and type coercion attempts

This comprehensive approach ensures that our safety mechanisms work correctly and provide clear, consistent error messages to clients.

## Relevant Files

*   `vitest.config.ts` - Test configuration and setup
*   `test/setup.ts` - Global test setup and Testcontainers configuration
*   `test/helpers/db.ts` - Database seeding and cleanup utilities
*   `test/helpers/msw.ts` - Mock Service Worker setup and helpers
*   `test/integration/database/rls.test.ts` - Row-Level Security validation
*   `test/integration/meta/campaignHandler.test.ts` - Example handler integration test
*   `test/unit/utils/resiliencePolicy.test.ts` - Resilience pattern validation 