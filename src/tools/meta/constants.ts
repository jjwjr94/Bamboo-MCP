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
  /** Optimization goals that require SAC-CFCA compliance when targeting California */
  CCPA_REQUIRED_OPTIMIZATION_GOALS: ['OFFSITE_CONVERSIONS'] as const,
} as const;
