import {
  AdAccount as MetaAdAccountSDK,
  CustomAudience as MetaCustomAudienceSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaCreateSuccessResponseSchema,
  MetaCustomAudienceResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';

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
  async getCustomAudiences(authPayload: JWTPayload, params: { adAccountId?: string }) {
    logger.info('Executing get_custom_audiences', { userId: authPayload.userId, params });

    return handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        params.adAccountId
      );

      const audiencesCursor = await new MetaAdAccountSDK(
        adAccountId,
        {},
        null,
        api
      ).getCustomAudiences(CUSTOM_AUDIENCE_FIELDS);

      // Use the common pagination utility to handle all edge cases
      const allRawAudiences = await fetchAllPaginatedData<unknown>({
        cursor: audiencesCursor,
        limit: env.META_MAX_AUDIENCES_TO_FETCH,
        entityName: 'custom audiences',
        userId: authPayload.userId,
        apiContext: { adAccountId },
      });

      // Validate and transform the response using auto-generated schema
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
      logger.info('Successfully retrieved custom audiences', {
        userId: authPayload.userId,
        adAccountId,
        count: validatedAudiences.length,
      });

      return await createMcpSuccessResult(response);
    });
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
  ) {
    logger.info('Executing create_custom_audience', { userId: authPayload.userId, params });

    return handleMetaApiCall(async () => {
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

      const audience = await new MetaAdAccountSDK(adAccountId, {}, null, api).createCustomAudience(
        [],
        audienceData
      );
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

      return await createMcpSuccessResult(
        result,
        `Successfully created custom audience '${params.name}' (ID: ${audienceId}).`
      );
    });
  }

  /**
   * Deletes a custom audience by its ID.
   */
  async deleteCustomAudience(
    authPayload: JWTPayload,
    params: { customAudienceId: string; confirmPermanentDelete?: boolean }
  ) {
    logger.info('Executing delete_custom_audience', { userId: authPayload.userId, params });

    return handleMetaApiCall(async () => {
      const api = await createMetaApiInstance(authPayload.userId);

      // Safety check: require explicit confirmation for permanent deletion
      if (!params.confirmPermanentDelete) {
        throw new ValidationError(
          'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
        );
      }

      const audience = new MetaCustomAudienceSDK(params.customAudienceId, {}, null, api);
      const deleteResponse = await audience.delete([]);

      // Meta API returns { "success": true } for successful deletions
      if (!deleteResponse || (deleteResponse as { success?: boolean }).success !== true) {
        logger.error('Unexpected response from Meta API for delete custom audience', {
          customAudienceId: params.customAudienceId,
          response: deleteResponse,
        });
        throw new ValidationError('Failed to delete custom audience: Unexpected API response.');
      }

      const result = { customAudienceId: params.customAudienceId };
      logger.info('Successfully deleted custom audience', {
        userId: authPayload.userId,
        customAudienceId: params.customAudienceId,
      });

      return await createMcpSuccessResult(
        result,
        `Successfully deleted custom audience ${params.customAudienceId}.`
      );
    });
  }
}
