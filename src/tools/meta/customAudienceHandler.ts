import {
  AdAccount as MetaAdAccountSDK,
  CustomAudience as MetaCustomAudienceSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaCreateSuccessResponseSchema,
  MetaCustomAudienceResponseSchema,
  MetaDeleteSuccessResponseSchema,
} from '../../generated/schemas.js';
import type {
  CreateCustomAudienceRequest,
  DeleteCustomAudienceRequest,
} from '../../mcp/registries/CustomAudienceToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { convertKeysToSnakeCase, removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateCustomAudienceResult,
  DeleteCustomAudienceResult,
  GetCustomAudiencesResult,
} from './types.js';

// Note: Input validation is now handled at the MCP tool registration level.

// Module-level constants for better performance and readability
const CUSTOM_AUDIENCE_FIELDS = [
  MetaCustomAudienceSDK.Fields.id,
  MetaCustomAudienceSDK.Fields.name,
  MetaCustomAudienceSDK.Fields.description,
  MetaCustomAudienceSDK.Fields.subtype,
  MetaCustomAudienceSDK.Fields.approximate_count_lower_bound,
  MetaCustomAudienceSDK.Fields.approximate_count_upper_bound,
  MetaCustomAudienceSDK.Fields.time_updated,
  MetaCustomAudienceSDK.Fields.retention_days,
  MetaCustomAudienceSDK.Fields.customer_file_source,
];

export class MetaCustomAudienceHandler {
  /**
   * Retrieves custom audiences for a given ad account.
   */
  async getCustomAudiences(
    authPayload: JWTPayload,
    params: { adAccountId?: string }
  ): Promise<GetCustomAudiencesResult> {
    logger.info('Executing get_custom_audiences', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required for get_custom_audiences. Please provide the Meta Ads account ID (format: act_XXXXXXXXX)');
        }

        const customAudiencesCursor = await new MetaAdAccountSDK(
          adAccountId,
          {},
          null,
          api
        ).getCustomAudiences(CUSTOM_AUDIENCE_FIELDS);

        const allRawAudiences = await fetchAllPaginatedData<unknown>({
          cursor: customAudiencesCursor,
          limit: env.META_MAX_AUDIENCES_TO_FETCH,
          entityName: 'custom audiences',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });

        const validatedAudiences: z.infer<typeof MetaCustomAudienceResponseSchema>[] = [];
        for (const audience of allRawAudiences) {
          const result = MetaCustomAudienceResponseSchema.safeParse(audience);
          if (result.success) {
            validatedAudiences.push(result.data);
          } else {
            logger.warn('Invalid custom audience data received from Meta API, skipping.', {
              error: result.error.format(),
              audience,
              userId: authPayload.userId,
              adAccountId,
            });
          }
        }

        // Transform to match Meta API v22+ actual response schema
        // Note: Using type assertion here is safe because data is already validated by MetaCustomAudienceResponseSchema
        const transformedAudiences = validatedAudiences.map((audience) => ({
          id: audience.id as string,
          account_id: audience.account_id as string | undefined,
          name: audience.name as string,
          description: audience.description as string | undefined,
          approximate_count: audience.approximate_count as number | undefined,
          approximate_count_lower_bound: audience.approximate_count_lower_bound as
            | number
            | undefined,
          approximate_count_upper_bound: audience.approximate_count_upper_bound as
            | number
            | undefined,
          customer_file_source: audience.customer_file_source as string | undefined,
          delivery_status: audience.delivery_status as { code?: string } | undefined,
          external_event_source: audience.external_event_source as object | undefined,
          is_value_based: audience.is_value_based as string | undefined,
          lookalike_audience_ids: audience.lookalike_audience_ids as object | undefined,
          lookalike_spec: audience.lookalike_spec as object | undefined,
          operation_status: audience.operation_status as object | undefined,
          opt_out_link: audience.opt_out_link as string | undefined,
          pixel_id: audience.pixel_id as string | undefined,
          retention_days: audience.retention_days as number | undefined,
          time_created: audience.time_created as number | undefined,
          time_updated: audience.time_updated as number | undefined,
          data_source: audience.data_source as { type: string; sub_type?: string } | undefined,
          permission_for_actions: audience.permission_for_actions as object | undefined,
          sharing_status: audience.sharing_status as object | undefined,
          subtype: audience.subtype as string | undefined,
        }));

        const response = { customAudiences: transformedAudiences };
        logger.info('Retrieved custom audiences', {
          userId: authPayload.userId,
          count: validatedAudiences.length,
        });

        return response;
      },
      {
        toolName: 'get_custom_audiences',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Creates a new custom audience.
   */
  async createCustomAudience(
    authPayload: JWTPayload,
    params: CreateCustomAudienceRequest
  ): Promise<CreateCustomAudienceResult> {
    logger.info('Executing create_custom_audience', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // For deployed environment, use direct token authentication
        // This bypasses database access which is causing ECONNREFUSED errors
        const adAccountId = params.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required for create_custom_audience. Please provide the Meta Ads account ID (format: act_XXXXXXXXX)');
        }

        // Create a consolidated, camelCased object for API parameters
        const apiParams = {
          name: params.name,
          subtype: params.subtype,
          description: params.description,
        };

        // Convert keys to snake_case and remove undefined properties
        const audienceData = convertKeysToSnakeCase(apiParams);
        removeUndefinedProperties(audienceData);

        const audience = await new MetaAdAccountSDK(
          adAccountId,
          {},
          null,
          api
        ).createCustomAudience([], audienceData);
        const validation = MetaCreateSuccessResponseSchema.safeParse(audience);

        if (!validation.success) {
          logger.error('Invalid response from Meta API for create custom audience', {
            error: validation.error.format(),
            response: audience,
          });
          throw new ValidationError('Failed to create custom audience: Invalid API response.');
        }

        const audienceId = validation.data.id;

        const result = {
          name: params.name,
          subtype: params.subtype,
          customAudienceId: audienceId,
        };
        logger.info('Successfully created custom audience', {
          userId: authPayload.userId,
          adAccountId,
          audienceId,
          name: params.name,
        });

        return result;
      },
      {
        toolName: 'create_custom_audience',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Deletes a custom audience by its ID.
   */
  async deleteCustomAudience(
    authPayload: JWTPayload,
    params: DeleteCustomAudienceRequest
  ): Promise<DeleteCustomAudienceResult> {
    logger.info('Executing delete_custom_audience', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        const customAudience = new MetaCustomAudienceSDK(params.customAudienceId, {}, null, api);
        const deleteResponse = await customAudience.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
        if (!validation.success || !validation.data.success) {
          logger.error('Invalid response from Meta API for delete custom audience', {
            error: validation.success ? 'success field was false' : validation.error.format(),
            response: deleteResponse,
          });
          throw new ValidationError('Failed to delete custom audience: Invalid API response.');
        }

        const result = { customAudienceId: params.customAudienceId };
        logger.info('Successfully deleted custom audience', {
          userId: authPayload.userId,
          customAudienceId: params.customAudienceId,
        });

        return result;
      },
      {
        toolName: 'delete_custom_audience',
        userId: authPayload.userId,
      }
    );
  }
}
