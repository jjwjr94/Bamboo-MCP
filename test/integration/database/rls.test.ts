import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, withUserContext } from '../../../src/db/client.js';
import { adAccounts, creativeAssetUploads, oauthTokens, users } from '../../../src/db/schema.js';
import type {
  NewAdAccount,
  NewCreativeAssetUpload,
  NewOAuthToken,
} from '../../../src/db/schema.js';

describe('Row-Level Security (RLS) Data Isolation', { timeout: 30000 }, () => {
  // Test user data for isolation testing
  const user1 = {
    id: randomUUID(),
    facebookUserId: 'fb_user_rls_1',
  };

  const user2 = {
    id: randomUUID(),
    facebookUserId: 'fb_user_rls_2',
  };

  // RLS-protected table names for cleanup (in dependency order)
  const tableNames = ['creative_asset_uploads', 'oauth_tokens', 'ad_accounts', 'users'];

  beforeEach(async () => {
    // Clean database and seed test data for isolation testing
    // Use database owner permissions to bypass RLS during setup
    await db.transaction(async (tx) => {
      // Reset to database owner for setup operations
      await tx.execute(sql`RESET ROLE`);

      // Clean tables
      for (const tableName of tableNames) {
        await tx.execute(sql.raw(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`));
      }

      // Create test users (bypassing RLS)
      await tx.insert(users).values([user1, user2]);

      // Create OAuth tokens for each user (bypassing RLS)
      await tx.insert(oauthTokens).values([
        {
          userId: user1.id,
          accessToken: 'token_user1_rls_test',
          scopes: ['read_profile', 'manage_ads'],
        } as NewOAuthToken,
        {
          userId: user2.id,
          accessToken: 'token_user2_rls_test',
          scopes: ['read_profile'],
        } as NewOAuthToken,
      ]);

      // Create ad accounts for each user (bypassing RLS)
      await tx.insert(adAccounts).values([
        {
          id: 'act_rls_1',
          userId: user1.id,
          name: 'User 1 Ad Account',
          status: 'ACTIVE',
          permissions: ['MANAGE', 'ADVERTISE'],
        } as NewAdAccount,
        {
          id: 'act_rls_2',
          userId: user2.id,
          name: 'User 2 Ad Account',
          status: 'ACTIVE',
          permissions: ['READ'],
        } as NewAdAccount,
      ]);

      // Create creative asset uploads for each user (bypassing RLS)
      await tx.insert(creativeAssetUploads).values([
        {
          userId: user1.id,
          adAccountId: 'act_rls_1',
          filename: 'user1_creative.jpg',
          assetType: 'image',
          status: 'completed',
        } as NewCreativeAssetUpload,
        {
          userId: user2.id,
          adAccountId: 'act_rls_2',
          filename: 'user2_creative.jpg',
          assetType: 'image',
          status: 'pending',
        } as NewCreativeAssetUpload,
      ]);
    });
  });

  afterEach(async () => {
    // Verify RLS context is not set globally after tests
    const res = await db.execute(sql`SELECT current_setting('app.current_user_id', true)`);
    const currentSetting = res[0]?.current_setting;
    // current_setting returns empty string when the setting is unset (transaction ends)
    expect(currentSetting).toBe('');
  });

  describe('withUserContext()', () => {
    it('should set app.current_user_id correctly within transaction', async () => {
      await withUserContext(user1.id, async (tx) => {
        const result = await tx.execute(sql`SELECT current_setting('app.current_user_id')`);
        expect(result[0]?.current_setting).toBe(user1.id);
      });
    });

    it('should maintain different contexts for different users', async () => {
      // Test context isolation between concurrent operations
      const [result1, result2] = await Promise.all([
        withUserContext(user1.id, async (tx) => {
          const context = await tx.execute(sql`SELECT current_setting('app.current_user_id')`);
          return context[0]?.current_setting;
        }),
        withUserContext(user2.id, async (tx) => {
          const context = await tx.execute(sql`SELECT current_setting('app.current_user_id')`);
          return context[0]?.current_setting;
        }),
      ]);

      expect(result1).toBe(user1.id);
      expect(result2).toBe(user2.id);
    });

    it('should rollback transaction on error and clean up context', async () => {
      const newAdAccount: NewAdAccount = {
        id: 'act_rollback_test',
        userId: user1.id,
        name: 'Should be rolled back',
        status: 'ACTIVE',
      };

      await expect(
        withUserContext(user1.id, async (tx) => {
          await tx.insert(adAccounts).values(newAdAccount);
          // Verify the insert worked within the transaction
          const inserted = await tx
            .select()
            .from(adAccounts)
            .where(eq(adAccounts.id, 'act_rollback_test'));
          expect(inserted).toHaveLength(1);
          throw new Error('Test-induced rollback');
        })
      ).rejects.toThrow('Test-induced rollback');

      // Verify the account was not committed due to rollback
      const result = await db
        .select()
        .from(adAccounts)
        .where(eq(adAccounts.id, 'act_rollback_test'));
      expect(result).toHaveLength(0);
    });

    it('should ensure context does not leak after successful transaction', async () => {
      await withUserContext(user1.id, async (tx) => {
        const result = await tx.select().from(users).where(eq(users.id, user1.id));
        expect(result).toHaveLength(1);
      });

      // Outside the transaction, the context should be cleared
      const res = await db.execute(sql`SELECT current_setting('app.current_user_id', true)`);
      expect(res[0]?.current_setting).toBe('');
    });

    it('should handle nested context operations correctly', async () => {
      // Test nested withUserContext calls to ensure proper isolation
      const outerResult = await withUserContext(user1.id, async (outerTx) => {
        const outerUsers = await outerTx.select().from(users);

        const innerResult = await withUserContext(user2.id, async (innerTx) => {
          const innerUsers = await innerTx.select().from(users);
          return innerUsers.length;
        });

        return { outer: outerUsers.length, inner: innerResult };
      });

      // Each context should only see its own user
      expect(outerResult.outer).toBe(1);
      expect(outerResult.inner).toBe(1);
    });
  });

  describe('RLS Policy Enforcement', () => {
    describe('users table', () => {
      it('should allow user to select only their own record', async () => {
        const user1Result = await withUserContext(user1.id, (tx) => tx.select().from(users));
        expect(user1Result).toHaveLength(1);
        expect(user1Result[0]?.id).toBe(user1.id);

        const user2Result = await withUserContext(user2.id, (tx) => tx.select().from(users));
        expect(user2Result).toHaveLength(1);
        expect(user2Result[0]?.id).toBe(user2.id);
      });

      it('should allow user to update their own record', async () => {
        const newAccountContext = {
          selectedAccountId: 'act_rls_1',
          availableAccounts: [
            { id: 'act_rls_1', name: 'Test Account', permissions: ['MANAGE'], status: 'ACTIVE' },
          ],
        };

        const result = await withUserContext(user1.id, (tx) =>
          tx
            .update(users)
            .set({ accountContext: newAccountContext })
            .where(eq(users.id, user1.id))
            .returning()
        );

        expect(result).toHaveLength(1);
        expect(result[0]?.accountContext).toEqual(newAccountContext);
      });

      it('should prevent user from updating another user record', async () => {
        const maliciousUpdate = { sessionState: { hijacked: true } };

        const result = await withUserContext(user1.id, (tx) =>
          tx
            .update(users)
            .set({ sessionState: maliciousUpdate })
            .where(eq(users.id, user2.id))
            .returning()
        );

        // RLS policy prevents the update (row not visible)
        expect(result).toHaveLength(0);

        // Verify user2's data was not modified
        const user2Data = await withUserContext(user2.id, (tx) =>
          tx.select().from(users).where(eq(users.id, user2.id))
        );
        expect(user2Data[0]?.sessionState).not.toEqual(maliciousUpdate);
      });
    });

    describe('oauthTokens table', () => {
      it('should only return tokens belonging to the current user', async () => {
        const user1Tokens = await withUserContext(user1.id, (tx) => tx.select().from(oauthTokens));
        expect(user1Tokens).toHaveLength(1);
        expect(user1Tokens[0]?.userId).toBe(user1.id);
        expect(user1Tokens[0]?.accessToken).toBe('token_user1_rls_test');

        const user2Tokens = await withUserContext(user2.id, (tx) => tx.select().from(oauthTokens));
        expect(user2Tokens).toHaveLength(1);
        expect(user2Tokens[0]?.userId).toBe(user2.id);
        expect(user2Tokens[0]?.accessToken).toBe('token_user2_rls_test');
      });

      it('should allow user to insert token for themselves', async () => {
        const newToken: NewOAuthToken = {
          userId: user1.id,
          accessToken: 'new_token_user1',
          scopes: ['read_profile'],
        };

        await withUserContext(user1.id, (tx) => tx.insert(oauthTokens).values(newToken));

        // Verify token was created
        const tokens = await withUserContext(user1.id, (tx) =>
          tx.select().from(oauthTokens).where(eq(oauthTokens.accessToken, 'new_token_user1'))
        );
        expect(tokens).toHaveLength(1);
      });

      it('should block user from inserting token for another user', async () => {
        const maliciousToken: NewOAuthToken = {
          userId: user2.id,
          accessToken: 'malicious_token',
          scopes: ['read_profile'],
        };

        // RLS withCheck policy should block this
        await expect(
          withUserContext(user1.id, (tx) => tx.insert(oauthTokens).values(maliciousToken))
        ).rejects.toThrow(/new row violates row-level security policy/);
      });

      it('should prevent user from deleting another user token', async () => {
        const result = await withUserContext(user1.id, (tx) =>
          tx
            .delete(oauthTokens)
            .where(eq(oauthTokens.accessToken, 'token_user2_rls_test'))
            .returning()
        );

        // No rows deleted because user2's token is not visible to user1
        expect(result).toHaveLength(0);

        // Verify user2's token still exists
        const user2Tokens = await withUserContext(user2.id, (tx) => tx.select().from(oauthTokens));
        expect(user2Tokens).toHaveLength(1);
      });
    });

    describe('adAccounts table', () => {
      it('should only return ad accounts belonging to the current user', async () => {
        const user1Accounts = await withUserContext(user1.id, (tx) => tx.select().from(adAccounts));
        expect(user1Accounts).toHaveLength(1);
        expect(user1Accounts[0]?.id).toBe('act_rls_1');
        expect(user1Accounts[0]?.userId).toBe(user1.id);

        const user2Accounts = await withUserContext(user2.id, (tx) => tx.select().from(adAccounts));
        expect(user2Accounts).toHaveLength(1);
        expect(user2Accounts[0]?.id).toBe('act_rls_2');
        expect(user2Accounts[0]?.userId).toBe(user2.id);
      });

      it('should allow user to insert ad account for themselves', async () => {
        const newAccount: NewAdAccount = {
          id: 'act_rls_new',
          userId: user1.id,
          name: 'New Test Account',
          status: 'ACTIVE',
          permissions: ['READ'],
        };

        await withUserContext(user1.id, (tx) => tx.insert(adAccounts).values(newAccount));

        const result = await withUserContext(user1.id, (tx) =>
          tx.select().from(adAccounts).where(eq(adAccounts.id, 'act_rls_new'))
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('New Test Account');
      });

      it('should block user from inserting ad account for another user', async () => {
        const maliciousAccount: NewAdAccount = {
          id: 'act_malicious',
          userId: user2.id,
          name: 'Malicious Account',
          status: 'ACTIVE',
        };

        await expect(
          withUserContext(user1.id, (tx) => tx.insert(adAccounts).values(maliciousAccount))
        ).rejects.toThrow(/new row violates row-level security policy/);
      });

      it('should prevent user from updating another user ad account', async () => {
        const result = await withUserContext(user1.id, (tx) =>
          tx
            .update(adAccounts)
            .set({ name: 'Hijacked Account' })
            .where(eq(adAccounts.id, 'act_rls_2'))
            .returning()
        );

        expect(result).toHaveLength(0);

        // Verify user2's account was not modified
        const user2Account = await withUserContext(user2.id, (tx) =>
          tx.select().from(adAccounts).where(eq(adAccounts.id, 'act_rls_2'))
        );
        expect(user2Account[0]?.name).toBe('User 2 Ad Account');
      });
    });

    describe('creativeAssetUploads table', () => {
      it('should only return uploads belonging to the current user', async () => {
        const user1Uploads = await withUserContext(user1.id, (tx) =>
          tx.select().from(creativeAssetUploads)
        );
        expect(user1Uploads).toHaveLength(1);
        expect(user1Uploads[0]?.userId).toBe(user1.id);
        expect(user1Uploads[0]?.filename).toBe('user1_creative.jpg');

        const user2Uploads = await withUserContext(user2.id, (tx) =>
          tx.select().from(creativeAssetUploads)
        );
        expect(user2Uploads).toHaveLength(1);
        expect(user2Uploads[0]?.userId).toBe(user2.id);
        expect(user2Uploads[0]?.filename).toBe('user2_creative.jpg');
      });

      it('should allow user to insert upload for themselves', async () => {
        const newUpload: NewCreativeAssetUpload = {
          userId: user1.id,
          adAccountId: 'act_rls_1',
          filename: 'new_creative.png',
          assetType: 'image',
          status: 'pending',
        };

        await withUserContext(user1.id, (tx) => tx.insert(creativeAssetUploads).values(newUpload));

        const uploads = await withUserContext(user1.id, (tx) =>
          tx
            .select()
            .from(creativeAssetUploads)
            .where(eq(creativeAssetUploads.filename, 'new_creative.png'))
        );
        expect(uploads).toHaveLength(1);
      });

      it('should block user from inserting upload for another user', async () => {
        const maliciousUpload: NewCreativeAssetUpload = {
          userId: user2.id,
          adAccountId: 'act_rls_2',
          filename: 'malicious.jpg',
          assetType: 'image',
          status: 'pending',
        };

        await expect(
          withUserContext(user1.id, (tx) => tx.insert(creativeAssetUploads).values(maliciousUpload))
        ).rejects.toThrow(/new row violates row-level security policy/);
      });

      it('should prevent user from updating another user upload', async () => {
        const result = await withUserContext(user1.id, (tx) =>
          tx
            .update(creativeAssetUploads)
            .set({ status: 'failed', errorMessage: 'Hijacked' })
            .where(eq(creativeAssetUploads.filename, 'user2_creative.jpg'))
            .returning()
        );

        expect(result).toHaveLength(0);

        // Verify user2's upload was not modified
        const user2Upload = await withUserContext(user2.id, (tx) =>
          tx
            .select()
            .from(creativeAssetUploads)
            .where(eq(creativeAssetUploads.filename, 'user2_creative.jpg'))
        );
        expect(user2Upload[0]?.status).toBe('pending');
        expect(user2Upload[0]?.errorMessage).toBeNull();
      });
    });
  });

  describe('Security and Edge Cases', () => {
    it('should handle non-existent user IDs gracefully', async () => {
      const nonExistentUserId = randomUUID();

      const result = await withUserContext(nonExistentUserId, (tx) => tx.select().from(users));
      expect(result).toHaveLength(0);

      const tokens = await withUserContext(nonExistentUserId, (tx) =>
        tx.select().from(oauthTokens)
      );
      expect(tokens).toHaveLength(0);
    });

    it('should prevent SQL injection via userId parameter', async () => {
      const maliciousId = `${user1.id}'; DELETE FROM users; --`;

      // Drizzle's parameterization should prevent injection
      // The UUID cast in RLS policy will fail with malformed input
      await expect(withUserContext(maliciousId, (tx) => tx.select().from(users))).rejects.toThrow(
        /invalid input syntax for type uuid/
      );
    });

    it('should handle concurrent requests with proper isolation', async () => {
      // Simulate concurrent operations from different users
      const concurrentOperations = Array.from({ length: 5 }, (_, i) => {
        const userId = i % 2 === 0 ? user1.id : user2.id;
        const expectedAccountId = i % 2 === 0 ? 'act_rls_1' : 'act_rls_2';

        return withUserContext(userId, async (tx) => {
          const accounts = await tx.select().from(adAccounts);
          return { userId, accountId: accounts[0]?.id };
        });
      });

      const results = await Promise.all(concurrentOperations);

      // Verify each operation saw only its own user's data
      results.forEach((result, i) => {
        const expectedUserId = i % 2 === 0 ? user1.id : user2.id;
        const expectedAccountId = i % 2 === 0 ? 'act_rls_1' : 'act_rls_2';

        expect(result.userId).toBe(expectedUserId);
        expect(result.accountId).toBe(expectedAccountId);
      });
    });

    it('should enforce RLS even with direct database queries outside withUserContext', async () => {
      // Switch to app_user role to test RLS without context
      await db.execute(sql`SET ROLE app_user`);

      try {
        // Without setting user context, no rows should be visible
        const users_result = await db.select().from(users);
        expect(users_result).toHaveLength(0);

        const tokens_result = await db.select().from(oauthTokens);
        expect(tokens_result).toHaveLength(0);

        const accounts_result = await db.select().from(adAccounts);
        expect(accounts_result).toHaveLength(0);

        const uploads_result = await db.select().from(creativeAssetUploads);
        expect(uploads_result).toHaveLength(0);
      } finally {
        // Reset role to default
        await db.execute(sql`RESET ROLE`);
      }
    });

    it('should maintain transaction isolation during context switches', async () => {
      // Test that switching user context within a transaction is properly isolated
      const operations: Array<{ userId: string; data: any }> = [];

      await withUserContext(user1.id, async (tx) => {
        const user1Data = await tx.select().from(users);
        operations.push({ userId: user1.id, data: user1Data });

        // Nested context switch should not affect outer transaction
        await withUserContext(user2.id, async (innerTx) => {
          const user2Data = await innerTx.select().from(users);
          operations.push({ userId: user2.id, data: user2Data });
        });

        // Back in user1 context - should still see user1 data
        const user1DataAgain = await tx.select().from(users);
        operations.push({ userId: `${user1.id}_again`, data: user1DataAgain });
      });

      // Verify proper isolation
      expect(operations[0]?.data).toHaveLength(1);
      expect(operations[0]?.data[0]?.id).toBe(user1.id);

      expect(operations[1]?.data).toHaveLength(1);
      expect(operations[1]?.data[0]?.id).toBe(user2.id);

      expect(operations[2]?.data).toHaveLength(1);
      expect(operations[2]?.data[0]?.id).toBe(user1.id);
    });

    it('should handle malformed UUID gracefully', async () => {
      const malformedUuid = 'not-a-valid-uuid';

      await expect(withUserContext(malformedUuid, (tx) => tx.select().from(users))).rejects.toThrow(
        /invalid input syntax for type uuid/
      );
    });

    it('should prevent privilege escalation through RLS bypass attempts', async () => {
      // Test that RLS cannot be bypassed through various SQL techniques
      const bypassAttempts = [
        `${user1.id}' OR '1'='1`,
        `${user1.id}'; SET app.current_user_id = '${user2.id}'; --`,
        `${user1.id} UNION SELECT * FROM users --`,
      ];

      for (const maliciousId of bypassAttempts) {
        await expect(
          withUserContext(maliciousId, (tx) => tx.select().from(users))
        ).rejects.toThrow();
      }
    });
  });
});
