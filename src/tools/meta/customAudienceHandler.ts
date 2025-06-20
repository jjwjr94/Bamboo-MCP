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
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

// Type for the cursor to improve type safety
interface PaginatedCursor<T> extends Array<T> {
  next?: () => Promise<PaginatedCursor<T>>;
  hasNext?: () => boolean;
}

const MAX_AUDIENCES_TO_FETCH = 1000;

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
      const fields = [
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

      const audiencesCursor = await new MetaAdAccountSDK(adAccountId).getCustomAudiences(fields);

      // Handle pagination with improved type safety and fetch limit
      const allRawAudiences: unknown[] = [];
      let currentCursor: PaginatedCursor<unknown> = audiencesCursor;

      while (currentCursor && currentCursor.length > 0) {
        allRawAudiences.push(...currentCursor);

        if (allRawAudiences.length >= MAX_AUDIENCES_TO_FETCH) {
          logger.warn('Reached maximum audience fetch limit', {
            limit: MAX_AUDIENCES_TO_FETCH,
            userId: authPayload.userId,
            adAccountId,
          });
          break;
        }

        // Check for pagination
        if (typeof currentCursor.next === 'function' && currentCursor.hasNext?.()) {
          currentCursor = await currentCursor.next();
        } else {
          break;
        }
      }

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
