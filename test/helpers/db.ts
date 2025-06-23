import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, withUserContext } from '../../src/db/client.js';
import { adAccounts, oauthTokens, users } from '../../src/db/schema.js';
import type { NewAdAccount, NewOAuthToken, NewUser } from '../../src/db/schema.js';

export const TEST_USER_ID = randomUUID();
export const TEST_FB_USER_ID = 'fb_test_user_123';
export const TEST_ACCESS_TOKEN = 'test_access_token_xyz123';
export const TEST_AD_ACCOUNT_ID = 'act_1234567890';
export const TEST_BUSINESS_ID = 'business_123456789';

export async function seedTestUserAndToken() {
  // Use database owner permissions to bypass RLS during setup
  await db.transaction(async (tx) => {
    await tx.execute(sql`RESET ROLE`);

    // Create test user
    const newUser: NewUser = {
      id: TEST_USER_ID,
      facebookUserId: TEST_FB_USER_ID,
    };
    await tx.insert(users).values(newUser);

    // Create OAuth token for the user
    const newOAuthToken: NewOAuthToken = {
      userId: TEST_USER_ID,
      accessToken: TEST_ACCESS_TOKEN,
      scopes: ['ads_management', 'ads_read', 'read_insights', 'pages_read_engagement'],
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    };
    await tx.insert(oauthTokens).values(newOAuthToken);
  });
}

export async function seedTestAdAccount(businessManaged = false) {
  await withUserContext(TEST_USER_ID, async (tx) => {
    const newAdAccount: NewAdAccount = {
      id: TEST_AD_ACCOUNT_ID,
      userId: TEST_USER_ID,
      name: 'Test Ad Account',
      status: 'ACTIVE',
      businessId: businessManaged ? TEST_BUSINESS_ID : null,
      permissions: ['MANAGE', 'ADVERTISE'],
    };
    await tx.insert(adAccounts).values(newAdAccount);
  });
}

export async function seedMultipleAdAccounts() {
  await withUserContext(TEST_USER_ID, async (tx) => {
    const newAdAccounts: NewAdAccount[] = [
      {
        id: TEST_AD_ACCOUNT_ID,
        userId: TEST_USER_ID,
        name: 'Test Ad Account 1',
        status: 'ACTIVE',
        businessId: null,
        permissions: ['MANAGE', 'ADVERTISE'],
      },
      {
        id: 'act_0987654321',
        userId: TEST_USER_ID,
        name: 'Test Ad Account 2',
        status: 'ACTIVE',
        businessId: TEST_BUSINESS_ID,
        permissions: ['READ'],
      },
    ];
    await tx.insert(adAccounts).values(newAdAccounts);
  });
}

export async function cleanupTestData() {
  // Use database owner permissions to clean up test data
  await db.transaction(async (tx) => {
    await tx.execute(sql`RESET ROLE`);

    // Clean up in dependency order
    await tx.delete(adAccounts).where(eq(adAccounts.userId, TEST_USER_ID));
    await tx.delete(oauthTokens).where(eq(oauthTokens.userId, TEST_USER_ID));
    await tx.delete(users).where(eq(users.id, TEST_USER_ID));
  });
}

// Helper to create JWT payload for tests
export function createTestAuthPayload() {
  return {
    userId: TEST_USER_ID,
    clientId: 'test_client_id',
    scopes: ['ads_management', 'ads_read', 'read_insights'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    iss: 'bamboo-mcp-server',
    aud: 'test-client',
  };
}
