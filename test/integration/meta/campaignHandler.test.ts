// Import test environment setup first
import '../../helpers/testEnv.js';

import { http } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MetaCampaignHandler } from '../../../src/tools/meta/campaignHandler.js';
import { MetaApiError, ValidationError } from '../../../src/utils/errors.js';
import {
  TEST_AD_ACCOUNT_ID,
  cleanupTestData,
  createTestAuthPayload,
  seedTestAdAccount,
  seedTestUserAndToken,
} from '../../helpers/db.js';
import {
  createErrorHandler,
  createMetaUrl,
  createNetworkErrorHandler,
  createSuccessHandler,
  server,
} from '../../helpers/msw.js';

import apiErrorFixtures from '../../fixtures/meta/api-errors.json' assert { type: 'json' };
// Load test fixtures
import campaignFixtures from '../../fixtures/meta/campaigns.json' assert { type: 'json' };
import successResponseFixtures from '../../fixtures/meta/success-responses.json' assert {
  type: 'json',
};

// Start MSW server before all tests
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
  await cleanupTestData();
});

const handler = new MetaCampaignHandler();
const mockAuthPayload = createTestAuthPayload();

describe('MetaCampaignHandler', () => {
  describe('getCampaigns', () => {
    it('should return campaigns successfully when Meta API returns valid data', async () => {
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
      expect(result).toBeDefined();
      expect(result.campaigns).toBeInstanceOf(Array);
      expect(result.campaigns).toHaveLength(2);

      const firstCampaign = result.campaigns[0];
      expect(firstCampaign.id).toBe('23844883336250011');
      expect(firstCampaign.name).toBe('Test Campaign 1');
      expect(firstCampaign.status).toBe('ACTIVE');
      expect(firstCampaign.objective).toBe('OUTCOME_LEADS');
    });

    it('should return empty array when Meta API returns no campaigns', async () => {
      // Arrange: Mock empty response
      server.use(
        createSuccessHandler(
          'get',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          campaignFixtures.get.empty
        )
      );

      // Act
      const result = await handler.getCampaigns(mockAuthPayload, {
        adAccountId: TEST_AD_ACCOUNT_ID,
      });

      // Assert
      expect(result.campaigns).toBeInstanceOf(Array);
      expect(result.campaigns).toHaveLength(0);
    });

    it('should throw MetaApiError when Meta API returns authentication error', async () => {
      // Arrange: Mock API error response
      server.use(
        createErrorHandler(
          'get',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          apiErrorFixtures.invalidAccessToken,
          401
        )
      );

      // Act & Assert
      await expect(
        handler.getCampaigns(mockAuthPayload, { adAccountId: TEST_AD_ACCOUNT_ID })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          statusCode: 401,
          metaErrorCode: '190',
          message: expect.stringContaining('Invalid OAuth access token'),
        })
      );
    });

    it('should throw MetaApiError when Meta API returns invalid parameter error', async () => {
      // Arrange
      server.use(
        createErrorHandler(
          'get',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          apiErrorFixtures.invalidParameter,
          400
        )
      );

      // Act & Assert
      await expect(
        handler.getCampaigns(mockAuthPayload, { adAccountId: TEST_AD_ACCOUNT_ID })
      ).rejects.toThrow(MetaApiError);
    });

    it('should throw MetaApiError on network error', async () => {
      // Arrange: Mock network failure
      server.use(
        createNetworkErrorHandler('get', createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`))
      );

      // Act & Assert
      await expect(
        handler.getCampaigns(mockAuthPayload, { adAccountId: TEST_AD_ACCOUNT_ID })
      ).rejects.toThrow(MetaApiError);
    });

    it('should throw MetaApiError when rate limit is exceeded', async () => {
      // Arrange
      server.use(
        createErrorHandler(
          'get',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          apiErrorFixtures.rateLimitExceeded,
          429
        )
      );

      // Act & Assert
      await expect(
        handler.getCampaigns(mockAuthPayload, { adAccountId: TEST_AD_ACCOUNT_ID })
      ).rejects.toThrowError(
        expect.objectContaining({
          name: 'BambooError',
          code: 'META_API_ERROR',
          statusCode: 429,
          metaErrorCode: '4',
          message: expect.stringContaining('Application request limit reached'),
        })
      );
    });
  });

  describe('createCampaign', () => {
    const validCampaignParams = {
      name: 'Test Campaign Creation',
      objective: 'OUTCOME_LEADS' as const,
      status: 'PAUSED' as const,
      dailyBudget: 5000,
      specialAdCategories: ['NONE' as const],
      adAccountId: TEST_AD_ACCOUNT_ID,
    };

    it('should create campaign with correct parameters', async () => {
      // Arrange
      let requestBody: Record<string, unknown> | undefined;

      server.use(
        http.post(`${createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`)}*`, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return Response.json(successResponseFixtures.create.campaign);
        })
      );

      // Act
      const result = await handler.createCampaign(mockAuthPayload, validCampaignParams);

      // Assert Response
      expect(result.campaignId).toBe('23844883336250033');
      expect(result.name).toBe('Test Campaign Creation');
      expect(result.objective).toBe('OUTCOME_LEADS');
      expect(result.status).toBe('PAUSED');

      // Assert Request Body
      expect(requestBody).toBeDefined();
      expect(requestBody?.name).toBe(validCampaignParams.name);
      expect(requestBody?.objective).toBe(validCampaignParams.objective);
      expect(requestBody?.status).toBe(validCampaignParams.status);
      expect(requestBody?.daily_budget).toBe(validCampaignParams.dailyBudget);
      expect(requestBody?.special_ad_categories).toEqual(validCampaignParams.specialAdCategories);
    });

    it('should create campaign with lifetime budget instead of daily budget', async () => {
      const lifetimeBudgetParams = {
        ...validCampaignParams,
        dailyBudget: undefined,
        lifetimeBudget: 100000,
      };

      server.use(
        createSuccessHandler(
          'post',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          successResponseFixtures.create.campaign
        )
      );

      // Act
      const result = await handler.createCampaign(mockAuthPayload, lifetimeBudgetParams);

      // Assert
      expect(result.campaignId).toBe('23844883336250033');
    });

    it('should throw ValidationError when both daily and lifetime budgets are provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        dailyBudget: 5000,
        lifetimeBudget: 100000,
      };

      // Act & Assert
      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        ValidationError
      );

      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        'A campaign must have either a dailyBudget or a lifetimeBudget, but not both'
      );
    });

    it('should throw ValidationError when neither daily nor lifetime budget is provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        dailyBudget: undefined,
        lifetimeBudget: undefined,
      };

      // Act & Assert
      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        ValidationError
      );

      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        'A campaign must have either a dailyBudget or a lifetimeBudget'
      );
    });

    it('should throw ValidationError when special ad category requires country but none provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        specialAdCategories: ['EMPLOYMENT' as const],
        specialAdCategoryCountry: [],
      };

      // Act & Assert
      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        ValidationError
      );

      await expect(handler.createCampaign(mockAuthPayload, invalidParams)).rejects.toThrow(
        'specialAdCategoryCountry'
      );
    });

    it('should throw MetaApiError when Meta API returns validation error', async () => {
      server.use(
        createErrorHandler(
          'post',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          apiErrorFixtures.validationError,
          400
        )
      );

      // Act & Assert
      await expect(handler.createCampaign(mockAuthPayload, validCampaignParams)).rejects.toThrow(
        MetaApiError
      );
    });

    it('should throw MetaApiError on network error during creation', async () => {
      server.use(
        createNetworkErrorHandler('post', createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`))
      );

      // Act & Assert
      await expect(handler.createCampaign(mockAuthPayload, validCampaignParams)).rejects.toThrow(
        MetaApiError
      );
    });
  });

  describe('updateCampaign', () => {
    const campaignId = '23844883336250011';
    const updateParams = {
      campaignId,
      name: 'Updated Campaign Name',
      status: 'ACTIVE',
    };

    it('should update campaign with correct parameters', async () => {
      // Arrange
      let requestBody: Record<string, unknown> | undefined;

      server.use(
        http.post(`${createMetaUrl(`/${campaignId}`)}*`, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return Response.json(successResponseFixtures.update);
        })
      );

      // Act
      const result = await handler.updateCampaign(mockAuthPayload, updateParams);

      // Assert Response
      expect(result.campaignId).toBe(campaignId);
      expect(result.updatedFields).toContain('name');
      expect(result.updatedFields).toContain('status');

      // Assert Request Body
      expect(requestBody).toBeDefined();
      expect(requestBody?.name).toBe(updateParams.name);
      expect(requestBody?.status).toBe(updateParams.status);
    });

    it('should throw MetaApiError when campaign not found', async () => {
      server.use(
        createErrorHandler(
          'post',
          createMetaUrl(`/${campaignId}`),
          apiErrorFixtures.campaignNotFound,
          404
        )
      );

      // Act & Assert
      await expect(handler.updateCampaign(mockAuthPayload, updateParams)).rejects.toThrow(
        MetaApiError
      );
    });

    it('should throw MetaApiError on network error during update', async () => {
      server.use(createNetworkErrorHandler('post', createMetaUrl(`/${campaignId}`)));

      // Act & Assert
      await expect(handler.updateCampaign(mockAuthPayload, updateParams)).rejects.toThrow(
        MetaApiError
      );
    });
  });

  describe('deleteCampaign', () => {
    const campaignId = '23844883336250011';

    it('should delete campaign successfully', async () => {
      server.use(
        createSuccessHandler(
          'delete',
          createMetaUrl(`/${campaignId}`),
          successResponseFixtures.delete
        )
      );

      // Act
      const result = await handler.deleteCampaign(mockAuthPayload, {
        campaignId,
        confirmPermanentDelete: true,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.campaignId).toBe(campaignId);
    });

    it('should throw MetaApiError when campaign not found for deletion', async () => {
      server.use(
        createErrorHandler(
          'delete',
          createMetaUrl(`/${campaignId}`),
          apiErrorFixtures.campaignNotFound,
          404
        )
      );

      // Act & Assert
      await expect(
        handler.deleteCampaign(mockAuthPayload, { campaignId, confirmPermanentDelete: true })
      ).rejects.toThrow(MetaApiError);
    });

    it('should throw MetaApiError on network error during deletion', async () => {
      server.use(createNetworkErrorHandler('delete', createMetaUrl(`/${campaignId}`)));

      // Act & Assert
      await expect(
        handler.deleteCampaign(mockAuthPayload, { campaignId, confirmPermanentDelete: true })
      ).rejects.toThrow(MetaApiError);
    });
  });
});
