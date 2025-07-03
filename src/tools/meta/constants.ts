/**
 * Meta Marketing API Constants
 *
 * Centralized location for Meta API-specific constants and identifiers
 * to improve maintainability and reduce hardcoded values throughout the codebase.
 */

import type { AdSetBidStrategy, CampaignBidStrategy } from '../../generated/schemas.js';

/**
 * Meta API location keys for geographic targeting
 * These keys are used in the targeting.geoLocations.regions field
 */
export const META_LOCATION_KEYS = {
  /** California state region key */
  CALIFORNIA: '3847',
} as const;

/**
 * Special Ad Category compliance requirements
 */
export const SAC_COMPLIANCE = {
  /**
   * Optimization goals that require SAC-CFCA compliance when targeting California
   * As of Meta Marketing API v22.0 (2025), these are the supported optimization goals for SAC campaigns
   * Source: Meta API v22+ research and official documentation
   */
  CCPA_REQUIRED_OPTIMIZATION_GOALS: ['VALUE', 'LEAD_GENERATION', 'CONVERSIONS'] as const,
} as const;

/**
 * Ad Set Compatibility Rules
 * Defines valid combinations for ad set parameters to prevent API errors.
 * Source: Meta Marketing API v22.0 Documentation (2025)
 */
export const ADSET_COMPATIBILITY = {
  /**
   * Maps billing_event values to their compatible optimization_goal values.
   * Based on Meta Marketing API v22+ compatibility matrix research.
   * Updated for 2025 to reflect current Meta API requirements.
   */
  BILLING_OPTIMIZATION_MAP: {
    /** IMPRESSIONS billing supports awareness goals AND is the only valid billing for APP_INSTALLS optimization */
    IMPRESSIONS: ['IMPRESSIONS', 'REACH', 'APP_INSTALLS'],
    /** LINK_CLICKS billing event only supports LINK_CLICKS optimization per Meta API v22+ strict matching */
    LINK_CLICKS: ['LINK_CLICKS'],
    /** LANDING_PAGE_VIEWS billing event only supports LANDING_PAGE_VIEWS optimization per Meta API v22+ strict matching */
    LANDING_PAGE_VIEWS: ['LANDING_PAGE_VIEWS'],
    /** THRUPLAY billing event only supports THRUPLAY optimization */
    THRUPLAY: ['THRUPLAY'],
    /** PAGE_LIKES billing event only supports PAGE_LIKES optimization (may be deprecated) */
    PAGE_LIKES: ['PAGE_LIKES'],
    /** POST_ENGAGEMENT billing event only supports POST_ENGAGEMENT optimization */
    POST_ENGAGEMENT: ['POST_ENGAGEMENT'],
    // Note: NONE, OFFER_CLAIMS, and LISTING_INTERACTION billing events
    // are not restricted here as they have broader compatibility
  } as const,

  /**
   * Maps campaign-level bid strategies to compatible ad set-level bid strategies.
   * This is critical for Campaign Budget Optimization (CBO) campaigns where the
   * campaign's strategy can dictate the allowed strategies for its ad sets.
   * If a campaign strategy is not in this map, it is considered permissive.
   * Based on Meta Marketing API v22+ CBO requirements research (2025).
   */
  CAMPAIGN_ADSET_BID_STRATEGY_MAP: {
    /** COST_CAP campaigns require ad sets to also use COST_CAP */
    COST_CAP: ['COST_CAP'],
    /** LOWEST_COST_WITH_BID_CAP campaigns require ad sets to use the same strategy */
    LOWEST_COST_WITH_BID_CAP: ['LOWEST_COST_WITH_BID_CAP'],
    // Note: LOWEST_COST_WITHOUT_CAP and other unlisted campaign strategies are
    // intentionally omitted. If a campaign's bid strategy is not a key in this map,
    // it is considered permissive and allows any ad set bid strategy.
  } as const satisfies Partial<Record<CampaignBidStrategy, readonly AdSetBidStrategy[]>>,
} as const;
