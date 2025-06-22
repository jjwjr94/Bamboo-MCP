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
  // Truncate all tables to ensure clean state for each test
  // Order matters due to foreign key constraints
  for (const tableName of tableNames) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`));
  }
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
    // Test basic CRUD operations
    const testUser = {
      facebookUserId: 'test_fb_user_123',
      sessionState: { test: true },
      accountContext: { selectedAccountId: 'test_account' },
    };

    // Insert a test user
    const [insertedUser] = await db.insert(users).values(testUser).returning();
    expect(insertedUser).toBeDefined();
    expect(insertedUser.facebookUserId).toBe('test_fb_user_123');

    // Read the user back
    const [foundUser] = await db
      .select()
      .from(users)
      .where(sql`facebook_user_id = 'test_fb_user_123'`);
    expect(foundUser).toBeDefined();
    expect(foundUser.facebookUserId).toBe('test_fb_user_123');

    // Verify we can update
    const updatedUser = await db
      .update(users)
      .set({ sessionState: { updated: true } })
      .where(sql`facebook_user_id = 'test_fb_user_123'`)
      .returning();

    expect(updatedUser[0].sessionState).toEqual({ updated: true });

    // Delete is handled by beforeEach cleanup, but let's verify we can delete
    await db.delete(users).where(sql`facebook_user_id = 'test_fb_user_123'`);

    // Verify deletion
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(0);
  });
});
