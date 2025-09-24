import type { z } from 'zod';
import { MetaAdsArchiveResponseSchema } from '../../generated/schemas.js';
import type { JWTPayload } from '../../types/auth.js';
import { env } from '../../utils/env.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMetaApiErrorFromResponse, fetchUserTokenString, handleMetaApiCall } from './api.js';
import type {
  GetAdsArchiveInsightsResult,
  GetPageArchiveAdsResult,
  GetPoliticalAdsResult,
  SearchAdsArchiveResult,
} from './types.js';

/**
 * Handler for Meta Ads Archive (Ad Library) API operations.
 *
 * Since the facebook-nodejs-business-sdk doesn't support Ad Library endpoints,
 * this handler uses direct Graph API calls.
 */
export class MetaAdsArchiveHandler {
  /**
   * Constructs pagination-safe Graph API URL for ads_archive endpoint
   */
  private buildAdsArchiveUrl(params: {
    searchTerms?: string;
    searchPageIds?: string[];
    adType?: string;
    publisherPlatforms?: string[];
    adReachedCountries: string[];
    fields: string[];
    limit?: number;
    after?: string;
  }): string {
    const baseUrl = `https://graph.facebook.com/${env.META_API_VERSION}/ads_archive`;
    const urlParams = new URLSearchParams();

    // Required parameter - must be set
    urlParams.set('ad_reached_countries', JSON.stringify(params.adReachedCountries));

    if (params.searchTerms) {
      urlParams.set('search_terms', params.searchTerms);
    }
    if (params.searchPageIds?.length) {
      urlParams.set('search_page_ids', params.searchPageIds.join(','));
    }
    if (params.adType) {
      urlParams.set('ad_type', params.adType);
    }
    if (params.publisherPlatforms?.length) {
      urlParams.set('publisher_platforms', params.publisherPlatforms.join(','));
    }

    urlParams.set('fields', params.fields.join(','));
    urlParams.set('limit', String(params.limit || 50));

    if (params.after) {
      urlParams.set('after', params.after);
    }

    return `${baseUrl}?${urlParams.toString()}`;
  }

  /**
   * Fetches paginated data from ads_archive endpoint with safety limits
   */
  private async fetchPaginatedArchiveData(
    accessToken: string,
    baseParams: {
      searchTerms?: string;
      searchPageIds?: string[];
      adType?: string;
      publisherPlatforms?: string[];
      adReachedCountries: string[];
      fields: string[];
    },
    maxResults: number,
    userId: string
  ): Promise<unknown[]> {
    const allResults: unknown[] = [];
    let after: string | undefined;
    const limit = Math.min(50, maxResults); // Graph API max per page is 50

    while (allResults.length < maxResults) {
      const url = this.buildAdsArchiveUrl({
        ...baseParams,
        limit,
        after,
      });

      logger.debug('Fetching ads archive data', {
        url: url.replace(accessToken, '[REDACTED]'),
        currentResults: allResults.length,
        maxResults,
        userId,
      });

      const response = await fetch(`${url}&access_token=${accessToken}`, {
        method: 'GET',
        signal: AbortSignal.timeout(env.META_API_TIMEOUT),
      });

      if (!response.ok) {
        throw await createMetaApiErrorFromResponse(response);
      }

      const data = (await response.json()) as {
        data?: unknown[];
        paging?: { cursors?: { after?: string } };
      };
      const pageResults = data.data || [];
      allResults.push(...pageResults);

      // Check pagination
      const nextCursor = data.paging?.cursors?.after;
      if (!nextCursor || pageResults.length === 0) {
        break;
      }

      after = nextCursor;

      if (allResults.length >= maxResults) {
        logger.warn('Reached maximum ads archive results limit', {
          maxResults,
          retrievedCount: allResults.length,
          userId,
        });
        break;
      }
    }

    return allResults.slice(0, maxResults);
  }

  /**
   * Validates and transforms ads archive response data
   */
  private validateArchiveResponse(
    rawResults: unknown[],
    userId: string
  ): z.infer<typeof MetaAdsArchiveResponseSchema>[] {
    const validatedResults: z.infer<typeof MetaAdsArchiveResponseSchema>[] = [];

    for (const result of rawResults) {
      const validation = MetaAdsArchiveResponseSchema.safeParse(result);
      if (validation.success) {
        validatedResults.push(validation.data);
      } else {
        logger.warn('Skipping invalid ads archive data', {
          adId: (result as { id?: string }).id || 'Unknown ID',
          errors: validation.error.errors,
          userId,
        });
      }
    }

    return validatedResults;
  }

  /**
   * General search functionality for ads archive
   */
  async searchAdsArchive(
    authPayload: JWTPayload,
    params: {
      searchTerms?: string;
      searchPageIds?: string[];
      publisherPlatforms?: string[];
      adReachedCountries: string[];
      limit?: number;
    }
  ): Promise<SearchAdsArchiveResult> {
    logger.info('Executing search_ads_archive', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const accessToken = await fetchUserTokenString(authPayload.userId);

        const fields = [
          'id',
          'ad_creation_time',
          'ad_creative_body',
          'ad_delivery_start_time',
          'ad_delivery_stop_time',
          'page_id',
          'page_name',
          'publisher_platforms',
          'languages',
          'ad_snapshot_url',
          'impressions',
          'spend',
          'currency',
        ];

        const maxResults = Math.min(params.limit || 250, 5000);  // Max ads archive to fetch

        const rawResults = await this.fetchPaginatedArchiveData(
          accessToken,
          {
            searchTerms: params.searchTerms,
            searchPageIds: params.searchPageIds,
            publisherPlatforms: params.publisherPlatforms,
            adReachedCountries: params.adReachedCountries,
            fields,
          },
          maxResults,
          authPayload.userId
        );

        const validatedResults = this.validateArchiveResponse(rawResults, authPayload.userId);

        logger.info('Ads archive search completed', {
          userId: authPayload.userId,
          retrievedCount: validatedResults.length,
          requestedLimit: params.limit,
        });

        return { ads: validatedResults };
      },
      {
        toolName: 'search_ads_archive',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Search for political and social issue ads
   */
  async getPoliticalAds(
    authPayload: JWTPayload,
    params: {
      searchTerms?: string;
      searchPageIds?: string[];
      publisherPlatforms?: string[];
      adReachedCountries: string[];
      limit?: number;
    }
  ): Promise<GetPoliticalAdsResult> {
    logger.info('Executing get_political_ads', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const accessToken = await fetchUserTokenString(authPayload.userId);

        // Enhanced fields for political ads transparency
        const fields = [
          'id',
          'ad_creation_time',
          'ad_creative_body',
          'ad_delivery_start_time',
          'ad_delivery_stop_time',
          'page_id',
          'page_name',
          'publisher_platforms',
          'languages',
          'ad_snapshot_url',
          'impressions',
          'spend',
          'currency',
          'funding_entity', // Political ads specific
          'bylines', // Political ads specific
          'demographic_distribution', // Enhanced transparency
          'delivery_by_region', // Geographic transparency
        ];

        const maxResults = Math.min(params.limit || 250, 5000);  // Max ads archive to fetch

        const rawResults = await this.fetchPaginatedArchiveData(
          accessToken,
          {
            searchTerms: params.searchTerms,
            searchPageIds: params.searchPageIds,
            publisherPlatforms: params.publisherPlatforms,
            adType: 'POLITICAL_AND_ISSUE_ADS', // Filter for political ads only
            adReachedCountries: params.adReachedCountries,
            fields,
          },
          maxResults,
          authPayload.userId
        );

        const validatedResults = this.validateArchiveResponse(rawResults, authPayload.userId);

        logger.info('Political ads search completed', {
          userId: authPayload.userId,
          retrievedCount: validatedResults.length,
          requestedLimit: params.limit,
        });

        return { ads: validatedResults };
      },
      {
        toolName: 'get_political_ads',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Search ads from specific Facebook Pages
   */
  async getPageArchiveAds(
    authPayload: JWTPayload,
    params: {
      pageIds: string[];
      searchTerms?: string;
      publisherPlatforms?: string[];
      adReachedCountries: string[];
      limit?: number;
    }
  ): Promise<GetPageArchiveAdsResult> {
    logger.info('Executing get_page_archive_ads', { userId: authPayload.userId, params });

    // Validate page IDs limit (API supports max 10)
    if (params.pageIds.length > 10) {
      throw new ValidationError(
        'Cannot search more than 10 page IDs at once. Please reduce the number of pages.'
      );
    }

    return await handleMetaApiCall(
      async () => {
        const accessToken = await fetchUserTokenString(authPayload.userId);

        const fields = [
          'id',
          'ad_creation_time',
          'ad_creative_body',
          'ad_creative_link_title',
          'ad_creative_link_description',
          'ad_delivery_start_time',
          'ad_delivery_stop_time',
          'page_id',
          'page_name',
          'publisher_platforms',
          'languages',
          'ad_snapshot_url',
          'impressions',
          'spend',
          'currency',
        ];

        const maxResults = Math.min(params.limit || 250, 5000);  // Max ads archive to fetch

        const rawResults = await this.fetchPaginatedArchiveData(
          accessToken,
          {
            searchPageIds: params.pageIds,
            searchTerms: params.searchTerms,
            publisherPlatforms: params.publisherPlatforms,
            adReachedCountries: params.adReachedCountries,
            fields,
          },
          maxResults,
          authPayload.userId
        );

        const validatedResults = this.validateArchiveResponse(rawResults, authPayload.userId);

        logger.info('Page archive ads search completed', {
          userId: authPayload.userId,
          pageIds: params.pageIds,
          retrievedCount: validatedResults.length,
          requestedLimit: params.limit,
        });

        return { ads: validatedResults };
      },
      {
        toolName: 'get_page_archive_ads',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Enhanced ads archive search with demographic and regional insights
   */
  async getAdsArchiveInsights(
    authPayload: JWTPayload,
    params: {
      searchTerms?: string;
      searchPageIds?: string[];
      adType?: 'ALL' | 'POLITICAL_AND_ISSUE_ADS';
      publisherPlatforms?: string[];
      adReachedCountries: string[];
      includeRegionalData?: boolean;
      includeDemographicData?: boolean;
      limit?: number;
    }
  ): Promise<GetAdsArchiveInsightsResult> {
    logger.info('Executing get_ads_archive_insights', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const accessToken = await fetchUserTokenString(authPayload.userId);

        // Comprehensive fields including insights data
        const baseFields = [
          'id',
          'ad_creation_time',
          'ad_creative_body',
          'ad_delivery_start_time',
          'ad_delivery_stop_time',
          'page_id',
          'page_name',
          'publisher_platforms',
          'languages',
          'ad_snapshot_url',
          'impressions',
          'spend',
          'currency',
        ];

        // Add enhanced fields based on request parameters
        const enhancedFields = [...baseFields];
        if (params.includeDemographicData) {
          enhancedFields.push('demographic_distribution');
        }
        if (params.includeRegionalData) {
          enhancedFields.push('delivery_by_region');
        }
        if (params.adType === 'POLITICAL_AND_ISSUE_ADS') {
          enhancedFields.push('funding_entity', 'bylines');
        }

        const maxResults = Math.min(params.limit || 250, 5000);  // Max ads archive to fetch

        const rawResults = await this.fetchPaginatedArchiveData(
          accessToken,
          {
            searchTerms: params.searchTerms,
            searchPageIds: params.searchPageIds,
            adType: params.adType,
            publisherPlatforms: params.publisherPlatforms,
            adReachedCountries: params.adReachedCountries,
            fields: enhancedFields,
          },
          maxResults,
          authPayload.userId
        );

        const validatedResults = this.validateArchiveResponse(rawResults, authPayload.userId);

        logger.info('Ads archive insights search completed', {
          userId: authPayload.userId,
          adType: params.adType,
          includedEnhancements: {
            regional: params.includeRegionalData,
            demographic: params.includeDemographicData,
          },
          retrievedCount: validatedResults.length,
          requestedLimit: params.limit,
        });

        return { insights: validatedResults };
      },
      {
        toolName: 'get_ads_archive_insights',
        userId: authPayload.userId,
      }
    );
  }
}
