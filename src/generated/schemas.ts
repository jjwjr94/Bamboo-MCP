// Simple static schemas based on Meta Ads API documentation
// Source: https://developers.facebook.com/docs/marketing-api/insights/

import { z } from 'zod';

// Core insight metrics from Meta Ads API
export const InsightMetricSchema = z.enum([
  'spend',
  'impressions', 
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'reach',
  'frequency',
  'conversions',
  'cost_per_conversion',
  'actions',
  'unique_clicks',
  'unique_ctr',
  'cost_per_unique_click',
  'inline_link_clicks',
  'cost_per_inline_link_click',
  'outbound_clicks',
  'video_30_sec_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions',
  'video_thruplay_watched_actions'
]);

export type InsightMetric = z.infer<typeof InsightMetricSchema>;

// Breakdown dimensions from Meta Ads API
export const AdsInsightsBreakdownsSchema = z.enum([
  // Time-based breakdowns
  'day',
  'month',
  'week',
  'hour',
  'hourly_stats_aggregated_by_advertiser_time_zone',
  'hourly_stats_aggregated_by_audience_time_zone',
  
  // Demographic breakdowns
  'age',
  'gender',
  
  // Geographic breakdowns
  'country',
  'region',
  'city',
  'dma',
  
  // Device and platform breakdowns
  'device_platform',
  'publisher_platform',
  'platform_position',
  'impression_device',
  
  // Placement breakdowns
  'placement',
  
  // Product breakdowns
  'product_id',
  'product_set_id_breakdown',
  'product_brand_breakdown',
  'product_category_breakdown',
  'product_custom_label_0_breakdown',
  'product_custom_label_1_breakdown',
  'product_custom_label_2_breakdown',
  'product_custom_label_3_breakdown',
  'product_custom_label_4_breakdown',
  'product_group_content_id_breakdown',
  
  // Creative and ad format breakdowns
  'ad_format_asset',
  'body_asset',
  'call_to_action_asset',
  'description_asset',
  'image_asset',
  'link_url_asset',
  'title_asset',
  'video_asset',
  'media_asset_url',
  'media_creator',
  'media_destination_url',
  'media_format',
  'media_origin_url',
  'media_text_content',
  'media_type',
  
  // Advanced tracking breakdowns
  'frequency_value',
  'coarse_conversion_value',
  'app_id',
  'landing_destination',
  'conversion_destination',
  'standard_event_content_type',
  'signal_source_bucket',
  
  // Attribution and reporting breakdowns
  'breakdown_ad_objective',
  'breakdown_reporting_ad_id',
  'skan_campaign_id',
  'skan_conversion_id',
  'skan_version',
  'mmm',
  
  // Extension and automation breakdowns
  'ad_extension_domain',
  'ad_extension_url',
  'creative_automation_asset_id',
  'creative_relaxation_asset_type',
  'flexible_format_asset_type',
  'gen_ai_asset_type',
  
  // Business and CRM breakdowns
  'crm_advertiser_l12_territory_ids',
  'crm_advertiser_subvertical_id',
  'crm_advertiser_vertical_id',
  'crm_ult_advertiser_id',
  
  // Behavioral and interaction breakdowns
  'fidelity_type',
  'is_auto_advance',
  'is_conversion_id_modeled',
  'is_rendered_as_delayed_skip_ad',
  'redownload',
  
  // Messaging and communication breakdowns
  'marketing_messages_btn_name',
  
  // Location and venue breakdowns
  'place_page_id',
  'comscore_market',
  
  // User and persona breakdowns
  'user_persona_id',
  'user_persona_name',
  'hsid',
  
  // Rule and automation breakdowns
  'rule_set_id',
  'rule_set_name',
  
  // Specialized tracking breakdowns
  'postback_sequence_index',
  'rta_ugc_topic',
  'sot_attribution_model_type',
  'sot_attribution_window',
  'sot_channel',
  'sot_event_type',
  'sot_source',
  'impression_view_time_advertiser_hour_v2',
  
  // MDSA (Multi-Destination Shopping Ads) breakdowns
  'mdsa_landing_destination'
]);


export type AdsInsightsBreakdowns = z.infer<typeof AdsInsightsBreakdownsSchema>;

// Date presets from Meta Ads API
export const AdsInsightsDatePresetSchema = z.enum([
  'today',
  'yesterday',
  'this_week_sun_today',
  'this_week_mon_today',
  'last_week_sun_sat',
  'last_week_mon_sun',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'last_3_days',
  'last_7_days',
  'last_14_days',
  'last_30_days',
  'last_90_days'
]);

export type AdsInsightsDatePreset = z.infer<typeof AdsInsightsDatePresetSchema>;

// Insight levels from Meta Ads API
export const AdsInsightsLevelSchema = z.enum([
  'account',
  'campaign',
  'adset',
  'ad'
]);

export type AdsInsightsLevel = z.infer<typeof AdsInsightsLevelSchema>;

// Filter operators from Meta Ads API
export const FilterOperatorSchema = z.enum([
  'EQUAL',
  'NOT_EQUAL',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'LESS_THAN',
  'CONTAIN',
  'NOT_CONTAIN'
]);

export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

// Export formats
export const ExportFormatSchema = z.enum([
  'json',
  'csv',
  'excel'
]);

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

// Additional schemas needed by existing code
export const CampaignObjectiveSchema = z.enum([
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC', 
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_APP_PROMOTION',
  'OUTCOME_SALES'
]);

export const CampaignStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'DELETED',
  'ARCHIVED'
]);

export const CampaignSpecialAdCategoriesSchema = z.enum([
  'EMPLOYMENT',
  'FINANCIAL_PRODUCTS_SERVICES',
  'HOUSING',
  'ISSUES_ELECTIONS_POLITICS',
  'NONE',
  'ONLINE_GAMBLING_AND_GAMING'
]);

export const AdSetBidStrategySchema = z.enum([
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'TARGET_COST',
  'BID_CAP',
  'COST_CAP'
]);

export const CampaignBidStrategySchema = z.enum([
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'TARGET_COST',
  'BID_CAP',
  'COST_CAP'
]);

export const AdSetBillingEventSchema = z.enum([
  'APP_INSTALLS',
  'IMPRESSIONS',
  'LINK_CLICKS',
  'LISTING_INTERACTION',
  'NONE',
  'POST_ENGAGEMENT',
  'PURCHASE',
  'THRUPLAY'
]);

export const AdSetOptimizationGoalSchema = z.enum([
  'ADVERTISER_SILOED_VALUE',
  'APP_INSTALLS',
  'APP_INSTALLS_AND_OFFSITE_CONVERSIONS',
  'CONVERSATIONS',
  'ENGAGED_USERS',
  'EVENT_RESPONSES',
  'IMPRESSIONS',
  'IN_APP_VALUE',
  'LANDING_PAGE_VIEWS',
  'LEAD_GENERATION',
  'LINK_CLICKS',
  'MEANINGFUL_CALL_ATTEMPT',
  'MESSAGING_APPOINTMENT_CONVERSION',
  'MESSAGING_PURCHASE_CONVERSION',
  'PROFILE_AND_PAGE_ENGAGEMENT',
  'PROFILE_VISIT',
  'QUALITY_CALL',
  'QUALITY_LEAD',
  'REACH',
  'REMINDERS_SET',
  'SUBSCRIBERS',
  'THRUPLAY',
  'VALUE',
  'VISIT_INSTAGRAM_PROFILE'
]);

export const AdSetStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'DELETED',
  'ARCHIVED'
]);

export const AdStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'DELETED',
  'ARCHIVED'
]);

export const AdCreativeCallToActionTypeSchema = z.enum([
  'ADD_TO_CART',
  'APPLY_NOW',
  'ASK_ABOUT_SERVICES',
  'ASK_FOR_MORE_INFO',
  'AUDIO_CALL',
  'BOOK_A_CONSULTATION',
  'BOOK_NOW',
  'BOOK_TRAVEL',
  'BUY',
  'BUY_NOW',
  'BUY_TICKETS',
  'BUY_VIA_MESSAGE',
  'CALL',
  'CALL_ME',
  'CALL_NOW',
  'CHAT_WITH_US',
  'CONFIRM',
  'CONTACT',
  'CONTACT_US',
  'DONATE',
  'DONATE_NOW',
  'DOWNLOAD',
  'EVENT_RSVP',
  'FIND_A_GROUP',
  'FIND_YOUR_GROUPS',
  'FOLLOW_NEWS_STORYLINE',
  'FOLLOW_PAGE',
  'FOLLOW_USER',
  'GET_A_QUOTE',
  'GET_DIRECTIONS',
  'GET_IN_TOUCH',
  'GET_OFFER',
  'GET_OFFER_VIEW',
  'GET_PROMOTIONS',
  'GET_QUOTE',
  'GET_SHOWTIMES',
  'GET_STARTED',
  'INQUIRE_NOW',
  'INSTALL_APP',
  'INSTALL_MOBILE_APP',
  'JOIN_CHANNEL',
  'LEARN_MORE',
  'LIKE_PAGE',
  'LISTEN_MUSIC',
  'LISTEN_NOW',
  'MAKE_AN_APPOINTMENT',
  'MESSAGE_PAGE',
  'MOBILE_DOWNLOAD',
  'NO_BUTTON',
  'OPEN_INSTANT_APP',
  'OPEN_LINK',
  'ORDER_NOW',
  'PAY_TO_ACCESS',
  'PLAY_GAME',
  'PLAY_GAME_ON_FACEBOOK',
  'PURCHASE_GIFT_CARDS',
  'RAISE_MONEY',
  'RECORD_NOW',
  'REFER_FRIENDS',
  'REQUEST_TIME',
  'SAY_THANKS',
  'SEE_MORE',
  'SELL_NOW',
  'SEND_A_GIFT',
  'SEND_GIFT_MONEY',
  'SEND_UPDATES',
  'SHARE',
  'SHOP_NOW',
  'SIGN_UP',
  'START_ORDER',
  'SUBSCRIBE',
  'SWIPE_UP_PRODUCT',
  'SWIPE_UP_SHOP',
  'UPDATE_APP',
  'USE_APP',
  'USE_MOBILE_APP',
  'VIDEO_CALL',
  'VIEW_CART',
  'VIEW_CHANNEL',
  'VIEW_PRODUCT',
  'VISIT_PAGES_FEED',
  'WATCH_LIVE_VIDEO',
  'WATCH_MORE',
  'WATCH_VIDEO',
  'WHATSAPP_MESSAGE'
]);

export const CustomAudienceSubtypeSchema = z.enum([
  'CUSTOM',
  'WEBSITE',
  'APP',
  'OFFLINE_CONVERSION',
  'CLAIM',
  'PARTNER',
  'MANAGED',
  'VIDEO',
  'LOOKALIKE',
  'ENGAGEMENT',
  'DATA_SET',
  'BAG_OF_ACCOUNTS',
  'STUDY_RULE_AUDIENCE',
  'FOX'
]);

export const CustomAudienceCustomerFileSourceSchema = z.enum([
  'USER_PROVIDED_ONLY',
  'PARTNER_PROVIDED_ONLY',
  'BOTH_USER_AND_PARTNER_PROVIDED'
]);

export const ProductCatalogVerticalSchema = z.enum([
  'adoptable_pets',
  'commerce',
  'destinations',
  'flights',
  'generic',
  'home_listings',
  'hotels',
  'jobs',
  'local_service_businesses',
  'offer_items',
  'offline_commerce',
  'transactable_items',
  'vehicles'
]);

export const ProductAvailabilitySchema = z.enum([
  'in stock',
  'out of stock',
  'preorder',
  'available for order',
  'discontinued'
]);

export const ProductConditionSchema = z.enum([
  'new',
  'refurbished',
  'used'
]);

export const AssetTypeSchema = z.enum([
  'image',
  'video'
]);

export const HttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'DELETE'
]);

export const InsightLevelSchema = z.enum([
  'account',
  'campaign',
  'adset',
  'ad'
]);

// Export types
export type CampaignObjective = z.infer<typeof CampaignObjectiveSchema>;
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type CampaignSpecialAdCategories = z.infer<typeof CampaignSpecialAdCategoriesSchema>;
export type AdSetBidStrategy = z.infer<typeof AdSetBidStrategySchema>;
export type CampaignBidStrategy = z.infer<typeof CampaignBidStrategySchema>;
export type AdSetBillingEvent = z.infer<typeof AdSetBillingEventSchema>;
export type AdSetOptimizationGoal = z.infer<typeof AdSetOptimizationGoalSchema>;
export type AdSetStatus = z.infer<typeof AdSetStatusSchema>;
export type AdStatus = z.infer<typeof AdStatusSchema>;
export type AdCreativeCallToActionType = z.infer<typeof AdCreativeCallToActionTypeSchema>;
export type CustomAudienceSubtype = z.infer<typeof CustomAudienceSubtypeSchema>;
export type CustomAudienceCustomerFileSource = z.infer<typeof CustomAudienceCustomerFileSourceSchema>;
export type ProductCatalogVertical = z.infer<typeof ProductCatalogVerticalSchema>;
export type ProductAvailability = z.infer<typeof ProductAvailabilitySchema>;
export type ProductCondition = z.infer<typeof ProductConditionSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type InsightLevel = z.infer<typeof InsightLevelSchema>;

// Meta Ads Insights response schema
export const MetaAdsInsightsResponseSchema = z.object({
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  ctr: z.string().optional(),
  cpc: z.string().optional(),
  cpm: z.string().optional(),
  reach: z.string().optional(),
  frequency: z.string().optional(),
  conversions: z.string().optional(),
  cost_per_conversion: z.string().optional(),
  actions: z.array(z.unknown()).optional(),
  unique_clicks: z.string().optional(),
  unique_ctr: z.string().optional(),
  cost_per_unique_click: z.string().optional(),
  inline_link_clicks: z.string().optional(),
  cost_per_inline_link_click: z.string().optional(),
  outbound_clicks: z.string().optional(),
  video_30_sec_watched_actions: z.string().optional(),
  video_p25_watched_actions: z.string().optional(),
  video_p50_watched_actions: z.string().optional(),
  video_p75_watched_actions: z.string().optional(),
  video_p100_watched_actions: z.string().optional(),
  video_thruplay_watched_actions: z.string().optional()
}).passthrough();

export type MetaAdsInsightsResponse = z.infer<typeof MetaAdsInsightsResponseSchema>;

// Paging schema for list responses
export const PagingSchema = z.object({
  cursors: z.object({
    before: z.string().optional(),
    after: z.string().optional()
  }).optional(),
  next: z.string().optional(),
  previous: z.string().optional()
}).optional();

// Campaign response schema
export const MetaCampaignResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  objective: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// AdSet response schema
export const MetaAdSetResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  campaign_id: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// Ad response schema
export const MetaAdResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  adset_id: z.string().optional(),
  campaign_id: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// AdAccount response schema
export const MetaAdAccountResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  account_status: z.string().optional(),
  currency: z.string().optional(),
  timezone_name: z.string().optional()
}).passthrough();

// AdCreative response schema
export const MetaAdCreativeResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// Ads Archive response schema
export const MetaAdsArchiveResponseSchema = z.object({
  id: z.string(),
  ad_archive_id: z.string().optional(),
  ad_creation_time: z.string().optional(),
  ad_creative_body: z.string().optional(),
  ad_creative_link_caption: z.string().optional(),
  ad_creative_link_description: z.string().optional(),
  ad_creative_link_title: z.string().optional(),
  ad_delivery_start_time: z.string().optional(),
  ad_delivery_stop_time: z.string().optional(),
  ad_snapshot_url: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  languages: z.array(z.string()).optional(),
  page_id: z.string().optional(),
  page_name: z.string().optional(),
  publisher_platforms: z.array(z.string()).optional(),
  search_terms: z.array(z.string()).optional(),
  is_active: z.boolean().optional()
}).passthrough();

// Business response schema
export const MetaBusinessResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// BusinessUser response schema
export const MetaBusinessUserResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional()
}).passthrough();

// CustomAudience response schema
export const MetaCustomAudienceResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  subtype: z.string().optional(),
  description: z.string().optional(),
  approximate_count: z.number().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// Page response schema
export const MetaPageResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// PagePost response schema
export const MetaPagePostResponseSchema = z.object({
  id: z.string(),
  message: z.string().optional(),
  created_time: z.string().optional(),
  updated_time: z.string().optional()
}).passthrough();

// List response schemas
export const CampaignListResponseSchema = z.object({
  campaigns: z.array(MetaCampaignResponseSchema),
  paging: PagingSchema
});

export const AdSetListResponseSchema = z.object({
  adSets: z.array(MetaAdSetResponseSchema),
  paging: PagingSchema
});

export const AdListResponseSchema = z.object({
  ads: z.array(MetaAdResponseSchema),
  paging: PagingSchema
});

export const AdAccountListResponseSchema = z.object({
  accounts: z.array(MetaAdAccountResponseSchema),
  paging: PagingSchema
});

export const AdsInsightsListResponseSchema = z.object({
  insights: z.array(MetaAdsInsightsResponseSchema),
  paging: PagingSchema
});

// Success response schemas
export const MetaCreateSuccessResponseSchema = z.object({
  id: z.string(),
}).passthrough();

export const MetaUpdateSuccessResponseSchema = z.object({
  success: z.boolean(),
}).passthrough();

export const MetaDeleteSuccessResponseSchema = z.object({
  success: z.boolean(),
}).passthrough();
