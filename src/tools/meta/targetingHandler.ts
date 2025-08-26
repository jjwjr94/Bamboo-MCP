import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import type { JWTPayload } from '../../types/auth.js';

// Interest targeting schemas
const InterestSearchInput = z.object({
  accessToken: z.string().optional(),
  query: z.string().describe('Search term for interests (e.g., "baseball", "cooking", "travel")'),
  limit: z.number().min(1).max(100).default(25).describe('Maximum number of results to return'),
});

const InterestSearchResult = z.object({
  interests: z.array(z.object({
    id: z.string(),
    name: z.string(),
    audience_size: z.number().optional(),
    path: z.array(z.string()).optional(),
  })),
});

// Behavior targeting schemas
const BehaviorSearchInput = z.object({
  accessToken: z.string().optional(),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of results to return'),
});

const BehaviorSearchResult = z.object({
  behaviors: z.array(z.object({
    id: z.string(),
    name: z.string(),
    audience_size_lower_bound: z.number().optional(),
    audience_size_upper_bound: z.number().optional(),
    path: z.array(z.string()).optional(),
    description: z.string().optional(),
  })),
});

// Demographic targeting schemas
const DemographicSearchInput = z.object({
  accessToken: z.string().optional(),
  demographicClass: z.enum([
    'demographics',
    'life_events',
    'industries',
    'income',
    'family_statuses',
    'user_device',
    'user_os'
  ]).describe('Type of demographics to search'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of results to return'),
});

const DemographicSearchResult = z.object({
  demographics: z.array(z.object({
    id: z.string(),
    name: z.string(),
    audience_size_lower_bound: z.number().optional(),
    audience_size_upper_bound: z.number().optional(),
    path: z.array(z.string()).optional(),
    description: z.string().optional(),
  })),
});

// Geographic targeting schemas
const GeoLocationSearchInput = z.object({
  accessToken: z.string().optional(),
  query: z.string().describe('Search term for locations (e.g., "New York", "California", "Japan")'),
  locationTypes: z.array(z.enum([
    'country',
    'region',
    'city',
    'zip',
    'geo_market',
    'electoral_district'
  ])).default(['country', 'region', 'city']).describe('Types of locations to search'),
  limit: z.number().min(1).max(100).default(25).describe('Maximum number of results to return'),
});

const GeoLocationSearchResult = z.object({
  locations: z.array(z.object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    country_code: z.string().optional(),
    country_name: z.string().optional(),
    region_id: z.string().optional(),
    region_name: z.string().optional(),
    city_id: z.string().optional(),
    city_name: z.string().optional(),
  })),
});

// Interest validation schemas
const InterestValidationInput = z.object({
  accessToken: z.string().optional(),
  interestList: z.array(z.string()).describe('List of interest names to validate (e.g., ["Japan", "Basketball"])'),
  interestFbidList: z.array(z.string()).optional().describe('List of interest IDs to validate (e.g., ["6003700426513"])'),
});

const InterestValidationResult = z.object({
  validations: z.array(z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    valid: z.boolean(),
    audience_size: z.number().optional(),
    error_message: z.string().optional(),
  })),
});

export class TargetingHandler {
  /**
   * Search for interest targeting options by keyword
   */
  async searchInterests(
    authPayload: JWTPayload,
    params: z.infer<typeof InterestSearchInput>
  ): Promise<z.infer<typeof InterestSearchResult>> {
    logger.info('Executing search_interests', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Use Meta's targeting search endpoint
        const response = await api.call('search', [
          'type=adinterest',
          `q=${params.query}`,
          `limit=${params.limit}`,
        ]);

        const interests = (response as any).data || [];
        const validatedInterests = interests.map((interest: any) => ({
          id: interest.id,
          name: interest.name,
          audience_size: interest.audience_size,
          path: interest.path,
        }));

        return { interests: validatedInterests };
      },
      {
        toolName: 'search_interests',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Get all available behavior targeting options
   */
  async searchBehaviors(
    authPayload: JWTPayload,
    params: z.infer<typeof BehaviorSearchInput>
  ): Promise<z.infer<typeof BehaviorSearchResult>> {
    logger.info('Executing search_behaviors', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Use Meta's targeting search endpoint for behaviors
        const response = await api.call('search', [
          'type=adbehavior',
          `limit=${params.limit}`,
        ]);

        const behaviors = (response as any).data || [];
        const validatedBehaviors = behaviors.map((behavior: any) => ({
          id: behavior.id,
          name: behavior.name,
          audience_size_lower_bound: behavior.audience_size_lower_bound,
          audience_size_upper_bound: behavior.audience_size_upper_bound,
          path: behavior.path,
          description: behavior.description,
        }));

        return { behaviors: validatedBehaviors };
      },
      {
        toolName: 'search_behaviors',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Get demographic targeting options
   */
  async searchDemographics(
    authPayload: JWTPayload,
    params: z.infer<typeof DemographicSearchInput>
  ): Promise<z.infer<typeof DemographicSearchResult>> {
    logger.info('Executing search_demographics', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Use Meta's targeting search endpoint for demographics
        const response = await api.call('search', [
          'type=adtargetingcategory',
          `class=${params.demographicClass}`,
          `limit=${params.limit}`,
        ]);

        const demographics = (response as any).data || [];
        const validatedDemographics = demographics.map((demo: any) => ({
          id: demo.id,
          name: demo.name,
          audience_size_lower_bound: demo.audience_size_lower_bound,
          audience_size_upper_bound: demo.audience_size_upper_bound,
          path: demo.path,
          description: demo.description,
        }));

        return { demographics: validatedDemographics };
      },
      {
        toolName: 'search_demographics',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Search for geographic targeting locations
   */
  async searchGeoLocations(
    authPayload: JWTPayload,
    params: z.infer<typeof GeoLocationSearchInput>
  ): Promise<z.infer<typeof GeoLocationSearchResult>> {
    logger.info('Executing search_geo_locations', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Use Meta's targeting search endpoint for locations
        const response = await api.call('search', [
          'type=adgeolocation',
          `q=${params.query}`,
          `location_types=${params.locationTypes.join(',')}`,
          `limit=${params.limit}`,
        ]);

        const locations = (response as any).data || [];
        const validatedLocations = locations.map((location: any) => ({
          key: location.key,
          name: location.name,
          type: location.type,
          country_code: location.country_code,
          country_name: location.country_name,
          region_id: location.region_id,
          region_name: location.region_name,
          city_id: location.city_id,
          city_name: location.city_name,
        }));

        return { locations: validatedLocations };
      },
      {
        toolName: 'search_geo_locations',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Validate interest names or IDs for targeting
   */
  async validateInterests(
    authPayload: JWTPayload,
    params: z.infer<typeof InterestValidationInput>
  ): Promise<z.infer<typeof InterestValidationResult>> {
    logger.info('Executing validate_interests', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        const validations = [];

        // Validate interest names
        if (params.interestList && params.interestList.length > 0) {
          for (const interestName of params.interestList) {
            try {
              const response = await api.call('search', [
                'type=adinterest',
                `q=${interestName}`,
                'limit=1',
              ]);

              const interest = (response as any).data?.[0];
              if (interest) {
                validations.push({
                  name: interestName,
                  id: interest.id,
                  valid: true,
                  audience_size: interest.audience_size,
                });
              } else {
                validations.push({
                  name: interestName,
                  valid: false,
                  error_message: 'Interest not found',
                });
              }
            } catch (error) {
              validations.push({
                name: interestName,
                valid: false,
                error_message: 'Error validating interest',
              });
            }
          }
        }

        // Validate interest IDs
        if (params.interestFbidList && params.interestFbidList.length > 0) {
          for (const interestId of params.interestFbidList) {
            try {
              const response = await api.call(interestId, [
                'id',
                'name',
                'audience_size',
              ]);

                              validations.push({
                  id: interestId,
                  name: (response as any).name,
                  valid: true,
                  audience_size: (response as any).audience_size,
                });
            } catch (error) {
              validations.push({
                id: interestId,
                valid: false,
                error_message: 'Invalid interest ID',
              });
            }
          }
        }

        return { validations };
      },
      {
        toolName: 'validate_interests',
        userId: authPayload.userId,
      }
    );
  }
}

export const targetingHandler = new TargetingHandler();
