// Import test environment setup FIRST
import '../../helpers/testEnv.js';

import { sql } from 'drizzle-orm';
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
    // Verify that our schema tables exist
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `);

    expect(result).toHaveLength(1);
    expect(result[0].table_name).toBe('users');
  });

  it('should have an empty users table initially', async () => {
    // Verify users table is empty in test environment
    const result = await db.select().from(users);
    expect(result).toHaveLength(0);
  });

  it('should be able to perform basic database operations', async () => {
    // Wrap operations in a transaction and reset role to bypass RLS for this
    // basic connectivity test. RLS itself is tested in rls.test.ts.
    await db.transaction(async (tx) => {
      await tx.execute(sql`RESET ROLE`);

      // Test basic CRUD operations
      const testUser = {
        facebookUserId: 'test_fb_user_123',
        sessionState: { test: true },
        accountContext: { selectedAccountId: 'test_account' },
      };

      // Insert a test user
      const [insertedUser] = await tx.insert(users).values(testUser).returning();
      expect(insertedUser).toBeDefined();
      expect(insertedUser.facebookUserId).toBe('test_fb_user_123');

      // Read the user back
      const [foundUser] = await tx
        .select()
        .from(users)
        .where(sql`facebook_user_id = 'test_fb_user_123'`);
      expect(foundUser).toBeDefined();
      expect(foundUser.facebookUserId).toBe('test_fb_user_123');

      // Verify we can update
      const updatedUser = await tx
        .update(users)
        .set({ sessionState: { updated: true } })
        .where(sql`facebook_user_id = 'test_fb_user_123'`)
        .returning();

      expect(updatedUser[0].sessionState).toEqual({ updated: true });

      // Delete is handled by beforeEach cleanup, but let's verify we can delete
      await tx.delete(users).where(sql`facebook_user_id = 'test_fb_user_123'`);

      // Verify deletion
      const allUsers = await tx.select().from(users);
      expect(allUsers).toHaveLength(0);
    });
  });
});
