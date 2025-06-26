import {
  AdAccount as MetaAdAccountSDK,
  CustomAudience as MetaCustomAudienceSDK,
} from 'facebook-nodejs-business-sdk';
import { z } from 'zod';
import {
  MetaCreateSuccessResponseSchema,
  MetaCustomAudienceResponseSchema,
  MetaDeleteSuccessResponseSchema,
} from '../../generated/schemas.js';
import { DeletionConfirmationSchema } from '../../mcp/registries/registryHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateCustomAudienceResult,
  DeleteCustomAudienceResult,
  GetCustomAudiencesResult,
} from './types.js';

// Define validation schema for custom audience deletion
const DeleteCustomAudienceValidationSchema = z.object({
  confirmPermanentDelete: DeletionConfirmationSchema,
});

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
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

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

        const response = { audiences: validatedAudiences };
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
    params: {
      adAccountId?: string;
      name: string;
      description?: string;
      subtype: 'CUSTOM';
    }
  ): Promise<CreateCustomAudienceResult> {
    logger.info('Executing create_custom_audience', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        const audienceData: Record<string, unknown> = {
          [MetaCustomAudienceSDK.Fields.name]: params.name,
          [MetaCustomAudienceSDK.Fields.subtype]: params.subtype,
          [MetaCustomAudienceSDK.Fields.description]: params.description,
        };

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

        const result = { audienceId };
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
    params: { customAudienceId: string; confirmPermanentDelete?: boolean }
  ): Promise<DeleteCustomAudienceResult> {
    logger.info('Executing delete_custom_audience', { userId: authPayload.userId, params });

    const validationResult = DeleteCustomAudienceValidationSchema.safeParse(params);
    if (!validationResult.success) {
      const error = validationResult.error.errors[0];
      throw new ValidationError(error.message);
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

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
