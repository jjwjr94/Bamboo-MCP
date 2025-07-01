import '../../helpers/testEnv.js'; // Must be first to set environment variables
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withUserContext } from '../../../src/db/client.js';
import { adAccounts } from '../../../src/db/schema.js';
import { MetaBusinessManagerHandler } from '../../../src/tools/meta/businessManagerHandler.js';
import { BusinessContextCoordinator } from '../../../src/utils/businessContextCoordinator.js';
import apiErrors from '../../fixtures/meta/api-errors.json';
import {
  TEST_ACCESS_TOKEN,
  TEST_BUSINESS_ID,
  TEST_USER_ID,
  cleanupTestData,
  createTestAuthPayload,
  seedTestUserAndToken,
} from '../../helpers/db.js';
import {
  createErrorHandler,
  createMetaUrl,
  createSuccessHandler,
  server,
} from '../../helpers/msw.js';

// MSW server setup
beforeAll(() => server.listen());
afterAll(() => server.close());

// Database setup
beforeEach(async () => {
  await seedTestUserAndToken();
});

afterEach(async () => {
  await cleanupTestData();
  server.resetHandlers();
});

describe('MetaBusinessManagerHandler', () => {
  const handler = new MetaBusinessManagerHandler();
  const mockAuthPayload = createTestAuthPayload();

  describe('get_business_accounts', () => {
    it('should retrieve business accounts successfully', async () => {
      // Arrange: Mock successful API response
      const businessAccountsResponse = {
        data: [
          { id: 'business_123', name: 'Test Business 1' },
          { id: 'business_456', name: 'Test Business 2' },
        ],
        paging: {
          cursors: {
            before: 'before_cursor',
            after: 'after_cursor',
          },
        },
      };

      server.use(
        createSuccessHandler('get', `${createMetaUrl('/me/businesses')}*`, businessAccountsResponse)
      );

      // Act
      const result = await handler.getBusinessAccounts(mockAuthPayload);

      // Assert
      expect(result).toBeDefined();
      expect(result.businessAccounts).toHaveLength(2);
      expect(result.businessAccounts[0]).toMatchObject({
        id: 'business_123',
        name: 'Test Business 1',
      });
      expect(result.businessAccounts[1]).toMatchObject({
        id: 'business_456',
        name: 'Test Business 2',
      });
    });

    it('should handle empty business accounts list', async () => {
      // Arrange: Mock empty response
      const emptyResponse = {
        data: [],
        paging: {},
      };

      server.use(createSuccessHandler('get', `${createMetaUrl('/me/businesses')}*`, emptyResponse));

      // Act
      const result = await handler.getBusinessAccounts(mockAuthPayload);

      // Assert
      expect(result).toBeDefined();
      expect(result.businessAccounts).toHaveLength(0);
    });

    it('should throw MetaApiError when API returns error', async () => {
      // Arrange: Mock API error
      server.use(
        createErrorHandler(
          'get',
          `${createMetaUrl('/me/businesses')}*`,
          apiErrors.insufficientPermissions,
          403
        )
      );

      // Act & Assert
      await expect(handler.getBusinessAccounts(mockAuthPayload)).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          statusCode: 403,
        })
      );
    });
  });

  describe('get_business_users', () => {
    const testBusinessId = 'business_123';

    it('should retrieve business users successfully', async () => {
      // Arrange: Mock successful API response
      const businessUsersResponse = {
        data: [
          {
            id: 'user_abc',
            name: 'Test User A',
            email: 'user.a@example.com',
            role: 'ADMIN',
          },
          {
            id: 'user_def',
            name: 'Test User B',
            email: 'user.b@example.com',
            role: 'EMPLOYEE',
          },
        ],
      };

      server.use(
        createSuccessHandler(
          'get',
          `${createMetaUrl(`/${testBusinessId}/business_users`)}*`,
          businessUsersResponse
        )
      );

      // Act
      const result = await handler.getBusinessUsers(mockAuthPayload, {
        businessId: testBusinessId,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.businessUsers).toHaveLength(2);
      expect(result.businessUsers[0]).toMatchObject({
        id: 'user_abc',
        name: 'Test User A',
        email: 'user.a@example.com',
        role: 'ADMIN',
      });
    });

    it('should handle business not found error', async () => {
      // Arrange: Mock business not found error
      const notFoundError = {
        error: {
          message: 'Business not found',
          type: 'OAuthException',
          code: 100,
          error_subcode: 1487742,
          fbtrace_id: 'NotFound123',
        },
      };

      server.use(
        createErrorHandler(
          'get',
          `${createMetaUrl(`/${testBusinessId}/business_users`)}*`,
          notFoundError,
          404
        )
      );

      // Act & Assert
      await expect(
        handler.getBusinessUsers(mockAuthPayload, { businessId: testBusinessId })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          statusCode: 404,
        })
      );
    });

    it('should require businessId parameter', async () => {
      // Act & Assert
      await expect(
        // @ts-expect-error - Testing missing required parameter
        handler.getBusinessUsers(mockAuthPayload, {})
      ).rejects.toThrowError('Business Id not defined');
    });
  });

  describe('Business Context Discovery', () => {
    const TEST_AD_ACCOUNT_ID = 'act_9876543210';

    it('should discover and cache business context for new accounts', async () => {
      // Arrange: Mock batch API response for context discovery
      const batchContextResponse = [
        {
          code: 200,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          body: JSON.stringify({
            business: { id: TEST_BUSINESS_ID },
            name: 'Test Ad Account',
            status: 'ACTIVE',
            id: TEST_AD_ACCOUNT_ID,
          }),
        },
      ];

      server.use(createSuccessHandler('post', createMetaUrl('/'), batchContextResponse));

      // Verify account doesn't exist in DB initially
      const initialResult = await withUserContext(TEST_USER_ID, async (tx) =>
        tx.query.adAccounts.findFirst({
          where: eq(adAccounts.id, TEST_AD_ACCOUNT_ID),
        })
      );
      expect(initialResult).toBeUndefined();

      // Act: Trigger business context discovery
      await BusinessContextCoordinator.ensureBusinessContext(TEST_USER_ID, TEST_ACCESS_TOKEN, [
        TEST_AD_ACCOUNT_ID,
      ]);

      // Assert: Verify the account was discovered and cached
      const result = await withUserContext(TEST_USER_ID, async (tx) =>
        tx.query.adAccounts.findFirst({
          where: eq(adAccounts.id, TEST_AD_ACCOUNT_ID),
        })
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(TEST_AD_ACCOUNT_ID);
      expect(result?.businessId).toBe(TEST_BUSINESS_ID);
      expect(result?.name).toBe('Test Ad Account');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.userId).toBe(TEST_USER_ID);
    });

    it('should handle personal account discovery (no business)', async () => {
      const PERSONAL_ACCOUNT_ID = 'act_1111111111';

      // Arrange: Mock batch API response for personal account
      const batchContextResponse = [
        {
          code: 200,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          body: JSON.stringify({
            name: 'Personal Ad Account',
            status: 'ACTIVE',
            id: PERSONAL_ACCOUNT_ID,
            // Note: no business property
          }),
        },
      ];

      server.use(createSuccessHandler('post', createMetaUrl('/'), batchContextResponse));

      // Act
      await BusinessContextCoordinator.ensureBusinessContext(TEST_USER_ID, TEST_ACCESS_TOKEN, [
        PERSONAL_ACCOUNT_ID,
      ]);

      // Assert: Personal account should have null businessId
      const result = await withUserContext(TEST_USER_ID, async (tx) =>
        tx.query.adAccounts.findFirst({
          where: eq(adAccounts.id, PERSONAL_ACCOUNT_ID),
        })
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(PERSONAL_ACCOUNT_ID);
      expect(result?.businessId).toBeNull();
      expect(result?.name).toBe('Personal Ad Account');
    });

    it('should handle batch API errors gracefully', async () => {
      const FAILED_ACCOUNT_ID = 'act_2222222222';

      // Arrange: Mock batch API response with error
      const batchErrorResponse = [
        {
          code: 403,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          body: JSON.stringify({
            error: {
              message: 'Insufficient permission to access object',
              type: 'OAuthException',
              code: 200,
              error_subcode: 1348092,
            },
          }),
        },
      ];

      server.use(createSuccessHandler('post', createMetaUrl('/'), batchErrorResponse));

      // Act & Assert: Should not throw but also shouldn't cache the account
      await expect(
        BusinessContextCoordinator.ensureBusinessContext(TEST_USER_ID, TEST_ACCESS_TOKEN, [
          FAILED_ACCOUNT_ID,
        ])
      ).resolves.not.toThrow();

      // Verify account was not cached
      const result = await withUserContext(TEST_USER_ID, async (tx) =>
        tx.query.adAccounts.findFirst({
          where: eq(adAccounts.id, FAILED_ACCOUNT_ID),
        })
      );

      expect(result).toBeUndefined();
    });

    it('should skip accounts that are already cached', async () => {
      const EXISTING_ACCOUNT_ID = 'act_3333333333';

      // Arrange: Pre-seed an account in the database
      await withUserContext(TEST_USER_ID, async (tx) => {
        await tx.insert(adAccounts).values({
          id: EXISTING_ACCOUNT_ID,
          userId: TEST_USER_ID,
          name: 'Existing Account',
          status: 'ACTIVE',
          businessId: TEST_BUSINESS_ID,
          permissions: ['MANAGE'],
        });
      });

      // Act: Try to discover context for already cached account
      await BusinessContextCoordinator.ensureBusinessContext(TEST_USER_ID, TEST_ACCESS_TOKEN, [
        EXISTING_ACCOUNT_ID,
      ]);

      // Assert: Should not have made any API calls (no MSW handlers setup)
      // The fact that this doesn't throw means no unexpected API calls were made

      // Verify the account still exists with original data
      const result = await withUserContext(TEST_USER_ID, async (tx) =>
        tx.query.adAccounts.findFirst({
          where: eq(adAccounts.id, EXISTING_ACCOUNT_ID),
        })
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('Existing Account');
    });
  });
});
