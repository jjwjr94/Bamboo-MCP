import { createMcpSuccessResult } from '../../mcp/responseHelper.js';
import type { JWTPayload } from '../../types/auth.js';
import { MetaApiError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, handleMetaApiCall } from './api.js';

// Constants for API configuration
const META_API_VERSION = 'v20.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const DEFAULT_SEARCH_LIMIT = 25;
const PAGINATED_SEARCH_PAGE_SIZE = 100;

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
      const response = await fetch(nextUrl);

      if (!response.ok) {
        try {
          const errorBody = (await response.json()) as { error?: { message?: string; code?: number; error_subcode?: number } };
          const errorData = errorBody.error;
          throw new MetaApiError(
            errorData?.message || `Pagination request failed with status: ${response.status}`,
            errorData?.code?.toString(),
            errorData?.error_subcode?.toString(),
            response.status
          );
        } catch (_e) {
          throw new MetaApiError(
            `Pagination request failed: ${response.statusText}`,
            undefined,
            undefined,
            response.status
          );
        }
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
  ) {
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
        const allInterests = await this.fetchAllWithPagination<MetaTargetingOption>(
          initialUrl,
          searchLimit,
          authPayload.userId
        );

        const validatedInterests = allInterests.map((interest) => ({
          id: interest.id,
          name: interest.name,
          audienceSize: interest.audience_size,
          path: interest.path || [],
        }));

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

        return createMcpSuccessResult(result);
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
  ) {
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

        return createMcpSuccessResult(result);
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
  ) {
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

        return createMcpSuccessResult(result);
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
  ) {
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

        const response = await fetch(`${searchUrl}?${searchParams}`);

        if (!response.ok) {
          try {
            const errorBody = (await response.json()) as { error?: { message?: string; code?: number; error_subcode?: number } };
            const errorData = errorBody.error;
            throw new MetaApiError(
              errorData?.message || `Validation request failed with status: ${response.status}`,
              errorData?.code?.toString(),
              errorData?.error_subcode?.toString(),
              response.status
            );
          } catch (_e) {
            if (_e instanceof MetaApiError) throw _e;
            throw new MetaApiError(
              `Validation request failed: ${response.statusText}`,
              undefined,
              undefined,
              response.status
            );
          }
        }

        const data: MetaSearchResponse<MetaTargetingValidation> =
          (await response.json()) as MetaSearchResponse<MetaTargetingValidation>;
        const validationResults = data.data || [];

        const result = {
          validationResults: validationResults.map((item) => ({
            id: item.id,
            name: item.name,
            isValid: item.valid === true,
            status: item.status || 'unknown',
          })),
          totalValidated: validationResults.length,
          validCount: validationResults.filter((item) => item.valid === true).length,
        };

        logger.info('Successfully validated targeting options', {
          userId: authPayload.userId,
          totalValidated: result.totalValidated,
          validCount: result.validCount,
        });

        return createMcpSuccessResult(result);
      },
      {
        toolName: 'validate_targeting_options',
        userId: authPayload.userId,
      }
    );
  }
}
