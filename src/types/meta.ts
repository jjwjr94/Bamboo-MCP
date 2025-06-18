// Meta Ads API type definitions

export type CampaignObjective =
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_SALES'
  | 'OUTCOME_APP_PROMOTION'
  | 'OUTCOME_AWARENESS';

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

export type AdSetBillingEvent =
  | 'LINK_CLICKS'
  | 'IMPRESSIONS'
  | 'REACH'
  | 'THRUPLAY'
  | 'LANDING_PAGE_VIEWS';

export type AdSetOptimizationGoal =
  | 'LINK_CLICKS'
  | 'IMPRESSIONS'
  | 'REACH'
  | 'LANDING_PAGE_VIEWS'
  | 'LEAD_GENERATION'
  | 'CONVERSIONS'
  | 'THRUPLAY';

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
  datePreset?:
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'lifetime';
  timeRange?: {
    since: string; // YYYY-MM-DD
    until: string; // YYYY-MM-DD
  };
  fields?: string[];
  breakdowns?: string[];
  limit?: number;
  level?: 'account' | 'campaign' | 'adset' | 'ad';
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

export interface CustomAudienceRequest {
  name: string;
  subtype:
    | 'CUSTOM'
    | 'WEBSITE'
    | 'APP'
    | 'OFFLINE_CONVERSION'
    | 'CLAIM'
    | 'PARTNER'
    | 'MANAGED'
    | 'VIDEO'
    | 'LOOKALIKE'
    | 'ENGAGEMENT'
    | 'DATA_SET'
    | 'BAG_OF_ACCOUNTS'
    | 'STUDY_RULE_AUDIENCE'
    | 'FOX';
  description?: string;
  customerFileSource?:
    | 'USER_PROVIDED_ONLY'
    | 'PARTNER_PROVIDED_ONLY'
    | 'BOTH_USER_AND_PARTNER_PROVIDED';
}

export interface ProductCatalogRequest {
  name: string;
  vertical?:
    | 'commerce'
    | 'destinations'
    | 'flights'
    | 'home_listings'
    | 'hotels'
    | 'media'
    | 'offline_commerce'
    | 'automotive'
    | 'boats'
    | 'education'
    | 'events'
    | 'jobs'
    | 'motorbikes'
    | 'pet_supplies'
    | 'real_estate'
    | 'software_apps'
    | 'travel'
    | 'vehicles'
    | 'womens_apparel'
    | 'mens_apparel'
    | 'kids_apparel'
    | 'home_goods'
    | 'jewelry'
    | 'electronics'
    | 'sports'
    | 'beauty'
    | 'fitness'
    | 'baby_products'
    | 'food'
    | 'toys'
    | 'books'
    | 'music'
    | 'games'
    | 'outdoor'
    | 'generic';
}

export interface ProductRequest {
  name: string;
  description?: string;
  availability: 'in stock' | 'out of stock' | 'preorder' | 'available for order' | 'discontinued';
  condition: 'new' | 'refurbished' | 'used';
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
  type: 'image' | 'video';
  adAccountId: string;
}

export interface MetaApiRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
  }>;
  paging?: {
    cursors: {
      after: string;
    };
    next?: string;
  };
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
  type: 'image' | 'video';
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
