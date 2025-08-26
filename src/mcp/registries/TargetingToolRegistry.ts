import { z } from 'zod';

// Interest targeting schemas
export const InterestSearchInput = z.object({
  accessToken: z.string().optional(),
  query: z.string().describe('Search term for interests (e.g., "baseball", "cooking", "travel")'),
  limit: z.number().min(1).max(100).default(25).describe('Maximum number of results to return'),
});

export const InterestSearchResult = z.object({
  interests: z.array(z.object({
    id: z.string(),
    name: z.string(),
    audience_size: z.number().optional(),
    path: z.array(z.string()).optional(),
  })),
});

// Behavior targeting schemas
export const BehaviorSearchInput = z.object({
  accessToken: z.string().optional(),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of results to return'),
});

export const BehaviorSearchResult = z.object({
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
export const DemographicSearchInput = z.object({
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

export const DemographicSearchResult = z.object({
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
export const GeoLocationSearchInput = z.object({
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

export const GeoLocationSearchResult = z.object({
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
export const InterestValidationInput = z.object({
  accessToken: z.string().optional(),
  interestList: z.array(z.string()).describe('List of interest names to validate (e.g., ["Japan", "Basketball"])'),
  interestFbidList: z.array(z.string()).optional().describe('List of interest IDs to validate (e.g., ["6003700426513"])'),
});

export const InterestValidationResult = z.object({
  validations: z.array(z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    valid: z.boolean(),
    audience_size: z.number().optional(),
    error_message: z.string().optional(),
  })),
});

export type InterestSearchInput = z.infer<typeof InterestSearchInput>;
export type InterestSearchResult = z.infer<typeof InterestSearchResult>;
export type BehaviorSearchInput = z.infer<typeof BehaviorSearchInput>;
export type BehaviorSearchResult = z.infer<typeof BehaviorSearchResult>;
export type DemographicSearchInput = z.infer<typeof DemographicSearchInput>;
export type DemographicSearchResult = z.infer<typeof DemographicSearchResult>;
export type GeoLocationSearchInput = z.infer<typeof GeoLocationSearchInput>;
export type GeoLocationSearchResult = z.infer<typeof GeoLocationSearchResult>;
export type InterestValidationInput = z.infer<typeof InterestValidationInput>;
export type InterestValidationResult = z.infer<typeof InterestValidationResult>;
