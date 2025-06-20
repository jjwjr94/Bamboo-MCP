import {
  FacebookAdsApi,
  AdAccount as MetaAdAccountSDK,
  AdCreative as MetaAdCreativeSDK,
  PagePost as MetaPagePostSDK,
  Page as MetaPageSDK,
  User as MetaUserSDK,
} from 'facebook-nodejs-business-sdk';
import { z } from 'zod';
import { MetaCreateSuccessResponseSchema } from '../../generated/schemas.js';
import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { accountManager } from '../../utils/accountManager.js';
import { AuthorizationError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { removeUndefinedProperties } from '../../utils/objectUtils.js';
import { fetchUserTokenString, handleMetaApiCall, initializeMetaApi } from './api.js';

// Schema for an individual Page, matching the tool's output
const StrictPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  about: z.string().optional().nullable(),
});

// Schema for an individual Page Post, matching the tool's output
const StrictPagePostSchema = z.object({
  id: z.string(),
  message: z.string().optional().nullable(),
  created_time: z.string().optional().nullable(),
  permalink_url: z.string().optional().nullable(),
  full_picture: z.string().optional().nullable(),
  story: z.string().optional().nullable(),
  status_type: z.string().optional().nullable(),
});

// Type for the cursor to improve type safety
interface PaginatedCursor<T> extends Array<T> {
  next?: () => Promise<PaginatedCursor<T>>;
  hasNext?: () => boolean;
}

const MAX_PAGES_TO_FETCH = 100;
const MAX_POSTS_TO_FETCH = 500;

export class MetaPagesHandler {
  /**
   * Retrieves Facebook Pages the user has access to.
   * Requires 'pages_show_list' scope.
   */
  async getPages(authPayload: JWTPayload) {
    logger.info('Executing get_pages', { userId: authPayload.userId });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const fields = [
        MetaPageSDK.Fields.id,
        MetaPageSDK.Fields.name,
        MetaPageSDK.Fields.category,
        MetaPageSDK.Fields.link,
        MetaPageSDK.Fields.about,
      ];

      const pagesCursor = await new MetaUserSDK('me').getAccounts(fields);

      // Handle pagination with improved type safety and fetch limit
      const allRawPages: unknown[] = [];
      let currentCursor: PaginatedCursor<unknown> = pagesCursor;

      while (currentCursor && currentCursor.length > 0) {
        allRawPages.push(...currentCursor);

        if (allRawPages.length >= MAX_PAGES_TO_FETCH) {
          logger.warn('Reached maximum pages fetch limit', {
            limit: MAX_PAGES_TO_FETCH,
            userId: authPayload.userId,
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
      const validatedPages: z.infer<typeof StrictPageSchema>[] = [];
      for (const page of allRawPages) {
        const result = StrictPageSchema.safeParse(page);
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

      return createMcpSuccessResult(response);
    });
  }

  /**
   * Retrieves recent posts for a specific Facebook Page.
   * Requires 'pages_manage_posts' scope.
   */
  async getPagePosts(authPayload: JWTPayload, params: { pageId: string }) {
    logger.info('Executing get_page_posts', { userId: authPayload.userId, params });

    // Fetch the original user token to restore it later
    const userAccessToken = await fetchUserTokenString(authPayload.userId);
    await initializeMetaApi(authPayload.userId);

    try {
      return await handleMetaApiCall(async () => {
        // Fetch the page object to get its specific access token
        logger.info('Fetching page access token', {
          userId: authPayload.userId,
          pageId: params.pageId,
        });

        const page = await new MetaPageSDK(params.pageId).read([MetaPageSDK.Fields.access_token]);
        const pageAccessToken = page.access_token;

        // Validate that a page access token was retrieved
        if (!pageAccessToken) {
          throw new AuthorizationError(
            `Could not retrieve access token for Page ID: ${params.pageId}. Ensure the user has appropriate permissions for this page.`
          );
        }

        // Re-initialize the API with the page-specific token for this scope
        FacebookAdsApi.init(pageAccessToken as string);
        logger.info('API re-initialized with page-specific access token', {
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

        const postsCursor = await new MetaPageSDK(params.pageId).getPosts(fields);

        // Handle pagination with improved type safety and fetch limit
        const allRawPosts: unknown[] = [];
        let currentCursor: PaginatedCursor<unknown> = postsCursor;

        while (currentCursor && currentCursor.length > 0) {
          allRawPosts.push(...currentCursor);

          if (allRawPosts.length >= MAX_POSTS_TO_FETCH) {
            logger.warn('Reached maximum posts fetch limit', {
              limit: MAX_POSTS_TO_FETCH,
              userId: authPayload.userId,
              pageId: params.pageId,
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
        const validatedPosts: z.infer<typeof StrictPagePostSchema>[] = [];
        for (const post of allRawPosts) {
          const result = StrictPagePostSchema.safeParse(post);
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

        return createMcpSuccessResult(response);
      });
    } finally {
      // CRITICAL: Restore the API to use the original user access token
      // to prevent breaking other tools in the same request flow.
      FacebookAdsApi.init(userAccessToken);
      logger.info('API restored with user-specific access token', { userId: authPayload.userId });
    }
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
  ) {
    logger.info('Executing create_page_post_ad', { userId: authPayload.userId, params });
    await initializeMetaApi(authPayload.userId);

    return handleMetaApiCall(async () => {
      const adAccountId = await accountManager.requireAccountSelection(
        authPayload.userId,
        params.adAccountId
      );

      // 1. Create an AdCreative from the existing page post
      const creativeData: Record<string, unknown> = {
        [MetaAdCreativeSDK.Fields.name]: `Creative for Ad: ${params.name} (Post: ${params.postId})`,
        [MetaAdCreativeSDK.Fields.object_story_id]: params.postId,
      };

      removeUndefinedProperties(creativeData);

      const adCreative = await new MetaAdAccountSDK(adAccountId).createAdCreative([], creativeData);
      const creativeValidation = MetaCreateSuccessResponseSchema.safeParse(adCreative);

      if (!creativeValidation.success) {
        logger.error('Invalid response from Meta API for create ad creative', {
          error: creativeValidation.error.format(),
          response: adCreative,
        });
        throw new ValidationError('Failed to create ad creative from post: Invalid API response.');
      }

      const adCreativeId = creativeValidation.data.id;

      // 2. Create the Ad using the new AdCreative
      const adData: Record<string, unknown> = {
        name: params.name,
        adset_id: params.adSetId,
        creative: { creative_id: adCreativeId },
        status: params.status || 'PAUSED',
      };

      removeUndefinedProperties(adData);

      const ad = await new MetaAdAccountSDK(adAccountId).createAd([], adData);
      const adValidation = MetaCreateSuccessResponseSchema.safeParse(ad);

      if (!adValidation.success) {
        logger.error('Invalid response from Meta API for create ad', {
          error: adValidation.error.format(),
          response: ad,
        });
        throw new ValidationError('Failed to create ad: Invalid API response.');
      }

      const adId = adValidation.data.id;

      const result = {
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

      return createMcpSuccessResult(
        result,
        `Successfully created ad '${params.name}' (ID: ${adId}) to promote post ${params.postId}.`
      );
    });
  }
}
