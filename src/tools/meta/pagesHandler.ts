import {
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
  PagePost as MetaPagePostSDK,
  Page as MetaPageSDK,
  User as MetaUserSDK,
} from 'facebook-nodejs-business-sdk';
import type { z } from 'zod';
import {
  MetaCreateSuccessResponseSchema,
  MetaPagePostResponseSchema,
  MetaPageResponseSchema,
} from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { env } from '../../utils/env.js';
import { AuthorizationError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { createApiInstanceFromToken, createMetaApiInstance, handleMetaApiCall } from './api.js';
import { fetchAllPaginatedData } from './paginationHelper.js';
import type { CreatePagePostAdResult, GetPagePostsResult, GetPagesResult } from './types.js';

export class MetaPagesHandler {
  /**
   * Retrieves Facebook Pages the user has access to.
   * Requires 'pages_show_list' scope.
   */
  async getPages(authPayload: JWTPayload): Promise<GetPagesResult> {
    logger.info('Executing get_pages', { userId: authPayload.userId });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);
        const fields = [
          MetaPageSDK.Fields.id,
          MetaPageSDK.Fields.name,
          MetaPageSDK.Fields.category,
          MetaPageSDK.Fields.link,
          MetaPageSDK.Fields.about,
        ];

        const pagesCursor = await new MetaUserSDK('me', {}, null, api).getAccounts(fields);

        // Use the common pagination utility to handle all edge cases
        const allRawPages = await fetchAllPaginatedData<unknown>({
          cursor: pagesCursor,
          limit: env.META_MAX_PAGES_TO_FETCH,
          entityName: 'pages',
          userId: authPayload.userId,
        });

        const validatedPages: z.infer<typeof MetaPageResponseSchema>[] = [];
        for (const page of allRawPages) {
          const result = MetaPageResponseSchema.safeParse(page);
          if (result.success) {
            validatedPages.push(result.data);
          } else {
            logger.warn('Invalid page data received from Meta API, skipping.', {
              error: result.error.format(),
              page,
              userId: authPayload.userId,
            });
          }
        }

        const response = { pages: validatedPages };
        logger.info('Successfully retrieved pages', {
          userId: authPayload.userId,
          count: validatedPages.length,
        });

        return response;
      },
      {
        toolName: 'get_pages',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Retrieves recent posts for a specific Facebook Page.
   * Requires 'pages_manage_posts' scope.
   */
  async getPagePosts(
    authPayload: JWTPayload,
    params: { pageId: string }
  ): Promise<GetPagePostsResult> {
    logger.info('Executing get_page_posts', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const userApi = await createMetaApiInstance(authPayload.userId);

        logger.info('Fetching page access token', {
          userId: authPayload.userId,
          pageId: params.pageId,
        });

        const page = await new MetaPageSDK(params.pageId, {}, null, userApi).read([
          MetaPageSDK.Fields.access_token,
        ]);
        const pageAccessToken = page.access_token;

        if (!pageAccessToken) {
          throw new AuthorizationError(
            `Could not retrieve access token for Page ID: ${params.pageId}. Ensure the user has appropriate permissions for this page.`
          );
        }

        const pageApi = createApiInstanceFromToken(pageAccessToken as string);
        logger.info('API instance created with page-specific access token', {
          pageId: params.pageId,
        });

        const fields = [
          MetaPagePostSDK.Fields.id,
          MetaPagePostSDK.Fields.message,
          MetaPagePostSDK.Fields.created_time,
          MetaPagePostSDK.Fields.permalink_url,
          MetaPagePostSDK.Fields.full_picture,
          MetaPagePostSDK.Fields.story,
          MetaPagePostSDK.Fields.status_type,
        ];

        const postsCursor = await new MetaPageSDK(params.pageId, {}, null, pageApi).getPosts(
          fields
        );

        const allRawPosts = await fetchAllPaginatedData<unknown>({
          cursor: postsCursor,
          limit: env.META_MAX_POSTS_TO_FETCH,
          entityName: 'page posts',
          userId: authPayload.userId,
          apiContext: { pageId: params.pageId },
        });

        const validatedPosts: z.infer<typeof MetaPagePostResponseSchema>[] = [];
        for (const post of allRawPosts) {
          const result = MetaPagePostResponseSchema.safeParse(post);
          if (result.success) {
            validatedPosts.push(result.data);
          } else {
            logger.warn('Invalid post data received from Meta API, skipping.', {
              error: result.error.format(),
              post,
              userId: authPayload.userId,
              pageId: params.pageId,
            });
          }
        }

        const response = { posts: validatedPosts };
        logger.info('Successfully retrieved page posts', {
          userId: authPayload.userId,
          pageId: params.pageId,
          count: validatedPosts.length,
        });

        return response;
      },
      {
        toolName: 'get_page_posts',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Creates a new ad by promoting an existing Facebook Page post.
   * Requires 'pages_manage_ads', 'ads_management', 'pages_manage_posts' scopes.
   */
  async createPagePostAd(
    authPayload: JWTPayload,
    params: {
      adAccountId?: string;
      name: string;
      adSetId: string;
      postId: string;
      status?: 'ACTIVE' | 'PAUSED';
    }
  ): Promise<CreatePagePostAdResult> {
    logger.info('Executing create_page_post_ad', { userId: authPayload.userId, params });

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const adAccountId = await accountManager.requireAccountSelection(
          authPayload.userId,
          params.adAccountId
        );

        const creativeData: Record<string, unknown> = {
          [MetaAdCreativeSDK.Fields.name]:
            `Creative for Ad: ${params.name} (Post: ${params.postId})`,
          [MetaAdCreativeSDK.Fields.object_story_id]: params.postId,
        };

        removeUndefinedProperties(creativeData);

        const adCreative = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAdCreative(
          [],
          creativeData
        );
        const creativeValidation = MetaCreateSuccessResponseSchema.safeParse(adCreative);

        if (!creativeValidation.success) {
          logger.error('Invalid response from Meta API for create ad creative', {
            error: creativeValidation.error.format(),
            response: adCreative,
          });
          throw new ValidationError(
            'Failed to create ad creative from post: Invalid API response.'
          );
        }

        const adCreativeId = creativeValidation.data.id;

        const adData: Record<string, unknown> = {
          name: params.name,
          adset_id: params.adSetId,
          creative: { creative_id: adCreativeId },
          status: params.status || 'PAUSED',
        };

        removeUndefinedProperties(adData);

        const ad = await new MetaAdAccountSDK(adAccountId, {}, null, api).createAd([], adData);
        const adValidation = MetaCreateSuccessResponseSchema.safeParse(ad);

        if (!adValidation.success) {
          logger.error('Invalid response from Meta API for create ad', {
            error: adValidation.error.format(),
            response: ad,
          });
          throw new ValidationError('Failed to create ad: Invalid API response.');
        }

        const adId = adValidation.data.id;

        const result: CreatePagePostAdResult = {
          adId,
          adCreativeId,
        };

        logger.info('Successfully created page post ad', {
          userId: authPayload.userId,
          adAccountId,
          adId,
          adCreativeId,
          postId: params.postId,
        });

        return result;
      },
      {
        toolName: 'create_page_post_ad',
        userId: authPayload.userId,
      }
    );
  }
}
