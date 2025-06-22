// Import test environment setup FIRST
import '../../helpers/testEnv.js';

import { sql, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, testConnection } from '../../../src/db/client.js';
import { users } from '../../../src/db/schema.js';

// List of all table names for proper test isolation
const tableNames = [
  'creative_asset_uploads',
  'oauth_refresh_tokens',
  'oauth_temp_auth_codes',
  'oauth_sessions',
  'ad_accounts',
  'oauth_tokens',
  'oauth_clients',
  'users',
];

beforeEach(async () => {
  // Use a transaction and reset role to the owner for cleanup.
  // This ensures sufficient permissions, bypasses RLS policies,
  // and makes the cleanup operation atomic, preventing deadlocks.
  await db.transaction(async (tx) => {
    await tx.execute(sql`RESET ROLE`);
    for (const tableName of tableNames) {
      await tx.execute(sql.raw(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`));
    }
  });
});

describe('Database Connection', () => {
  it('should successfully connect to the test database', async () => {
    // Test the connection function from our application
    const isConnected = await testConnection();
    expect(isConnected).toBe(true);
  });

  it('should have tables available after migrations', async () => {
    // Verify that our schema tables exist using pure Drizzle
    // Test that we can interact with the users table (which confirms it exists)
    const result = await db.select().from(users);
    
    // If the table exists, we should get an empty array (not an error)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0); // Should be empty in test environment
  });

  it('should have an empty users table initially', async () => {
    // Verify users table is empty in test environment
    const result = await db.select().from(users);
    expect(result).toHaveLength(0);
  });

  it('should be able to perform basic database operations', async () => {
    // Test basic CRUD operations using pure Drizzle within a single transaction
    // This prevents deadlocks from concurrent test operations
    // Note: This bypasses RLS by using database owner permissions (default)
    // RLS functionality is comprehensively tested in rls.test.ts
    
    await db.transaction(async (tx) => {
      const testUser = {
        facebookUserId: 'test_fb_user_123',
        sessionState: { test: true },
        accountContext: { selectedAccountId: 'test_account' },
      };

      // Insert a test user
      const [insertedUser] = await tx.insert(users).values(testUser).returning();
      expect(insertedUser).toBeDefined();
      expect(insertedUser.facebookUserId).toBe('test_fb_user_123');

      // Read the user back using proper Drizzle query
      const foundUsers = await tx
        .select()
        .from(users)
        .where(eq(users.facebookUserId, 'test_fb_user_123'));
      expect(foundUsers).toHaveLength(1);
      expect(foundUsers[0]?.facebookUserId).toBe('test_fb_user_123');

      // Verify we can update using proper Drizzle query
      const updatedUsers = await tx
        .update(users)
        .set({ sessionState: { updated: true } })
        .where(eq(users.facebookUserId, 'test_fb_user_123'))
        .returning();

      expect(updatedUsers).toHaveLength(1);
      expect(updatedUsers[0]?.sessionState).toEqual({ updated: true });

      // Verify we can delete using proper Drizzle query
      const deletedUsers = await tx
        .delete(users)
        .where(eq(users.facebookUserId, 'test_fb_user_123'))
        .returning();

      expect(deletedUsers).toHaveLength(1);

      // Verify deletion worked within the transaction
      const allUsers = await tx.select().from(users);
      expect(allUsers).toHaveLength(0);
    });

    // Verify the transaction was properly isolated - table should still be empty
    const finalCheck = await db.select().from(users);
    expect(finalCheck).toHaveLength(0);
  });
});
