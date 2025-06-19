// Meta Ads API type definitions

// Import auto-generated types from schemas
import type {
  AdSetBillingEvent,
  AdSetOptimizationGoal,
  AdsInsightsBreakdowns,
  AdsInsightsDatePreset,
  AssetType,
  CampaignObjective,
  CampaignStatus,
  CustomAudienceCustomerFileSource,
  CustomAudienceSubtype,
  HttpMethod,
  InsightLevel,
  ProductAvailability,
  ProductCatalogVertical,
  ProductCondition,
} from '../generated/schemas.js';

export interface MetaTargeting {
  geoLocations?: {
    countries?: string[];
    regions?: Array<{ key: string }>;
    cities?: Array<{ key: string }>;
  };
  ageMin?: number;
  ageMax?: number;
  genders?: Array<'1' | '2'>; // 1 = male, 2 = female
  interests?: Array<{ id: string; name?: string }>;
  behaviors?: Array<{ id: string; name?: string }>;
  customAudiences?: Array<{ id: string }>;
  excludedCustomAudiences?: Array<{ id: string }>;
  flexibleSpec?: Array<{
    interests?: Array<{ id: string; name?: string }>;
    behaviors?: Array<{ id: string; name?: string }>;
  }>;
  devicePlatforms?: Array<'mobile' | 'desktop'>;
  publisherPlatforms?: Array<'facebook' | 'instagram' | 'messenger' | 'audience_network'>;
}

export interface CreateCampaignRequest {
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  adAccountId?: string; // Optional to support intelligent account selection
  dailyBudget?: number; // in cents
  lifetimeBudget?: number; // in cents
  specialAdCategories?: string[];
}

export interface CreateAdSetRequest {
  campaignId: string;
  name: string;
  dailyBudget?: number; // in cents
  lifetimeBudget?: number; // in cents
  targeting: MetaTargeting;
  billingEvent: AdSetBillingEvent;
  optimizationGoal: AdSetOptimizationGoal;
  bidAmount?: number; // in cents
  startTime?: string; // ISO date
  endTime?: string; // ISO date
  status?: CampaignStatus;
}

export interface CreateAdRequest {
  adsetId: string;
  name: string;
  creativeId: string;
  status?: CampaignStatus;
}

export interface CreateAdCreativeRequest {
  name: string;
  objectStorySpec: {
    pageId: string;
    linkData?: {
      link: string;
      message?: string;
      name?: string;
      description?: string;
      imageHash?: string;
      callToAction?: {
        type: string;
        value?: {
          link?: string;
        };
      };
    };
    videoData?: {
      videoId: string;
      title?: string;
      message?: string;
      callToAction?: {
        type: string;
        value?: {
          link?: string;
        };
      };
    };
  };
}

export interface MetaInsightsParams {
  datePreset?: AdsInsightsDatePreset;
  timeRange?: {
    since: string; // YYYY-MM-DD
    until: string; // YYYY-MM-DD
  };
  fields?: string[];
  breakdowns?: string[];
  limit?: number;
  level?: InsightLevel;
}

export interface MetaInsights {
  impressions?: string;
  clicks?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  reach?: string;
  frequency?: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  costPerAction?: Array<{
    action_type: string;
    value: string;
  }>;
  dateStart?: string;
  dateStop?: string;
}

// Enhanced insights types for better API support
export type InsightMetric =
  | 'spend'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'reach'
  | 'frequency'
  | 'conversions'
  | 'cost_per_conversion'
  | 'actions';

export type InsightBreakdown = AdsInsightsBreakdowns;

export interface GetAdInsightsRequest {
  adAccountId?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  metrics: InsightMetric[];
  breakdowns?: InsightBreakdown[];
  datePreset?: AdsInsightsDatePreset;
  timeRange?: {
    since: string; // YYYY-MM-DD
    until: string; // YYYY-MM-DD
  };
  limit?: number;
}

export interface MetaInsight {
  [key: string]: string | number | undefined | unknown;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  conversions?: string;
  cost_per_conversion?: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  // Breakdown fields
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  impression_device?: string;
  placement?: string;
  action_type?: string;
  action_device?: string;
  conversion_destination?: string;
}

export interface CustomAudienceRequest {
  name: string;
  subtype: CustomAudienceSubtype;
  description?: string;
  customerFileSource?: CustomAudienceCustomerFileSource;
}

export interface ProductCatalogRequest {
  name: string;
  vertical?: ProductCatalogVertical;
}

export interface ProductRequest {
  name: string;
  description?: string;
  availability: ProductAvailability;
  condition: ProductCondition;
  price: string; // e.g., "19.99 USD"
  link: string;
  imageUrl?: string;
  brand?: string;
  category?: string;
  retailerId: string;
  gtin?: string;
  mpn?: string;
  customData?: Record<string, unknown>;
}

export interface UploadAssetRequest {
  filename: string;
  data: string; // base64 encoded
  type: AssetType;
  adAccountId: string;
}

export interface MetaApiRequest {
  endpoint: string;
  method: HttpMethod;
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

// OAuth-specific types for better type safety
export interface MetaOAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface MetaOAuthUserInfoResponse {
  id: string;
  name?: string;
}

export interface MetaOAuthAdAccountsResponse {
  data: Array<{
    id: string;
    name: string;
    account_status: string | number;
    currency: string;
    timezone_name: string;
    business?: {
      id: string;
      name?: string;
    };
  }>;
  paging?: {
    cursors: {
      after: string;
    };
    next?: string;
  };
}

export interface MetaAdAccountAssignedUsersResponse {
  data?: Array<{
    id: string;
    tasks?: string[];
  }>;
}

export interface MetaGraphApiError {
  error: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: string | number; // API may return numeric code – stored as string later
  currency: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  budget_remaining?: string;
  spend_cap?: string;
  configured_status?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  configured_status: string;
  created_time: string;
  updated_time: string;
  start_time: string;
  end_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  billing_event?: string;
  optimization_goal?: string;
  bid_amount?: string;
  targeting?: unknown;
  attribution_spec?: unknown;
  promoted_object?: unknown;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adsetId: string;
  creativeId?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaAsset {
  id: string;
  filename: string;
  type: AssetType;
  dimensions?: string;
  hash?: string;
  url: string;
  thumbnailUrl?: string;
  createdTime: string;
  displayData?: {
    dataUri: string;
    alt: string;
  };
}

// Business Manager types
export interface BusinessAccount {
  id: string;
  name: string;
  created_time?: string;
  link?: string;
  verification_status?: string;
  vertical?: string;
  timezone_id?: number;
}

export interface BusinessUser {
  id: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  title?: string;
  finance_permission?: string;
  ip_permission?: string;
  two_fac_status?: string;
  pending_email?: string;
}

export interface MetaBusinessAccountsResponse {
  data: BusinessAccount[];
  paging?: {
    cursors: {
      after: string;
    };
    next?: string;
  };
}

export interface MetaBusinessUsersResponse {
  data: BusinessUser[];
  paging?: {
    cursors: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

// SDK API Node List types for better type safety
export interface MetaApiNode {
  _data: any;
  _fields: string[];
}

export interface MetaApiNodeList extends Array<MetaApiNode> {
  _paging?: {
    cursors: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

// Re-export key auto-generated types for convenience
export type {
  CampaignObjective,
  CampaignStatus,
  AdSetBillingEvent,
  AdSetOptimizationGoal,
  CustomAudienceSubtype,
  CustomAudienceCustomerFileSource,
  ProductCatalogVertical,
  ProductAvailability,
  ProductCondition,
  AssetType,
  HttpMethod,
  AdsInsightsDatePreset,
  InsightLevel,
};
