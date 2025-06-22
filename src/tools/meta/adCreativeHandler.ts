import {
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
} from 'facebook-nodejs-business-sdk';
import {
  MetaAdCreativeResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import type { CreateAdCreativeRequest } from '../../types/meta.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type {
  CreateAdCreativeResult,
  DeleteAdCreativeResult,
  GetAdCreativesResult,
  MetaAdCreative,
  UpdateAdCreativeResult,
} from './types.js';

export class MetaAdCreativeHandler {
  async getAdCreatives(
    authPayload: JWTPayload,
    params: { adAccountId?: string }
  ): Promise<GetAdCreativesResult> {
    logger.info('Executing get_ad_creatives', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

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

        const adCreativesCursor = await new MetaAdAccountSDK(
          adAccountId,
          {},
          null,
          api
        ).getAdCreatives(fields);

        const allRawAdCreatives = await fetchAllPaginatedData<unknown>({
          cursor: adCreativesCursor,
          limit: env.META_MAX_CREATIVES_TO_FETCH,
          entityName: 'ad creatives',
          userId: authPayload.userId,
          apiContext: { adAccountId },
        });

        const validatedAdCreatives: MetaAdCreative[] = [];
        for (const adCreative of allRawAdCreatives) {
          const result = MetaAdCreativeResponseSchema.safeParse(adCreative);
          if (result.success) {
            validatedAdCreatives.push(result.data);
          } else {
            logger.warn('Invalid ad creative data received from Meta API, skipping.', {
              errors: result.error.format(),
              adCreative,
              userId: authPayload.userId,
              adAccountId,
            });
          }
        }

        return { adCreatives: validatedAdCreatives };
      },
      {
        toolName: 'get_ad_creatives',
        userId: authPayload.userId,
      }
    );
  }

  async createAdCreative(
    authPayload: JWTPayload,
    params: CreateAdCreativeRequest & { adAccountId?: string }
  ): Promise<CreateAdCreativeResult> {
    logger.info('Executing create_ad_creative', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId =
          params.adAccountId ||
          (await accountManager.requireAccountSelection(authPayload.userId, params.adAccountId));

        const adCreativeData: Record<string, unknown> = {
          [MetaAdCreativeSDK.Fields.name]: params.name,
          [MetaAdCreativeSDK.Fields.object_story_spec]: params.objectStorySpec,
        };

        removeUndefinedProperties(adCreativeData);

        const response = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAdCreative(
          [],
          adCreativeData
        );
        const validation = MetaCreateSuccessResponseSchema.safeParse(response);
        if (!validation.success) {
          logger.warn('Invalid createAdCreative response from Meta API', {
            response: response,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            'Meta API returned an invalid response after creating the ad creative. The operation status is uncertain.'
          );
        }

        const adCreativeId = validation.data.id;
        const result: CreateAdCreativeResult = {
          adCreativeId: adCreativeId,
          name: params.name,
        };
        return result;
      },
      {
        toolName: 'create_ad_creative',
        userId: authPayload.userId,
      }
    );
  }

  async updateAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; name: string }
  ): Promise<UpdateAdCreativeResult> {
    logger.info('Executing update_ad_creative', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const updateData = { [MetaAdCreativeSDK.Fields.name]: params.name };

        // Ensure no undefined values are passed to Meta API
        removeUndefinedProperties(updateData);

        const adCreative = new MetaAdCreativeSDK(params.adCreativeId, {}, null, api);
        const response = await adCreative.update([], updateData);

        const validation = MetaUpdateSuccessResponseSchema.safeParse(response);
        if (!validation.success) {
          logger.warn('Invalid updateAdCreative response from Meta API', {
            adCreativeId: params.adCreativeId,
            response: response,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            `Meta API returned an invalid response after updating ad creative ${params.adCreativeId}. The operation status is uncertain.`
          );
        }

        const result: UpdateAdCreativeResult = {
          adCreativeId: params.adCreativeId,
          updatedFields: Object.keys(updateData),
        };
        return result;
      },
      {
        toolName: 'update_ad_creative',
        userId: authPayload.userId,
      }
    );
  }

  async deleteAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; confirmPermanentDelete?: boolean }
  ): Promise<DeleteAdCreativeResult> {
    logger.info('Executing delete_ad_creative', { userId: authPayload.userId, params });

    if (params.confirmPermanentDelete !== true) {
      throw new ValidationError(
        'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.'
      );
    }

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adCreative = new MetaAdCreativeSDK(params.adCreativeId, {}, null, api);
        const response = await adCreative.delete([]);

        const validation = MetaDeleteSuccessResponseSchema.safeParse(response);
        if (!validation.success) {
          logger.warn('Invalid deleteAdCreative response from Meta API', {
            adCreativeId: params.adCreativeId,
            response: response,
            errors: validation.error.errors,
          });
          throw new ValidationError(
            `Meta API returned an invalid response after deleting ad creative ${params.adCreativeId}. The operation status is uncertain.`
          );
        }

        const result: DeleteAdCreativeResult = {
          adCreativeId: params.adCreativeId,
        };
        return result;
      },
      {
        toolName: 'delete_ad_creative',
        userId: authPayload.userId,
      }
    );
  }
}
