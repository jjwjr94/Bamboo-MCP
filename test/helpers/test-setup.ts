import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { cleanupTestData, seedTestAdAccount, seedTestUserAndToken } from './db.js';
import { server } from './msw.js';

/**
 * Sets up a standard integration test environment for tool handlers.
 * This function encapsulates the MSW server lifecycle and the
 * database seeding/cleanup logic for a clean test environment.
 */
export function setupStandardTest() {
  // MSW server lifecycle management
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  // Database state management
  beforeEach(async () => {
    await seedTestUserAndToken();
    await seedTestAdAccount();
  });

  afterEach(async () => {
    await cleanupTestData();
  });
}
