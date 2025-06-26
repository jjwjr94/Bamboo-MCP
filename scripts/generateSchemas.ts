import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Ad,
  AdAccount,
  AdCreative,
  AdSet,
  AdsInsights,
  Business,
  BusinessUser,
  Campaign,
  CustomAudience,
  Page,
  PagePost,
  ProductCatalog,
} from 'facebook-nodejs-business-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../src/generated/schemas.ts');

// Official Meta deprecation mapping based on Marketing API v21+ changelog
// Source: https://developers.facebook.com/docs/graph-api/changelog/
const DEPRECATED_OBJECTIVES = {
  // Deprecated -> Current mapping (from Meta's official docs)
  BRAND_AWARENESS: 'OUTCOME_AWARENESS',
  REACH: 'OUTCOME_AWARENESS',
  LINK_CLICKS: 'OUTCOME_TRAFFIC',
  POST_ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  VIDEO_VIEWS: 'OUTCOME_ENGAGEMENT',
  PAGE_LIKES: 'OUTCOME_ENGAGEMENT',
  LEAD_GENERATION: 'OUTCOME_LEADS',
  MESSAGES: 'OUTCOME_LEADS',
  APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
  CONVERSIONS: 'OUTCOME_SALES',
  PRODUCT_CATALOG_SALES: 'OUTCOME_SALES',
  WEBSITE_CONVERSIONS: 'OUTCOME_SALES', // Explicitly deprecated
  STORE_VISITS: 'OUTCOME_SALES',
  EVENT_RESPONSES: 'OUTCOME_ENGAGEMENT',
  OFFER_CLAIMS: 'OUTCOME_ENGAGEMENT',
  LOCAL_AWARENESS: 'OUTCOME_AWARENESS',
};

// Current valid objectives (as of v21+)
const CURRENT_VALID_OBJECTIVES = [
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_APP_PROMOTION',
  'OUTCOME_SALES',
];

// Deprecated call to action types (internal/legacy types)
// Source: Meta API research - these appear to be legacy/internal CTA types
const DEPRECATED_CTA_TYPES = [
  'SOTTO_SUBSCRIBE', // Legacy internal CTA type
  'WOODHENGE_SUPPORT', // Legacy internal CTA type
  'VIDEO_ANNOTATION', // Deprecated video interaction type
];

// Deprecated special ad categories
// Source: Meta policy updates - CREDIT replaced by FINANCIAL_PRODUCTS_SERVICES as of 2024/2025
const DEPRECATED_SPECIAL_AD_CATEGORIES = [
  'CREDIT', // Deprecated in favor of FINANCIAL_PRODUCTS_SERVICES
];

// Deprecated AdSetBillingEvent values
// Source: Meta API research - CLICKS replaced by LINK_CLICKS, others are legacy/no longer recommended
const DEPRECATED_BILLING_EVENTS = [
  'CLICKS', // Deprecated in favor of LINK_CLICKS
  'PAGE_LIKES',
  'OFFER_CLAIMS',
];

// Deprecated AdSetOptimizationGoal values
// Source: Meta API research - these goals are legacy or have been replaced by outcome-based goals
const DEPRECATED_OPTIMIZATION_GOALS = [
  'OFFSITE_CONVERSIONS',
  'PAGE_LIKES',
  'POST_ENGAGEMENT',
  'AD_RECALL_LIFT',
  'NONE',
  'DERIVED_EVENTS',
];

// Note: TARGET_COST bid strategy was deprecated in v9 but is no longer in the SDK

// Configuration for constants to auto-generate from Meta SDK
const constantsToGenerate = [
  { name: 'CampaignObjective', constant: Campaign.Objective, filterDeprecated: true },
  { name: 'CampaignStatus', constant: Campaign.Status },
  { name: 'CampaignConfiguredStatus', constant: Campaign.ConfiguredStatus },
  { name: 'CampaignEffectiveStatus', constant: Campaign.EffectiveStatus },
  { name: 'CampaignBidStrategy', constant: Campaign.BidStrategy },
  {
    name: 'CampaignSpecialAdCategories',
    constant: Campaign.SpecialAdCategories,
    filterDeprecated: true,
  },
  { name: 'AdSetBillingEvent', constant: AdSet.BillingEvent, filterDeprecated: true },
  { name: 'AdSetOptimizationGoal', constant: AdSet.OptimizationGoal, filterDeprecated: true },
  { name: 'AdSetBidStrategy', constant: AdSet.BidStrategy },
  { name: 'AdSetConfiguredStatus', constant: AdSet.ConfiguredStatus },
  { name: 'AdSetEffectiveStatus', constant: AdSet.EffectiveStatus },
  { name: 'AdSetStatus', constant: AdSet.Status },
  { name: 'AdStatus', constant: Ad.Status },
  { name: 'AdConfiguredStatus', constant: Ad.ConfiguredStatus },
  { name: 'AdEffectiveStatus', constant: Ad.EffectiveStatus },
  {
    name: 'AdCreativeCallToActionType',
    constant: AdCreative.CallToActionType,
    filterDeprecated: true,
  },
  { name: 'AdCreativeObjectType', constant: AdCreative.ObjectType },
  { name: 'CustomAudienceSubtype', constant: CustomAudience.Subtype },
  { name: 'CustomAudienceCustomerFileSource', constant: CustomAudience.CustomerFileSource },
  { name: 'AdsInsightsDatePreset', constant: AdsInsights.DatePreset },
  { name: 'AdsInsightsLevel', constant: AdsInsights.Level },
  { name: 'AdsInsightsBreakdowns', constant: AdsInsights.Breakdowns },
  { name: 'ProductCatalogVertical', constant: ProductCatalog.Vertical },
];

// Manual constants for enums not available in SDK
const manualConstants = [
  {
    name: 'ProductAvailability',
    values: ['in stock', 'out of stock', 'preorder', 'available for order', 'discontinued'],
  },
  {
    name: 'ProductCondition',
    values: ['new', 'refurbished', 'used'],
  },
  {
    name: 'AssetType',
    values: ['image', 'video'],
  },
  {
    name: 'HttpMethod',
    values: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  {
    name: 'InsightLevel',
    values: ['account', 'campaign', 'adset', 'ad'],
  },
];

// Manually defined fields for APIs not covered by the facebook-nodejs-business-sdk
// These APIs require direct Graph API calls and manual schema definitions

// Ads Archive API fields based on official Meta documentation
// Source: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
// Validated against official API v23.0 documentation (2024-2025)
const AdsArchiveFields = [
  // Core fields (always available)
  'id',
  'ad_archive_id',
  'ad_creation_time',
  'ad_creative_body',
  'ad_creative_link_caption',
  'ad_creative_link_description',
  'ad_creative_link_title',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_snapshot_url',
  'country',
  'currency',
  'languages',
  'page_id',
  'page_name',
  'publisher_platforms',
  'search_terms',
  'is_active',
  // Political/Issue ads specific fields
  'bylines',
  'funding_entity',
  'demographic_distribution',
  'delivery_by_region',
  'region_distribution',
  'impressions',
  'spend',
  'spend_currency',
  'potential_reach',
  // EU-specific fields (for ads in EU)
  'target_locations',
  'target_gender',
  'target_ages',
  'eu_total_reach',
  'beneficiary_payers',
  'age_country_gender_reach_breakdown',
];

// Targeting Search API fields based on official Meta documentation
// Source: https://developers.facebook.com/docs/marketing-api/targeting-search/
// Covers adinterest, adgeolocation, and other targeting search types
const TargetingSearchFields = [
  // Common fields for all targeting search types
  'id',
  'name',
  'type',
  // Interest-specific fields (type=adinterest)
  'audience_size',
  'path',
  'topic',
  'description',
  // Location-specific fields (type=adgeolocation)
  'key',
  'country_code',
  'country_name',
  'region_id',
  'region',
  'primary_city_id',
  'primary_city',
  'supports_region',
  'supports_city',
  'geo_hierarchy_level',
  'geo_hierarchy_name',
  // Additional fields for different location types
  'is_worldwide',
  'country_codes',
  'subtext',
  'coverage',
];

// Curated list of insight metrics to generate from AdsInsights.Fields
// These are the most commonly used metrics for insights API
const INSIGHT_METRICS = [
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
  'outbound_clicks',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions',
  // Additional useful metrics
  'inline_link_clicks',
  'cost_per_inline_link_click',
  'video_30_sec_watched_actions',
  'video_thruplay_watched_actions',
];

/**
 * Filter deprecated values based on Meta's official deprecation mapping
 */
function filterDeprecatedValues(name: string, values: string[]): string[] {
  if (name === 'CampaignObjective') {
    const validValues = values.filter((value) => CURRENT_VALID_OBJECTIVES.includes(value));
    const deprecatedValues = values.filter((value) => Object.hasOwn(DEPRECATED_OBJECTIVES, value));

    console.info(`\n${name} Filtering Results:`);
    console.info(`Valid (${validValues.length}):`, validValues.join(', '));
    console.info(`Deprecated (${deprecatedValues.length}):`, deprecatedValues.join(', '));

    // Log deprecation mappings
    for (const deprecated of deprecatedValues) {
      console.info(`   ${deprecated} → ${DEPRECATED_OBJECTIVES[deprecated]}`);
    }

    return validValues;
  }

  if (name === 'AdCreativeCallToActionType') {
    const validValues = values.filter((value) => !DEPRECATED_CTA_TYPES.includes(value));
    const deprecatedValues = values.filter((value) => DEPRECATED_CTA_TYPES.includes(value));

    console.info(`\n${name} Filtering Results:`);
    console.info(`Valid (${validValues.length}):`, validValues.join(', '));
    console.info(`Deprecated (${deprecatedValues.length}):`, deprecatedValues.join(', '));

    // Log deprecated CTA types
    for (const deprecated of deprecatedValues) {
      console.info(`   ${deprecated} → (Legacy/Internal CTA type - no direct replacement)`);
    }

    return validValues;
  }

  if (name === 'CampaignSpecialAdCategories') {
    const validValues = values.filter((value) => !DEPRECATED_SPECIAL_AD_CATEGORIES.includes(value));
    const deprecatedValues = values.filter((value) =>
      DEPRECATED_SPECIAL_AD_CATEGORIES.includes(value)
    );

    console.info(`\n${name} Filtering Results:`);
    console.info(`Valid (${validValues.length}):`, validValues.join(', '));
    console.info(`Deprecated (${deprecatedValues.length}):`, deprecatedValues.join(', '));

    // Log deprecation mappings
    for (const deprecated of deprecatedValues) {
      console.info(`   ${deprecated} → FINANCIAL_PRODUCTS_SERVICES (Policy update 2024/2025)`);
    }

    return validValues;
  }

  if (name === 'AdSetBillingEvent') {
    const validValues = values.filter((value) => !DEPRECATED_BILLING_EVENTS.includes(value));
    const deprecatedValues = values.filter((value) => DEPRECATED_BILLING_EVENTS.includes(value));

    console.info(`\n${name} Filtering Results:`);
    console.info(`Valid (${validValues.length}):`, validValues.join(', '));
    console.info(`Deprecated (${deprecatedValues.length}):`, deprecatedValues.join(', '));
    console.info('   CLICKS → LINK_CLICKS (Official replacement)');
    console.info('   PAGE_LIKES, OFFER_CLAIMS → (Legacy values - no direct replacement)');

    return validValues;
  }

  if (name === 'AdSetOptimizationGoal') {
    const validValues = values.filter((value) => !DEPRECATED_OPTIMIZATION_GOALS.includes(value));
    const deprecatedValues = values.filter((value) =>
      DEPRECATED_OPTIMIZATION_GOALS.includes(value)
    );

    console.info(`\n${name} Filtering Results:`);
    console.info(`Valid (${validValues.length}):`, validValues.join(', '));
    console.info(`Deprecated (${deprecatedValues.length}):`, deprecatedValues.join(', '));

    for (const deprecated of deprecatedValues) {
      console.info(`   ${deprecated} → (Legacy/Deprecated goal - no direct replacement)`);
    }

    return validValues;
  }

  return values; // No filtering for other enums
}

/**
 * Generate InsightMetric enum from curated list, validated against AdsInsights.Fields
 */
function generateInsightMetricEnum() {
  if (!AdsInsights?.Fields) {
    console.warn('Warning: AdsInsights.Fields not available, skipping InsightMetric generation');
    return '';
  }

  const availableFields = Object.values(AdsInsights.Fields) as string[];
  const validMetrics: string[] = [];
  const invalidMetrics: string[] = [];

  // Validate each metric against available fields
  for (const metric of INSIGHT_METRICS) {
    if (availableFields.includes(metric)) {
      validMetrics.push(metric);
    } else {
      invalidMetrics.push(metric);
    }
  }

  if (invalidMetrics.length > 0) {
    console.warn(
      'Warning: The following InsightMetric values are not available in AdsInsights.Fields:',
      invalidMetrics
    );
  }

  if (validMetrics.length === 0) {
    console.warn('Warning: No valid InsightMetric values found, skipping generation');
    return '';
  }

  // Sort for consistent output
  validMetrics.sort();

  const enumValues = validMetrics.map((value) => `'${value}'`).join(', ');

  console.info('\nInsightMetric Generation:');
  console.info(`Valid metrics (${validMetrics.length}):`, validMetrics.join(', '));
  if (invalidMetrics.length > 0) {
    console.info(`Invalid metrics (${invalidMetrics.length}):`, invalidMetrics.join(', '));
  }

  return `
// InsightMetric enum generated from curated list and validated against Meta SDK
// Contains the most commonly used insight metrics for analytics and reporting
export const InsightMetricSchema = z.enum([${enumValues}]);
export type InsightMetric = z.infer<typeof InsightMetricSchema>;
`;
}

/**
 * Generate Zod schema and TypeScript type for an enum
 */
function generateEnumSchemaAndType(
  name: string,
  constant: unknown,
  options: { filterDeprecated?: boolean } = {}
) {
  let values: string[];

  if (Array.isArray(constant)) {
    values = constant;
  } else if (constant && typeof constant === 'object') {
    values = Object.values(constant).filter((value) => typeof value === 'string');
  } else {
    console.warn(`Warning: Could not extract values for ${name}, skipping`);
    return '';
  }

  if (values.length === 0) {
    console.warn(`Warning: No valid values found for ${name}, skipping`);
    return '';
  }

  // Apply deprecation filtering if enabled
  if (options.filterDeprecated) {
    values = filterDeprecatedValues(name, values);
  }

  // Sort values for consistent output
  values.sort();

  const enumValues = values.map((value) => `'${value}'`).join(', ');

  // Add deprecation notices for filtered enums
  let deprecationNotice = '';
  if (name === 'CampaignObjective') {
    deprecationNotice = `
// Note: This enum contains only current valid objectives (OUTCOME_*) as of Meta Marketing API v21+
// Deprecated objectives like WEBSITE_CONVERSIONS, CONVERSIONS, etc. have been filtered out
// See: https://developers.facebook.com/docs/graph-api/changelog/version21.0`;
  } else if (name === 'AdCreativeCallToActionType') {
    deprecationNotice = `
// Note: Legacy/internal CTA types like SOTTO_SUBSCRIBE, WOODHENGE_SUPPORT have been filtered out
// These appear to be deprecated internal Meta CTA types with no current equivalent`;
  } else if (name === 'CampaignSpecialAdCategories') {
    deprecationNotice = `
// Note: CREDIT category has been filtered out as it's deprecated in favor of FINANCIAL_PRODUCTS_SERVICES
// See: Meta policy updates 2024/2025 - use FINANCIAL_PRODUCTS_SERVICES for financial products`;
  } else if (name === 'AdSetBillingEvent') {
    deprecationNotice = `
// Note: Deprecated billing events like CLICKS, PAGE_LIKES, and OFFER_CLAIMS have been filtered out
// Use LINK_CLICKS instead of CLICKS`;
  } else if (name === 'AdSetOptimizationGoal') {
    deprecationNotice = `
// Note: Deprecated optimization goals like OFFSITE_CONVERSIONS, PAGE_LIKES, and NONE have been filtered out
// Please use current, outcome-based optimization goals`;
  }

  return `${deprecationNotice}
// ${name} enum from Meta SDK
export const ${name}Schema = z.enum([${enumValues}]);
export type ${name} = z.infer<typeof ${name}Schema>;
`;
}

// Generate all enum schemas
let generatedEnumsContent = '';

// Generate from SDK constants
for (const { name, constant, filterDeprecated } of constantsToGenerate) {
  generatedEnumsContent += generateEnumSchemaAndType(name, constant, { filterDeprecated });
}

// Generate from manual constants
for (const { name, values } of manualConstants) {
  generatedEnumsContent += generateEnumSchemaAndType(name, values);
}

// Generate InsightMetric enum from curated list
generatedEnumsContent += generateInsightMetricEnum();

// Check if AdsInsights.Fields is available for conditional generation
const hasAdsInsightsFields = AdsInsights?.Fields && Object.keys(AdsInsights.Fields).length > 0;

// Check if Business and BusinessUser fields are available
const hasBusinessFields = Business?.Fields && Object.keys(Business.Fields).length > 0;
const hasBusinessUserFields = BusinessUser?.Fields && Object.keys(BusinessUser.Fields).length > 0;

// Generate the TypeScript file content
const fileContent = `// Auto-generated by scripts/generateSchemas.ts - DO NOT EDIT MANUALLY
// Generated from Meta SDK field definitions at ${new Date().toISOString()}

import { z } from 'zod';

${generatedEnumsContent}

// Flexible field type for Meta API responses
const MetaFlexibleField = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({}).passthrough(),
  z.array(z.unknown()),
  z.null()
]).optional();

// Reusable Paging Schema
const PagingSchema = z.object({
  cursors: z.object({
    before: z.string().optional(),
    after: z.string().optional()
  }).optional(),
  next: z.string().optional(),
  previous: z.string().optional()
}).optional();

// Campaign fields: ${Object.keys(Campaign.Fields).length} total
export const MetaCampaignResponseSchema = z.object({
${Object.values(Campaign.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// AdSet fields: ${Object.keys(AdSet.Fields).length} total  
export const MetaAdSetResponseSchema = z.object({
${Object.values(AdSet.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// AdAccount fields: ${Object.keys(AdAccount.Fields).length} total
export const MetaAdAccountResponseSchema = z.object({
${Object.values(AdAccount.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// AdCreative fields: ${Object.keys(AdCreative.Fields).length} total
export const MetaAdCreativeResponseSchema = z.object({
${Object.values(AdCreative.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// Ad fields: ${Object.keys(Ad.Fields).length} total
export const MetaAdResponseSchema = z.object({
${Object.values(Ad.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// CustomAudience fields: ${Object.keys(CustomAudience.Fields).length} total
export const MetaCustomAudienceResponseSchema = z.object({
${Object.values(CustomAudience.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// Page fields: ${Object.keys(Page.Fields).length} total
export const MetaPageResponseSchema = z.object({
${Object.values(Page.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// PagePost fields: ${Object.keys(PagePost.Fields).length} total
export const MetaPagePostResponseSchema = z.object({
${Object.values(PagePost.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();

// Ads Archive API response schema - manually defined fields
// Source: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
export const MetaAdsArchiveResponseSchema = z.object({
${AdsArchiveFields.map((field) => `  ${field}: MetaFlexibleField,`).join('\n')}
}).passthrough();

// Targeting Search API response schema - manually defined fields  
// Source: https://developers.facebook.com/docs/marketing-api/targeting-search/
export const MetaTargetingSearchResponseSchema = z.object({
${TargetingSearchFields.map((field) => `  ${field}: MetaFlexibleField,`).join('\n')}
}).passthrough();

${
  hasBusinessFields
    ? `
// Business fields: ${Object.keys(Business.Fields).length} total
export const MetaBusinessResponseSchema = z.object({
${Object.values(Business.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();
`
    : '// Business schema skipped - SDK fields not available'
}

${
  hasBusinessUserFields
    ? `
// BusinessUser fields: ${Object.keys(BusinessUser.Fields).length} total
export const MetaBusinessUserResponseSchema = z.object({
${Object.values(BusinessUser.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();
`
    : '// BusinessUser schema skipped - SDK fields not available'
}

${
  hasAdsInsightsFields
    ? `
// AdsInsights fields: ${Object.keys(AdsInsights.Fields).length} total
export const MetaAdsInsightsResponseSchema = z.object({
${Object.values(AdsInsights.Fields)
  .map((field) => `  ${field}: MetaFlexibleField,`)
  .join('\n')}
}).passthrough();
`
    : '// AdsInsights schema skipped - SDK fields not available'
}

// List response schemas
export const CampaignListResponseSchema = z.object({
  campaigns: z.array(MetaCampaignResponseSchema),
  paging: PagingSchema
});

export const AdSetListResponseSchema = z.object({
  adSets: z.array(MetaAdSetResponseSchema),
  paging: PagingSchema
});

export const AdAccountListResponseSchema = z.object({
  accounts: z.array(MetaAdAccountResponseSchema),
  paging: PagingSchema
});

export const AdCreativeListResponseSchema = z.object({
  adCreatives: z.array(MetaAdCreativeResponseSchema),
  paging: PagingSchema
});

export const AdListResponseSchema = z.object({
  ads: z.array(MetaAdResponseSchema),
  paging: PagingSchema
});

export const CustomAudienceListResponseSchema = z.object({
  customAudiences: z.array(MetaCustomAudienceResponseSchema),
  paging: PagingSchema
});

export const PageListResponseSchema = z.object({
  pages: z.array(MetaPageResponseSchema),
  paging: PagingSchema
});

export const PagePostListResponseSchema = z.object({
  posts: z.array(MetaPagePostResponseSchema),
  paging: PagingSchema
});

export const AdsArchiveListResponseSchema = z.object({
  data: z.array(MetaAdsArchiveResponseSchema),
  paging: PagingSchema
});

export const TargetingSearchListResponseSchema = z.object({
  data: z.array(MetaTargetingSearchResponseSchema),
  paging: PagingSchema
});

${
  hasBusinessFields
    ? `
export const BusinessListResponseSchema = z.object({
  businesses: z.array(MetaBusinessResponseSchema),
  paging: PagingSchema
});
`
    : ''
}

${
  hasBusinessUserFields
    ? `
export const BusinessUserListResponseSchema = z.object({
  users: z.array(MetaBusinessUserResponseSchema),
  paging: PagingSchema
});
`
    : ''
}

${
  hasAdsInsightsFields
    ? `
export const AdsInsightsListResponseSchema = z.object({
  insights: z.array(MetaAdsInsightsResponseSchema),
  paging: PagingSchema
});
`
    : ''
}

// Meta API operation response schemas
export const MetaCreateSuccessResponseSchema = z.object({
  id: z.string(),
}).passthrough();

export const MetaUpdateSuccessResponseSchema = z.object({
  success: z.boolean(),
}).passthrough();

export const MetaDeleteSuccessResponseSchema = z.object({
  success: z.boolean(),
}).passthrough();
`;

// Write the generated schemas to the output file
fs.writeFileSync(outputPath, fileContent, 'utf8');

const totalFields =
  Object.keys(Campaign.Fields).length +
  Object.keys(AdSet.Fields).length +
  Object.keys(AdAccount.Fields).length +
  Object.keys(AdCreative.Fields).length +
  Object.keys(Ad.Fields).length +
  Object.keys(CustomAudience.Fields).length +
  Object.keys(Page.Fields).length +
  Object.keys(PagePost.Fields).length +
  (hasBusinessFields ? Object.keys(Business.Fields).length : 0) +
  (hasBusinessUserFields ? Object.keys(BusinessUser.Fields).length : 0);

console.info(`Generated schemas written to ${outputPath}`);
console.info(
  `Generated ${constantsToGenerate.length + manualConstants.length} enum types and schemas`
);
console.info(
  `Generated ${totalFields}${hasAdsInsightsFields ? ` + ${Object.keys(AdsInsights.Fields).length}` : ''} response schema fields`
);
