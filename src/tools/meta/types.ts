/**
 * This file defines clean, domain-specific result types for Meta handler operations.
 * These types are inferred from the Zod schemas in `src/generated/schemas.ts`
 * and represent the data structure that handlers should return before being
 * wrapped in a `CallToolResult`.
 *
 * Clean architecture principles:
 * - Pure domain types without framework dependencies
 * - Explicit modeling using TypeScript interfaces
 * - Types inferred from validated Zod schemas for consistency
 */
import type { z } from 'zod';
import type {
  MetaAdAccountResponseSchema,
  MetaAdCreativeResponseSchema,
  MetaAdResponseSchema,
  MetaAdSetResponseSchema,
  MetaAdsArchiveResponseSchema,
  MetaAdsInsightsResponseSchema,
  MetaBusinessResponseSchema,
  MetaBusinessUserResponseSchema,
  MetaCampaignResponseSchema,
  MetaCreateSuccessResponseSchema,
  MetaCustomAudienceResponseSchema,
  MetaDeleteSuccessResponseSchema,
  MetaPagePostResponseSchema,
  MetaPageResponseSchema,
  MetaUpdateSuccessResponseSchema,
} from '../../generated/schemas.js';

// --- Core Entity Domain Types ---
// These are the fundamental Meta API entities, inferred from our validated schemas

export type MetaAd = z.infer<typeof MetaAdResponseSchema>;
export type MetaAdSet = z.infer<typeof MetaAdSetResponseSchema>;
export type MetaCampaign = z.infer<typeof MetaCampaignResponseSchema>;
export type MetaAdCreative = z.infer<typeof MetaAdCreativeResponseSchema>;
export type MetaCustomAudience = z.infer<typeof MetaCustomAudienceResponseSchema>;
export type MetaAdAccount = z.infer<typeof MetaAdAccountResponseSchema>;
export type MetaPage = z.infer<typeof MetaPageResponseSchema>;
export type MetaPagePost = z.infer<typeof MetaPagePostResponseSchema>;
export type MetaBusinessAccount = z.infer<typeof MetaBusinessResponseSchema>;
export type MetaBusinessUser = z.infer<typeof MetaBusinessUserResponseSchema>;
export type MetaInsights = z.infer<typeof MetaAdsInsightsResponseSchema>;

// Standard operation result types
export type MetaCreateSuccess = z.infer<typeof MetaCreateSuccessResponseSchema>;
export type MetaUpdateSuccess = z.infer<typeof MetaUpdateSuccessResponseSchema>;
export type MetaDeleteSuccess = z.infer<typeof MetaDeleteSuccessResponseSchema>;

// --- Handler-Specific Operation Result Types ---
// These define the exact structure returned by each handler method

/** Generic type for simple delete operations that return the ID of the deleted entity. */
type DeleteResult<IdKey extends string> = {
  [K in IdKey]: string;
};

// Ad Handler Results
export interface GetAdsResult {
  ads: MetaAd[];
}

export interface CreateAdResult {
  adId: string;
  name: string;
  adsetId: string;
  creativeId: string;
  status: string;
}

export interface UpdateAdResult {
  adId: string;
  updatedFields: string[];
}

export type DeleteAdResult = DeleteResult<'adId'>;

// Campaign Handler Results
export interface GetCampaignsResult {
  campaigns: MetaCampaign[];
}

export interface CreateCampaignResult {
  campaignId: string;
  name: string;
  objective: string;
  status: string;
}

export interface UpdateCampaignResult {
  campaignId: string;
  updatedFields: string[];
}

export type DeleteCampaignResult = DeleteResult<'campaignId'>;

// Ad Set Handler Results
export interface GetAdSetsResult {
  adSets: MetaAdSet[];
}

export interface CreateAdSetResult {
  adSetId: string;
  name: string;
  status: string;
  campaignId: string;
}

export interface UpdateAdSetResult {
  adSetId: string;
  updatedFields: string[];
}

export type DeleteAdSetResult = DeleteResult<'adSetId'>;

// Ad Creative Handler Results
export interface GetAdCreativesResult {
  adCreatives: MetaAdCreative[];
}

export interface CreateAdCreativeResult {
  adCreativeId: string;
  name: string;
}

export interface UpdateAdCreativeResult {
  adCreativeId: string;
  updatedFields: string[];
}

export type DeleteAdCreativeResult = DeleteResult<'adCreativeId'>;

export interface InitiateAssetUploadResult {
  uploadId: string;
  uploadUrl: string;
}

export interface GetAssetUploadStatusResult {
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  metaAssetId?: string;
  errorMessage?: string;
}

// Insights Handler Results
export interface GetAdInsightsResult {
  insights: MetaInsights[];
  summary: {
    totalRecords: number;
    dateRange?: {
      start?: string;
      end?: string;
    };
    metrics: string[];
    breakdowns?: string[];
  };
  exportData?: string;
}

export interface GetAdAccountInsightsResult {
  insights: MetaInsights[];
  summary: {
    totalRecords: number;
    dateRange?: {
      start?: string;
      end?: string;
    };
    metrics: string[];
    breakdowns?: string[];
    accountId: string;
  };
  exportData?: string;
}

// Custom Audience Handler Results
export interface GetCustomAudiencesResult {
  customAudiences: {
    id: string;
    account_id?: string;
    name: string;
    description?: string;
    approximate_count?: number;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    customer_file_source?: string;
    delivery_status?: {
      code?: string;
    };
    external_event_source?: object;
    is_value_based?: string;
    lookalike_audience_ids?: object;
    lookalike_spec?: object;
    operation_status?: object;
    opt_out_link?: string;
    pixel_id?: string;
    retention_days?: number;
    time_created?: number;
    time_updated?: number;
    data_source?: {
      type: string;
      sub_type?: string;
    };
    permission_for_actions?: object;
    sharing_status?: object;
    subtype?: string;
  }[];
}

export interface CreateCustomAudienceResult {
  name: string;
  subtype: string;
  customAudienceId: string;
}

export type DeleteCustomAudienceResult = DeleteResult<'customAudienceId'>;

// Ad Account Handler Results

/** Clean domain object for ad accounts returned by handlers */
export interface CleanMetaAdAccount {
  id: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  businessId: string | null;
  permissions: string[];
}

export interface GetAdAccountsResult {
  adAccounts: CleanMetaAdAccount[];
}

// Pages Handler Results
export interface GetPagesResult {
  pages: {
    id: string;
    name: string;
    category?: string;
    category_list?: string[];
    access_token?: string;
    tasks?: string[];
    perms?: string[];
    can_create_ads?: boolean;
    can_manage?: boolean;
    picture?: {
      url?: string;
    };
    link?: string;
    about?: string;
  }[];
}

export interface GetPagePostsResult {
  posts: {
    id: string;
    message?: string;
    created_time?: string;
    story?: string;
    permalink_url?: string;
    type?: string;
    status_type?: string;
    attachments?: object;
    full_picture?: string;
    shares?: {
      count?: number;
    };
    reactions?: object;
    comments?: object;
    insights?: object;
  }[];
}

export interface CreatePagePostAdResult {
  adId: string;
  adCreativeId: string;
}

// Business Manager Handler Results
export interface GetBusinessAccountsResult {
  businessAccounts: {
    id: string;
    name: string;
    created_time?: string;
    timezone_id?: string;
    primary_page?: string;
    vertical?: string;
    two_factor_type?: string;
  }[];
}

export interface GetBusinessUsersResult {
  businessUsers: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
    title?: string;
    work_email?: string;
    permissions?: string[];
    finance_permission?: string;
    created_time?: string;
  }[];
}

// Ads Archive Handler Results

/** A unified type for any ad item returned from the Ads Archive API, validated by Zod. */
export type MetaAdsArchiveItem = z.infer<typeof MetaAdsArchiveResponseSchema>;

/** Clean domain object for an individual ad from the Ads Archive. Alias for MetaAdsArchiveItem. */
export type MetaAdsArchiveAd = MetaAdsArchiveItem;

/** Clean domain object for an Ads Archive insight entry. Alias for MetaAdsArchiveItem. */
export type MetaAdsArchiveInsight = MetaAdsArchiveItem;

export interface SearchAdsArchiveResult {
  ads: MetaAdsArchiveAd[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

export interface GetPoliticalAdsResult {
  ads: MetaAdsArchiveAd[];
}

export interface GetPageArchiveAdsResult {
  ads: MetaAdsArchiveAd[];
}

export interface GetAdsArchiveInsightsResult {
  insights: MetaAdsArchiveInsight[];
}

// Targeting Search Handler Results
export interface TargetingInterest {
  id: string;
  name: string;
  audienceSize: number;
  path: string[];
}

export interface SearchInterestsResult {
  interests: TargetingInterest[];
  query: string;
  total: number;
}

export interface TargetingBehavior {
  id: string;
  name: string;
  audienceSize: number;
  path: string[];
}

export interface SearchBehaviorsResult {
  behaviors: TargetingBehavior[];
  query: string;
  total: number;
}

export interface TargetingLocation {
  key: string;
  name: string;
  type: string;
  countryCode: string;
  countryName: string;
}

export interface SearchLocationsResult {
  locations: TargetingLocation[];
  query: string;
  total: number;
}

export interface TargetingValidationItem {
  key?: string;
  id?: string;
  name: string;
  type?: string;
  supports_city?: boolean;
  supports_region?: boolean;
  is_valid?: boolean;
  message?: string;
}

export interface ValidateTargetingOptionsResult {
  validTargetingOptions: TargetingValidationItem[];
}
