import { z } from 'zod';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiErrorFromResponse, createMetaApiInstance, handleMetaApiCall } from './api.js';
import type {
  SearchBehaviorsResult,
  SearchInterestsResult,
  SearchLocationsResult,
  ValidateTargetingOptionsResult,
} from './types.js';

// Constants for API configuration
const META_API_VERSION = 'v20.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const DEFAULT_SEARCH_LIMIT = 25;
const PAGINATED_SEARCH_PAGE_SIZE = 100;

// Zod schemas for validating API responses
const InterestResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  audience_size: z.number().optional().nullable(),
  path: z.array(z.string()).optional().default([]),
});

// Type definitions for API responses
interface MetaPaging {
  cursors: {
    before: string;
    after: string;
  };
  next?: string;
}

interface MetaTargetingOption {
  id: string;
  name: string;
  audience_size: number;
  path: string[];
}

interface MetaGeolocation {
  key: string;
  name: string;
  type: string;
  country_code: string;
  country_name: string;
}

interface MetaTargetingValidation {
  id: string;
  name: string;
  valid: boolean;
  status: string;
  // Properties from the v22+ response schema
  key?: string;
  type?: string;
  supports_city?: boolean;
  supports_region?: boolean;
  message?: string;
}

interface MetaSearchResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export class MetaTargetingSearchHandler {
  /**
   * Helper method to fetch all pages of results up to a specified limit.
   * Note: This implementation uses direct fetch with pagination URLs (paging.next)
   * as returned by the Meta Graph API's search endpoints, which differs from
   * the SDK's cursor-based pagination handled by the generic `fetchAllPaginatedData` helper.
   */
  private async fetchAllWithPagination<T>(
    initialUrl: string,
    limit: number,
    userId: string
  ): Promise<T[]> {
    const allItems: T[] = [];
    let nextUrl: string | undefined = initialUrl;

    while (nextUrl && allItems.length < limit) {
      const response = await fetch(nextUrl, {
        signal: AbortSignal.timeout(env.META_API_TIMEOUT),
      });

      if (!response.ok) {
        throw await createMetaApiErrorFromResponse(response);
      }

      const page: MetaSearchResponse<T> = (await response.json()) as MetaSearchResponse<T>;
      if (page.data) {
        allItems.push(...page.data);
      }

      if (allItems.length >= limit) {
        logger.warn('Reached pagination limit for targeting search, truncating results.', {
          limit,
          retrievedCount: allItems.length,
          userId,
        });
        break;
      }

      nextUrl = page.paging?.next;
    }

    return allItems.slice(0, limit);
  }

  async searchInterests(
    authPayload: JWTPayload,
    params: {
      query: string;
      limit?: number;
    }
  ): Promise<SearchInterestsResult> {
    logger.info('Executing search_interests', {
      userId: authPayload.userId,
      params,
    });

    if (!params.query?.trim()) {
      throw new ValidationError('Search query is required');
    }

    // A higher default limit is used for interests as the initial results are often very broad
    const searchLimit = params.limit || 100;

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const searchUrl = `${META_GRAPH_URL}/search`;
        const searchParams = new URLSearchParams({
          type: 'adinterest',
          q: params.query,
          limit: '100', // Fetch larger pages for pagination
          access_token: api.accessToken,
        });

        const initialUrl = `${searchUrl}?${searchParams}`;

        // Use pagination helper to fetch all results
        const allInterests = await this.fetchAllWithPagination<unknown>(
          initialUrl,
          searchLimit,
          authPayload.userId
        );

        const validatedInterests: Array<{
          id: string;
          name: string;
          audienceSize: number;
          path: string[];
        }> = [];
        for (const item of allInterests) {
          const parsed = InterestResultSchema.safeParse(item);
          if (parsed.success) {
            validatedInterests.push({
              id: parsed.data.id,
              name: parsed.data.name,
              audienceSize: parsed.data.audience_size ?? 0,
              path: parsed.data.path,
            });
          } else {
            logger.warn('Skipping invalid interest data from Meta API', {
              error: parsed.error.format(),
              data: item,
              userId: authPayload.userId,
            });
          }
        }

        const result = {
          interests: validatedInterests,
          query: params.query,
          total: validatedInterests.length,
        };

        logger.info('Successfully searched interests', {
          userId: authPayload.userId,
          query: params.query,
          resultCount: validatedInterests.length,
        });

        return result;
      },
      {
        toolName: 'search_interests',
        userId: authPayload.userId,
      }
    );
  }

  async searchBehaviors(
    authPayload: JWTPayload,
    params: {
      query: string;
      limit?: number;
    }
  ): Promise<SearchBehaviorsResult> {
    logger.info('Executing search_behaviors', {
      userId: authPayload.userId,
      params,
    });

    if (!params.query?.trim()) {
      throw new ValidationError('Search query is required');
    }

    const searchLimit = params.limit || DEFAULT_SEARCH_LIMIT;

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const searchUrl = `${META_GRAPH_URL}/search`;
        const searchParams = new URLSearchParams({
          type: 'adTargetingCategory',
          class: 'behaviors',
          q: params.query,
          limit: String(PAGINATED_SEARCH_PAGE_SIZE),
          access_token: api.accessToken,
        });

        const initialUrl = `${searchUrl}?${searchParams}`;

        // Use pagination helper to fetch all results
        const allBehaviors = await this.fetchAllWithPagination<MetaTargetingOption>(
          initialUrl,
          searchLimit,
          authPayload.userId
        );

        const validatedBehaviors = allBehaviors.map((behavior) => ({
          id: behavior.id,
          name: behavior.name,
          audienceSize: behavior.audience_size,
          path: behavior.path || [],
        }));

        const result = {
          behaviors: validatedBehaviors,
          query: params.query,
          total: validatedBehaviors.length,
        };

        logger.info('Successfully searched behaviors', {
          userId: authPayload.userId,
          query: params.query,
          resultCount: validatedBehaviors.length,
        });

        return result;
      },
      {
        toolName: 'search_behaviors',
        userId: authPayload.userId,
      }
    );
  }

  async searchLocations(
    authPayload: JWTPayload,
    params: {
      query: string;
      type?: 'country' | 'region' | 'city';
      limit?: number;
    }
  ): Promise<SearchLocationsResult> {
    logger.info('Executing search_locations', {
      userId: authPayload.userId,
      params,
    });

    if (!params.query?.trim()) {
      throw new ValidationError('Search query is required');
    }

    const searchLimit = params.limit || DEFAULT_SEARCH_LIMIT;

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const searchUrl = `${META_GRAPH_URL}/search`;
        const searchParams = new URLSearchParams({
          type: 'adgeolocation',
          q: params.query,
          limit: String(PAGINATED_SEARCH_PAGE_SIZE),
          access_token: api.accessToken,
        });

        if (params.type) {
          searchParams.append('location_types', JSON.stringify([params.type]));
        }

        const initialUrl = `${searchUrl}?${searchParams}`;

        // Use pagination helper to fetch all results
        const allLocations = await this.fetchAllWithPagination<MetaGeolocation>(
          initialUrl,
          searchLimit,
          authPayload.userId
        );

        const validatedLocations = allLocations.map((location) => ({
          key: location.key,
          name: location.name,
          type: location.type,
          countryCode: location.country_code,
          countryName: location.country_name,
        }));

        const result = {
          locations: validatedLocations,
          query: params.query,
          total: validatedLocations.length,
        };

        logger.info('Successfully searched locations', {
          userId: authPayload.userId,
          query: params.query,
          resultCount: validatedLocations.length,
        });

        return result;
      },
      {
        toolName: 'search_locations',
        userId: authPayload.userId,
      }
    );
  }

  async validateTargetingOptions(
    authPayload: JWTPayload,
    params: {
      targetingOptionIds: string[];
    }
  ): Promise<ValidateTargetingOptionsResult> {
    logger.info('Executing validate_targeting_options', {
      userId: authPayload.userId,
      params,
    });

    if (!params.targetingOptionIds?.length) {
      throw new ValidationError('At least one targeting option ID is required');
    }

    return handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(authPayload.userId);

        const searchUrl = `${META_GRAPH_URL}/search`;
        const searchParams = new URLSearchParams({
          type: 'targetingoptionstatus',
          targeting_option_list: JSON.stringify(params.targetingOptionIds),
          access_token: api.accessToken,
        });

        const response = await fetch(`${searchUrl}?${searchParams}`, {
          signal: AbortSignal.timeout(env.META_API_TIMEOUT),
        });

        if (!response.ok) {
          throw await createMetaApiErrorFromResponse(response);
        }

        const data: MetaSearchResponse<MetaTargetingValidation> =
          (await response.json()) as MetaSearchResponse<MetaTargetingValidation>;
        const validationResults = data.data || [];

        // Transform to match Meta API v22+ actual response schema
        const result = {
          validTargetingOptions: validationResults.map((item) => ({
            key: item.key || item.id, // Fixed identifier unique in each category
            id: item.id,
            name: item.name,
            type: item.type || 'targeting_option',
            supports_city: item.supports_city,
            supports_region: item.supports_region,
            is_valid: item.valid === true,
            message: item.message,
          })),
        };

        logger.info('Successfully validated targeting options', {
          userId: authPayload.userId,
          totalValidated: validationResults.length,
          validCount: validationResults.filter((item) => item.valid === true).length,
        });

        return result;
      },
      {
        toolName: 'validate_targeting_options',
        userId: authPayload.userId,
      }
    );
  }
}
