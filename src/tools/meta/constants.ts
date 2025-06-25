/**
 * Meta Marketing API Constants
 *
 * Centralized location for Meta API-specific constants and identifiers
 * to improve maintainability and reduce hardcoded values throughout the codebase.
 */

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
   * Only enforces validation for billing events with known restrictions.
   */
  BILLING_OPTIMIZATION_MAP: {
    /** APP_INSTALLS billing event only supports APP_INSTALLS optimization */
    APP_INSTALLS: ['APP_INSTALLS'],
    /** IMPRESSIONS billing event supports awareness and reach goals */
    IMPRESSIONS: ['IMPRESSIONS', 'REACH'],
    /** LINK_CLICKS billing event supports traffic-focused goals */
    LINK_CLICKS: ['LINK_CLICKS', 'LANDING_PAGE_VIEWS'],
    /** THRUPLAY billing event only supports video view optimization */
    THRUPLAY: ['THRUPLAY'],
    /** PURCHASE billing event supports conversion-focused goals */
    PURCHASE: ['CONVERSIONS', 'VALUE', 'LEAD_GENERATION'],
    // Note: NONE, POST_ENGAGEMENT, and LISTING_INTERACTION billing events
    // are not restricted here as they have broader compatibility
  } as const,
} as const;
