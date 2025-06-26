// Import test environment setup first
import '../../helpers/testEnv.js';

import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db, withUserContext } from '../../../src/db/client.js';
import { adAccounts, creativeAssetUploads, users } from '../../../src/db/schema.js';
import type { NewCreativeAssetUpload } from '../../../src/db/schema.js';
import { AdCreativeUploadHandler } from '../../../src/tools/meta/adCreativeUploadHandler.js';

import {
  TEST_AD_ACCOUNT_ID,
  TEST_USER_ID,
  cleanupTestData,
  createTestAuthPayload,
  seedMultipleAdAccounts,
  seedTestAdAccount,
  seedTestUserAndToken,
} from '../../helpers/db.js';
import { server } from '../../helpers/msw.js';

// Load test fixtures
import uploadFixtures from '../../fixtures/meta/uploads.json' assert { type: 'json' };

// Start MSW server before all tests for consistency, even if not all tests make API calls.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers after each test to ensure test isolation
afterEach(() => server.resetHandlers());

// Stop MSW server after all tests
afterAll(() => server.close());

// Seed database before each test
beforeEach(async () => {
  await seedTestUserAndToken();
  await seedTestAdAccount();
});

// Clean up database after each test
afterEach(async () => {
  // Use database owner permissions to bypass RLS during cleanup
  await db.transaction(async (tx) => {
    await tx.execute(sql`RESET ROLE`);
    await tx.delete(creativeAssetUploads);
  });
  await cleanupTestData();
});

const handler = new AdCreativeUploadHandler();
const mockAuthPayload = createTestAuthPayload();

// Helper to seed upload records for tests
async function seedUploadRecord(data: Partial<NewCreativeAssetUpload>) {
  const [record] = await withUserContext(data.userId || TEST_USER_ID, async (tx) => {
    return tx
      .insert(creativeAssetUploads)
      .values({
        userId: data.userId || TEST_USER_ID,
        adAccountId: data.adAccountId || TEST_AD_ACCOUNT_ID,
        assetType: 'pending',
        status: 'pending',
        ...data,
      })
      .returning();
  });
  return record;
}

describe('AdCreativeUploadHandler', () => {
  describe('initiateAssetUpload', () => {
    it('should successfully initiate an upload and create a database record', async () => {
      // Act
      const result = await handler.initiateAssetUpload(mockAuthPayload, {
        adAccountId: TEST_AD_ACCOUNT_ID,
      });

      // Assert: Response structure
      expect(result).toBeDefined();
      expect(result.uploadId).toEqual(expect.any(String));
      expect(result.uploadUrl).toContain(`/v1/assets/upload/${result.uploadId}`);

      // Assert: Database record was created
      const dbRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, result.uploadId),
      });
      expect(dbRecord).toBeDefined();
      expect(dbRecord?.userId).toBe(TEST_USER_ID);
      expect(dbRecord?.adAccountId).toBe(TEST_AD_ACCOUNT_ID);
      expect(dbRecord?.status).toBe('pending');
      expect(dbRecord?.assetType).toBe('pending');
      expect(dbRecord?.expiresAt).toBeInstanceOf(Date);
    });

    it('should auto-select the ad account if only one is available', async () => {
      // Act: Don't specify adAccountId, should auto-select
      const result = await handler.initiateAssetUpload(mockAuthPayload, {});

      // Assert: Upload was created with the auto-selected account
      expect(result.uploadId).toBeDefined();
      const dbRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, result.uploadId),
      });
      expect(dbRecord?.adAccountId).toBe(TEST_AD_ACCOUNT_ID);
    });

    it('should throw ValidationError if multiple accounts exist and none is specified', async () => {
      // Arrange: Clean up existing account and seed multiple accounts
      await db.transaction(async (tx) => {
        await tx.execute(sql`RESET ROLE`);
        await tx.delete(adAccounts);
      });
      await seedMultipleAdAccounts();

      // Act & Assert
      await expect(handler.initiateAssetUpload(mockAuthPayload, {})).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          metaErrorCode: 'VALIDATION_ERROR',
          message: expect.stringContaining(
            'Multiple ad accounts available. Please specify which account to use'
          ),
        })
      );
    });

    it('should create upload record with correct expiration time', async () => {
      // Act
      const result = await handler.initiateAssetUpload(mockAuthPayload, {
        adAccountId: TEST_AD_ACCOUNT_ID,
      });

      // Assert: Check expiration is set correctly (24 hours from now)
      const dbRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, result.uploadId),
      });

      const now = new Date();
      const twentyThreeHours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const twentyFiveHours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      expect(dbRecord?.expiresAt).toBeInstanceOf(Date);
      expect(dbRecord?.expiresAt?.getTime()).toBeGreaterThan(twentyThreeHours.getTime());
      expect(dbRecord?.expiresAt?.getTime()).toBeLessThan(twentyFiveHours.getTime());
    });
  });

  describe('getAssetUploadStatus', () => {
    it('should retrieve the status for a PENDING upload', async () => {
      // Arrange
      const seededRecord = await seedUploadRecord({ status: 'pending' });

      // Act
      const result = await handler.getAssetUploadStatus(mockAuthPayload, {
        uploadId: seededRecord.id,
      });

      // Assert
      expect(result.status).toBe('pending');
      expect(result.metaAssetId).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
    });

    it('should retrieve the status for an UPLOADING upload', async () => {
      // Arrange
      const seededRecord = await seedUploadRecord({ status: 'uploading' });

      // Act
      const result = await handler.getAssetUploadStatus(mockAuthPayload, {
        uploadId: seededRecord.id,
      });

      // Assert
      expect(result.status).toBe('uploading');
      expect(result.metaAssetId).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
    });

    it('should retrieve the status and metaAssetId for a COMPLETED upload', async () => {
      // Arrange
      const fixture = uploadFixtures.status.completed;
      const seededRecord = await seedUploadRecord({
        status: 'completed',
        metaAssetId: fixture.metaAssetId,
        assetType: 'image',
      });

      // Act
      const result = await handler.getAssetUploadStatus(mockAuthPayload, {
        uploadId: seededRecord.id,
      });

      // Assert
      expect(result.status).toBe(fixture.status);
      expect(result.metaAssetId).toBe(fixture.metaAssetId);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should retrieve the status and errorMessage for a FAILED upload', async () => {
      // Arrange
      const fixture = uploadFixtures.status.failed;
      const seededRecord = await seedUploadRecord({
        status: 'failed',
        errorMessage: fixture.errorMessage,
      });

      // Act
      const result = await handler.getAssetUploadStatus(mockAuthPayload, {
        uploadId: seededRecord.id,
      });

      // Assert
      expect(result.status).toBe(fixture.status);
      expect(result.errorMessage).toBe(fixture.errorMessage);
      expect(result.metaAssetId).toBeUndefined();
    });

    it('should throw NotFoundError if the upload ID does not exist', async () => {
      // Arrange
      const nonExistentId = randomUUID();

      // Act & Assert
      await expect(
        handler.getAssetUploadStatus(mockAuthPayload, { uploadId: nonExistentId })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          metaErrorCode: 'NOT_FOUND',
          message: expect.stringContaining(`Upload request with ID ${nonExistentId}`),
        })
      );
    });

    it('should throw NotFoundError when accessing an upload belonging to another user due to RLS', async () => {
      // Arrange: Create a second user and an upload record for them
      const anotherUserId = randomUUID();

      // Use database owner permissions to create the other user
      await db.transaction(async (tx) => {
        await tx.execute(sql`RESET ROLE`);
        await tx.insert(users).values({
          id: anotherUserId,
          facebookUserId: 'another_user_fb_id',
        });
      });

      const anotherUserUpload = await seedUploadRecord({ userId: anotherUserId });

      // Act & Assert: Try to access the other user's upload with the primary test user's auth
      await expect(
        handler.getAssetUploadStatus(mockAuthPayload, { uploadId: anotherUserUpload.id })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          metaErrorCode: 'NOT_FOUND',
          message: expect.stringContaining(`Upload request with ID ${anotherUserUpload.id}`),
        })
      );

      // Cleanup the additional user
      await db.transaction(async (tx) => {
        await tx.execute(sql`RESET ROLE`);
        await tx.delete(users).where(eq(users.id, anotherUserId));
      });
    });

    it('should handle uploads with both metaAssetId and errorMessage (edge case)', async () => {
      // Arrange: Create a record that has both (unusual but possible in edge cases)
      const seededRecord = await seedUploadRecord({
        status: 'failed',
        metaAssetId: 'some_meta_id',
        errorMessage: 'Had ID but still failed',
      });

      // Act
      const result = await handler.getAssetUploadStatus(mockAuthPayload, {
        uploadId: seededRecord.id,
      });

      // Assert: Both fields should be returned
      expect(result.status).toBe('failed');
      expect(result.metaAssetId).toBe('some_meta_id');
      expect(result.errorMessage).toBe('Had ID but still failed');
    });
  });

  describe('Database RLS enforcement', () => {
    it('should enforce user isolation in initiateAssetUpload database operations', async () => {
      // This test ensures the handler respects RLS by only creating records for the authenticated user
      const result = await handler.initiateAssetUpload(mockAuthPayload, {
        adAccountId: TEST_AD_ACCOUNT_ID,
      });

      // The record should be created with the correct user ID from the auth payload
      const dbRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, result.uploadId),
      });

      expect(dbRecord?.userId).toBe(mockAuthPayload.userId);
    });
  });
});
