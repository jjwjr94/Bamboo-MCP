import {
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaAdCreativeResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdCreativeRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { handleMetaApiCall, initializeMetaApi } from './api.js';

const MAX_CREATIVES_TO_FETCH = 1000;

export class MetaAdCreativeHandler {
  async getAdCreatives(authPayload: JWTPayload, params: { adAccountId?: string }) {
    logger.info('Executing get_ad_creatives', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const fields = [
        MetaAdCreativeSDK.Fields.id,
        MetaAdCreativeSDK.Fields.name,
        MetaAdCreativeSDK.Fields.status,
        MetaAdCreativeSDK.Fields.object_story_spec,
        MetaAdCreativeSDK.Fields.thumbnail_url,
        MetaAdCreativeSDK.Fields.image_url,
        MetaAdCreativeSDK.Fields.title,
        MetaAdCreativeSDK.Fields.body,
        MetaAdCreativeSDK.Fields.call_to_action_type,
        MetaAdCreativeSDK.Fields.link_url,
      ];

      const creativesCursor = await new MetaAdAccountSDK(adAccountId).getAdCreatives(fields);

      // Handle pagination - fetch all pages with safety limit
      let currentCursor = creativesCursor as any; // Cast to access pagination methods
      const allRawCreatives: any[] = [];

      while (currentCursor && currentCursor.length > 0) {
        allRawCreatives.push(...currentCursor);

        // Safety limit to prevent resource exhaustion
        if (allRawCreatives.length >= MAX_CREATIVES_TO_FETCH) {
          logger.warn('Reached maximum ad creatives limit, truncating results', {
            limit: MAX_CREATIVES_TO_FETCH,
          });
          break;
        }

        if (typeof currentCursor.hasNext === 'function' && currentCursor.hasNext()) {
          currentCursor = await currentCursor.next();
        } else {
          break;
        }
      }

      const validatedCreatives: z.infer<typeof MetaAdCreativeResponseSchema>[] = [];
      for (const creative of allRawCreatives) {
        const result = MetaAdCreativeResponseSchema.safeParse(creative);
        if (result.success) {
          validatedCreatives.push(result.data);
        } else {
          logger.warn('Skipping invalid ad creative data from Meta API', {
            creativeId: (creative as { id?: string }).id || 'Unknown ID',
            errors: result.error.format(), // Use .format() for better readability
          });
        }
      }

      return createMcpSuccessResult(
        { adCreatives: validatedCreatives },
        `Retrieved ${validatedCreatives.length} ad creatives`
      );
    });
  }

  async createAdCreative(
    authPayload: JWTPayload,
    params: CreateAdCreativeRequest & { adAccountId?: string }
  ) {
    logger.info('Executing create_ad_creative', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const adAccountId =
        params.adAccountId ||
        (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

      const creativeData: Record<string, unknown> = {
        [MetaAdCreativeSDK.Fields.name]: params.name,
        [MetaAdCreativeSDK.Fields.object_story_spec]: params.objectStorySpec,
      };

      const creative = await new MetaAdAccountSDK(adAccountId).createAdCreative([], creativeData);

      // Treat response as unknown and validate
      const validationResult = MetaCreateSuccessResponseSchema.safeParse(creative);
      if (!validationResult.success) {
        const errorMessage = 'Failed to create ad creative: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const adCreativeId = validationResult.data.id;
      const result = {
        success: true,
        adCreativeId: adCreativeId,
        name: params.name,
        message: `Ad creative "${params.name}" created successfully with ID: ${adCreativeId}`,
      };
      return createMcpSuccessResult(result, 'Ad creative created successfully');
    });
  }

  async updateAdCreative(authPayload: JWTPayload, params: { adCreativeId: string; name: string }) {
    logger.info('Executing update_ad_creative', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      const updateData = { [MetaAdCreativeSDK.Fields.name]: params.name };
      const creative = new MetaAdCreativeSDK(params.adCreativeId);
      const updateResponse = await creative.update([], updateData);

      // Treat response as unknown and validate
      const validationResult = MetaUpdateSuccessResponseSchema.safeParse(updateResponse);
      if (!validationResult.success) {
        const errorMessage = 'Failed to update ad creative: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const result = {
        success: true,
        adCreativeId: params.adCreativeId,
        updatedFields: Object.keys(updateData), // Make this dynamic
        message: `Ad creative ${params.adCreativeId} updated successfully`,
      };
      return createMcpSuccessResult(result, 'Ad creative updated successfully');
    });
  }

  async deleteAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; confirmPermanentDelete?: boolean }
  ) {
    logger.info('Executing delete_ad_creative', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);
    return await handleMetaApiCall(async () => {
      // Safety check: require explicit confirmation for permanent deletion
      if (!params.confirmPermanentDelete) {
        throw new ValidationError(
          'Permanent deletion requires explicit confirmation. Set confirmPermanentDelete to true.'
        );
      }

      const creative = new MetaAdCreativeSDK(params.adCreativeId);
      const deleteResponse = await creative.delete([]);

      // Treat response as unknown and validate
      const validationResult = MetaDeleteSuccessResponseSchema.safeParse(deleteResponse);
      if (!validationResult.success) {
        const errorMessage = 'Failed to delete ad creative: Invalid response from Meta API.';
        logger.error(errorMessage, { validationErrors: validationResult.error.format() });
        throw new ValidationError(errorMessage);
      }

      const result = {
        success: true,
        adCreativeId: params.adCreativeId,
        message: `Ad creative ${params.adCreativeId} deleted successfully`,
      };
      return createMcpSuccessResult(result, 'Ad creative deleted successfully');
    });
  }
}
