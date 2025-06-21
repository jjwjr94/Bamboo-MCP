import {
  AdAccount as MetaAdAccountSDK,
  CustomAudience as MetaCustomAudienceSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  CustomAudienceListResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CustomAudienceRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';
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
    const adAccountId = await accountManager.requireAccountSelection(
      authPayload.userId,
      params.adAccountId
    );
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const audiencesCursor = await new MetaAdAccountSDK(adAccountId).getCustomAudiences(
        CUSTOM_AUDIENCE_FIELDS
      );

      // Use the common pagination utility to handle all edge cases
      const allRawAudiences = await fetchAllPaginatedData<unknown>({
        cursor: audiencesCursor,
        limit: env.META_MAX_AUDIENCES_TO_FETCH,
        entityName: 'custom audiences',
        userId: authPayload.userId,
        apiContext: { adAccountId },
        dataExtractor: (audience: unknown) => (audience as { _data?: unknown })._data,
      });

      // Validate and transform the response
      const validatedAudiences: z.infer<
        typeof CustomAudienceListResponseSchema
      >['customAudiences'] = [];
      for (const audience of allRawAudiences) {
        const result =
          CustomAudienceListResponseSchema.shape.customAudiences.element.safeParse(audience);
        if (result.success) {
          validatedAudiences.push(result.data);
        } else {
          logger.warn('Invalid custom audience data received from Meta API', {
            error: result.error,
            audience,
            userId: authPayload.userId,
            adAccountId,
          });
        }
      }

      const response = { customAudiences: validatedAudiences };
      logger.info('Successfully retrieved custom audiences', {
        userId: authPayload.userId,
        adAccountId,
        count: validatedAudiences.length,
      });

      return createMcpSuccessResult(response);
    });
  }

  /**
   * Creates a new custom audience.
   */
  async createCustomAudience(
    authPayload: JWTPayload,
    params: CustomAudienceRequest & { adAccountId?: string }
  ) {
    logger.info('Executing create_custom_audience', { userId: authPayload.userId, params });
    const { adAccountId: providedAccountId, ...audienceParams } = params;
    const adAccountId = await accountManager.requireAccountSelection(
      authPayload.userId,
      providedAccountId
    );
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const apiParams: Record<string, unknown> = {
        [MetaCustomAudienceSDK.Fields.name]: audienceParams.name,
        [MetaCustomAudienceSDK.Fields.subtype]: audienceParams.subtype,
        [MetaCustomAudienceSDK.Fields.description]: audienceParams.description,
        [MetaCustomAudienceSDK.Fields.customer_file_source]: audienceParams.customerFileSource,
      };

      removeUndefinedProperties(apiParams);

      const response = await new MetaAdAccountSDK(adAccountId).createCustomAudience([], apiParams);
      const validatedResponse = MetaCreateSuccessResponseSchema.safeParse(response._data);

      if (!validatedResponse.success) {
        logger.error('Invalid response from Meta API for create_custom_audience', {
          error: validatedResponse.error,
          response: response._data,
        });
        throw new ValidationError('Invalid response from Meta API');
      }

      logger.info('Successfully created custom audience', {
        userId: authPayload.userId,
        adAccountId,
        audienceId: validatedResponse.data.id,
      });

      return createMcpSuccessResult(validatedResponse.data);
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
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      // Safety check: require explicit confirmation for permanent deletion
      if (!params.confirmPermanentDelete) {
        throw new ValidationError(
          'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
        );
      }

      const response = await new MetaCustomAudienceSDK(params.customAudienceId).delete([]);
      const validatedResponse = MetaDeleteSuccessResponseSchema.safeParse(response._data);

      if (!validatedResponse.success) {
        logger.error('Invalid response from Meta API for delete_custom_audience', {
          error: validatedResponse.error,
          response: response._data,
        });
        throw new ValidationError('Invalid response from Meta API');
      }

      logger.info('Successfully deleted custom audience', {
        userId: authPayload.userId,
        customAudienceId: params.customAudienceId,
      });

      return createMcpSuccessResult(
        { success: true },
        `Custom audience ${params.customAudienceId} deleted successfully`
      );
    });
  }
}
