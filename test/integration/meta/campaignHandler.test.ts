// Import test environment setup first
import '../../helpers/testEnv.js';

import { http } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';
import { CampaignToolRegistry } from '../../../src/mcp/registries/CampaignToolRegistry.js';
import { MetaToolsHandler } from '../../../src/tools/meta/toolsHandler.js';
import { TEST_AD_ACCOUNT_ID, createTestAuthPayload } from '../../helpers/db.js';
import { invokeTool, mockMcpServer } from '../../helpers/mcp-harness.js';
import {
  createErrorHandler,
  createMetaUrl,
  createNetworkErrorHandler,
  createSuccessHandler,
  server,
} from '../../helpers/msw.js';
import { setupStandardTest } from '../../helpers/test-setup.js';

import apiErrorFixtures from '../../fixtures/meta/api-errors.json' assert { type: 'json' };
// Load test fixtures
import campaignFixtures from '../../fixtures/meta/campaigns.json' assert { type: 'json' };
import successResponseFixtures from '../../fixtures/meta/success-responses.json' assert {
  type: 'json',
};

// Register tools once for the entire test suite
beforeAll(() => {
  const toolsHandler = new MetaToolsHandler();
  const campaignRegistry = new CampaignToolRegistry(mockMcpServer, toolsHandler);
  campaignRegistry.register();
});

const mockAuthPayload = createTestAuthPayload();

describe('MetaCampaignHandler', () => {
  // Centralized setup for DB and MSW
  setupStandardTest();
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        {
          adAccountId: TEST_AD_ACCOUNT_ID,
        },
        mockAuthPayload
      );

      // Assert: Verify MCP success response structure and data
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaigns).toBeInstanceOf(Array);
      expect(result.structuredContent.result.data.campaigns).toHaveLength(2);

      const firstCampaign = result.structuredContent.result.data.campaigns[0];
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        {
          adAccountId: TEST_AD_ACCOUNT_ID,
        },
        mockAuthPayload
      );

      // Assert: Verify MCP success response structure and data
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaigns).toBeInstanceOf(Array);
      expect(result.structuredContent.result.data.campaigns).toHaveLength(0);
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        { adAccountId: TEST_AD_ACCOUNT_ID },
        mockAuthPayload
      );

      // Assert: Check for structured MCP error response
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('190');
      expect(result.structuredContent.result.message).toContain('Authentication failed');
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        { adAccountId: TEST_AD_ACCOUNT_ID },
        mockAuthPayload
      );

      // Assert: Check for structured MCP error response
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('100');
    });

    it('should throw MetaApiError on network error', async () => {
      // Arrange: Mock network failure
      server.use(
        createNetworkErrorHandler('get', createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`))
      );

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        { adAccountId: TEST_AD_ACCOUNT_ID },
        mockAuthPayload
      );

      // Assert: Check for structured MCP error response
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('META_API_ERROR');
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'get_campaigns',
        { adAccountId: TEST_AD_ACCOUNT_ID },
        mockAuthPayload
      );

      // Assert: Check for structured MCP error response
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('4');
      expect(result.structuredContent.result.message).toContain(
        'Application request limit reached'
      );
    });
  });

  describe('createCampaign', () => {
    const validCampaignParams = {
      name: 'Test Campaign Creation',
      objective: 'OUTCOME_LEADS' as const,
      buying_type: 'AUCTION' as const,
      status: 'PAUSED' as const,
      budget: {
        daily: 5000,
      },
      specialAd: {
        categories: ['NONE' as const],
      },
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

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('create_campaign', validCampaignParams, mockAuthPayload);

      // Assert Response
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaignId).toBe('23844883336250033');
      expect(result.structuredContent.result.data.name).toBe('Test Campaign Creation');
      expect(result.structuredContent.result.data.objective).toBe('OUTCOME_LEADS');
      expect(result.structuredContent.result.data.status).toBe('PAUSED');

      // Assert Request Body
      expect(requestBody).toBeDefined();
      expect(requestBody?.name).toBe(validCampaignParams.name);
      expect(requestBody?.objective).toBe(validCampaignParams.objective);
      expect(requestBody?.status).toBe(validCampaignParams.status);
      expect(requestBody?.daily_budget).toBe(validCampaignParams.budget.daily);
      expect(requestBody?.special_ad_categories).toEqual(validCampaignParams.specialAd.categories);
    });

    it('should create campaign with lifetime budget instead of daily budget', async () => {
      const lifetimeBudgetParams = {
        ...validCampaignParams,
        budget: {
          lifetime: 100000,
        },
      };

      server.use(
        createSuccessHandler(
          'post',
          createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`),
          successResponseFixtures.create.campaign
        )
      );

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('create_campaign', lifetimeBudgetParams, mockAuthPayload);

      // Assert
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaignId).toBe('23844883336250033');
    });

    it('should return validation error when both daily and lifetime budgets are provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        budget: {
          daily: 5000,
          lifetime: 100000,
        },
      };

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('create_campaign', invalidParams, mockAuthPayload);

      // Assert: Check for structured MCP validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('VALIDATION_ERROR');
      expect(result.structuredContent.result.message).toContain(
        'A campaign must have either a daily or lifetime budget, but not both'
      );
    });

    it('should return validation error when neither daily nor lifetime budget is provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        budget: {},
      };

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('create_campaign', invalidParams, mockAuthPayload);

      // Assert: Check for structured MCP validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('VALIDATION_ERROR');
      expect(result.structuredContent.result.message).toContain(
        'A campaign must have either a daily or lifetime budget'
      );
    });

    it('should return validation error when special ad category requires country but none provided', async () => {
      const invalidParams = {
        ...validCampaignParams,
        specialAd: {
          categories: ['EMPLOYMENT' as const],
          // country field is omitted/undefined, which is what triggers the validation error
        },
      };

      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('create_campaign', invalidParams, mockAuthPayload);

      // Assert: Check for structured MCP validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('VALIDATION_ERROR');
      expect(result.structuredContent.result.message).toContain(
        "The 'country' parameter is required when 'categories' contains values other than 'NONE'"
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

      // Act
      const result = await invokeTool('create_campaign', validCampaignParams, mockAuthPayload);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('100');
      expect(result.structuredContent.result.message).toContain('Campaign name is required');
    });

    it('should throw MetaApiError on network error during creation', async () => {
      server.use(
        createNetworkErrorHandler('post', createMetaUrl(`/${TEST_AD_ACCOUNT_ID}/campaigns`))
      );

      // Act
      const result = await invokeTool('create_campaign', validCampaignParams, mockAuthPayload);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('META_API_ERROR');
      expect(result.structuredContent.result.message).toContain(
        'The request was made but no response was received'
      );
    });
  });

  describe('updateCampaign', () => {
    const campaignId = '23844883336250011';
    const updateParams = {
      campaignId,
      name: 'Updated Campaign Name',
      status: 'ACTIVE' as const,
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
      const result = await invokeTool('update_campaign', updateParams, mockAuthPayload);

      // Assert Response
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaignId).toBe(campaignId);
      expect(result.structuredContent.result.data.updatedFields).toEqual(['name', 'status']);

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

      // Act
      const result = await invokeTool('update_campaign', updateParams, mockAuthPayload);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('100');
      expect(result.structuredContent.result.message).toContain('Campaign not found');
    });

    it('should throw MetaApiError on network error during update', async () => {
      server.use(createNetworkErrorHandler('post', createMetaUrl(`/${campaignId}`)));

      // Act
      const result = await invokeTool('update_campaign', updateParams, mockAuthPayload);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('META_API_ERROR');
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
      const result = await invokeTool(
        'delete_campaign',
        {
          campaignId,
          confirmPermanentDelete: true,
        },
        mockAuthPayload
      );

      // Assert
      expect(result.isError).toBe(false);
      expect(result.structuredContent.result.type).toBe('success');
      expect(result.structuredContent.result.data.campaignId).toBe(campaignId);
    });

    it('should return validation error if confirmPermanentDelete is missing', async () => {
      // Act: Call the tool through the MCP test harness
      const result = await invokeTool('delete_campaign', { campaignId }, mockAuthPayload);

      // Assert: Check for structured MCP validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('VALIDATION_ERROR');
      expect(result.structuredContent.result.message).toContain(
        'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.'
      );
    });

    it('should return validation error if confirmPermanentDelete is false', async () => {
      // Act: Call the tool through the MCP test harness
      const result = await invokeTool(
        'delete_campaign',
        { campaignId, confirmPermanentDelete: false },
        mockAuthPayload
      );

      // Assert: Check for structured MCP validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('VALIDATION_ERROR');
      expect(result.structuredContent.result.message).toContain(
        'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.'
      );
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

      // Act
      const result = await invokeTool(
        'delete_campaign',
        { campaignId, confirmPermanentDelete: true },
        mockAuthPayload
      );

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('100');
    });

    it('should throw MetaApiError on network error during deletion', async () => {
      server.use(createNetworkErrorHandler('delete', createMetaUrl(`/${campaignId}`)));

      // Act
      const result = await invokeTool(
        'delete_campaign',
        { campaignId, confirmPermanentDelete: true },
        mockAuthPayload
      );

      // Assert
      expect(result.isError).toBe(true);
      expect(result.structuredContent.result.type).toBe('error');
      expect(result._meta.errorMetadata.errorCode).toBe('META_API_ERROR');
    });
  });
});
