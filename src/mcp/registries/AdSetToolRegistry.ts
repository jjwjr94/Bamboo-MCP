import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdSetBidStrategySchema,
  AdSetBillingEventSchema,
  AdSetOptimizationGoalSchema,
  AdSetStatusSchema,
  MetaAdSetResponseSchema,
} from '../../generated/schemas.js';
import { ADSET_COMPATIBILITY } from '../../tools/meta/constants.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// Bid strategies that require bid_amount - Meta API v22+ requirements
const BID_STRATEGIES_REQUIRING_BID_AMOUNT = new Set(['LOWEST_COST_WITH_BID_CAP', 'COST_CAP']);

/**
 * Validates billing event and optimization goal compatibility
 * @param billingEvent The billing event from the input
 * @param optimizationGoal The optimization goal from the input
 * @param ctx The Zod refinement context
 */
function validateBillingOptimizationCompatibility(
  billingEvent: string,
  optimizationGoal: string,
  ctx: z.RefinementCtx
): void {
  if (!(billingEvent in ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP)) {
    return; // No validation rules for this billing event
  }

  const compatibleGoals =
    ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP[
      billingEvent as keyof typeof ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP
    ];

  if (compatibleGoals.includes(optimizationGoal as never)) {
    return; // Compatible combination
  }

  // Find which billing events would be compatible with the chosen optimization goal
  const compatibleBillingEvents: string[] = [];
  for (const [billing, goals] of Object.entries(ADSET_COMPATIBILITY.BILLING_OPTIMIZATION_MAP)) {
    if (goals.includes(optimizationGoal as never)) {
      compatibleBillingEvents.push(billing);
    }
  }

  const billingEventSuggestion =
    compatibleBillingEvents.length > 0
      ? ` To use '${optimizationGoal}' optimization, use one of these billing events: '${compatibleBillingEvents.join("', '")}'.`
      : '';

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `Optimization goal '${optimizationGoal}' is not compatible with billing event '${billingEvent}'. Valid optimization goals for '${billingEvent}' billing are: '${compatibleGoals.join("', '")}'.${billingEventSuggestion}`,
    path: ['optimizationGoal'],
  });
}

// Targeting schema definition - the single source of truth for targeting structure
export const MetaTargetingSchema = z.object({
  geoLocations: z.object({
    countries: z
      .array(
        z
          .string()
          .toUpperCase()
          .regex(
            /^[A-Z]{2}$/,
            "Must be a 2-letter uppercase ISO 3166-1 alpha-2 country code (e.g., 'US', 'CA', 'GB')"
          )
      )
      .optional()
      .describe(
        "A list of 2-letter ISO 3166-1 alpha-2 country codes to target. Example: ['US', 'CA']. At least one of countries, regions, or cities must be specified."
      ),
    regions: z
      .array(z.object({ key: z.string() }))
      .optional()
      .describe(
        "A list of region keys to target. Use the 'search_locations' tool to find valid region keys. Example: [{ 'key': '3847' }] for California state."
      ),
    cities: z
      .array(z.object({ key: z.string() }))
      .optional()
      .describe(
        "A list of city keys to target. Use the 'search_locations' tool to find valid city keys. Example: [{ 'key': '2425330' }] for New York City."
      ),
  }),
  ageMin: z
    .number()
    .int()
    .min(13)
    .max(65)
    .optional()
    .describe(
      'Minimum age for targeting (13-65). Must be <= ageMax. **CRITICAL NOTE:** For Special Ad Category campaigns (e.g., Housing, Employment, Financial Services), this field is ignored by Meta to comply with non-discrimination regulations. The age will default to 18-65+ in the targeted country.'
    ),
  ageMax: z
    .number()
    .int()
    .min(13)
    .max(65)
    .optional()
    .describe(
      'Maximum age for targeting (13-65). Must be >= ageMin. **CRITICAL NOTE:** For Special Ad Category campaigns (e.g., Housing, Employment, Financial Services), this field is ignored by Meta to comply with non-discrimination regulations. The age will default to 18-65+ in the targeted country.'
    ),
  genders: z
    .array(z.union([z.literal(1), z.literal(2)]))
    .optional()
    .describe(
      'Gender targeting. Use `[1]` for male, `[2]` for female. Omit to target all genders. Note: For Special Ad Category campaigns (e.g., Housing, Employment), this field is often ignored by Meta to comply with non-discrimination regulations.'
    ),
  interests: z
    .array(z.object({ id: z.string(), name: z.string().optional() }))
    .optional()
    .describe(
      "Interest-based targeting. Use the 'search_interests' tool to find valid interest IDs. Example: [{ 'id': '6003139266461', 'name': 'Coffee' }]."
    ),
  behaviors: z
    .array(z.object({ id: z.string(), name: z.string().optional() }))
    .optional()
    .describe(
      "Behavior-based targeting. Use the 'search_behaviors' tool to find valid behavior IDs. Example: [{ 'id': '6002714895372', 'name': 'Frequent travelers' }]."
    ),
  customAudiences: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe(
      "Custom audiences to include in targeting. Use the 'get_custom_audiences' tool to list available audiences. Example: [{ 'id': '123456789' }]."
    ),
  excludedCustomAudiences: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe(
      "Custom audiences to exclude from targeting. Use the 'get_custom_audiences' tool to list available audiences."
    ),
  flexibleSpec: z
    .array(
      z.object({
        interests: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
        behaviors: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
      })
    )
    .optional()
    .describe(
      'Advanced targeting using flexible specifications. Each object in the array represents an OR relationship, while interests/behaviors within each object have an AND relationship.'
    ),
  devicePlatforms: z
    .array(z.enum(['mobile', 'desktop']))
    .optional()
    .describe(
      "Device platforms to target. Example: ['mobile'] for mobile-only, ['mobile', 'desktop'] for all devices."
    ),
  publisherPlatforms: z
    .array(z.enum(['facebook', 'instagram', 'messenger', 'audience_network']))
    .optional()
    .describe(
      "Meta platforms where ads will show. Example: ['facebook', 'instagram'] for Facebook and Instagram only."
    ),
});

// Modern attribution spec schema for v22
export const MetaAttributionSpecSchema = z
  .array(
    z.object({
      event_type: z
        .enum(['CLICK_THROUGH', 'VIEW_THROUGH'])
        .describe(
          "The type of user interaction to attribute conversions to. 'CLICK_THROUGH' is most common and recommended for iOS 14.5+ campaigns. 'VIEW_THROUGH' tracks users who saw your ad but didn't click."
        ),
      window_days: z
        .union([z.literal(1), z.literal(7)])
        .describe(
          'The number of days after the event_type to attribute a conversion. Due to iOS 14.5+ privacy changes, Meta only supports 1-day and 7-day windows for attribution. Use 7 days for comprehensive attribution, 1 day for stricter privacy compliance.'
        ),
    })
  )
  .optional()
  .describe(
    "Defines the attribution window for conversion tracking, crucial for iOS 14.5+ campaigns. This spec is required for campaigns optimizing for conversions, value, or app events. Post-iOS 14.5 attribution capabilities are limited by Apple's privacy framework. Example: [{ 'event_type': 'CLICK_THROUGH', 'window_days': 7 }]. Minimum 3-day campaign duration required for value optimization with iOS 14.5+ constraints."
  );

// CreateAdSet schema - single source of truth for ad set creation
export const CreateAdSetSchema = z
  .object({
    adAccountId: z
      .string()
      .optional()
      .describe(
        "The ID of the ad account (e.g., 'act_12345'). Optional to support intelligent account selection."
      ),
    campaignId: z.string().describe('The ID of the campaign to create the ad set in.'),
    name: z.string().describe('The name of the ad set.'),
    budget: z
      .object({
        daily: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Daily budget in cents (e.g., 1000 = $10.00)'),
        lifetime: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Lifetime budget in cents (e.g., 10000 = $100.00)'),
      })
      .refine(
        ({ daily, lifetime }) => !!daily !== !!lifetime, // true = only-one-defined
        {
          message: 'If providing a budget, specify **either** daily **or** lifetime, but not both.',
          path: ['daily'],
        }
      )
      .optional()
      .describe(
        'Ad set budget in cents. REQUIRED for Ad Set Budget Optimization (ABO) campaigns. OPTIONAL for Campaign Budget Optimization (CBO) campaigns. Server-side validation enforces this. **Note:** Meta enforces minimum daily/lifetime budgets which vary by market and currency (e.g., ~$1 USD/day minimum for impressions). Budgets that are too low to achieve at least one conversion per day may also be rejected by the API for conversion-optimized ad sets. Examples: { "daily": 5000 } for $50/day ABO, { "lifetime": 50000 } for $500 lifetime ABO.'
      ),
    targeting: MetaTargetingSchema.refine(
      (data) =>
        data &&
        (data.geoLocations?.countries?.length ||
          data.geoLocations?.regions?.length ||
          data.geoLocations?.cities?.length),
      {
        message:
          'Geographic targeting (geoLocations) is required and must specify at least one of countries, regions, or cities.',
        path: ['geoLocations'],
      }
    ).describe(
      "Targeting criteria for the ad set. Geographic targeting (geoLocations) is REQUIRED. **2025 Best Practice:** For many objectives (e.g., Sales/Conversions), Meta's AI performs best with broad targeting (e.g., only location and age). Use interests/behaviors for niche products or specific strategies. Combining multiple criteria narrows your audience. Example: Target US users aged 25-45 interested in coffee and exclude existing customers."
    ),
    billingEvent: AdSetBillingEventSchema.describe(
      "What you pay for when your ad is served. This choice strictly limits the available 'optimizationGoal' values. **Our server enforces these compatibility rules based on Meta API v22+ requirements to prevent API errors.** For example: 'IMPRESSIONS' billing is only compatible with 'IMPRESSIONS' and 'REACH' optimization goals, while 'LINK_CLICKS' billing is compatible with 'LINK_CLICKS' and 'LANDING_PAGE_VIEWS' optimization goals."
    ),
    optimizationGoal: AdSetOptimizationGoalSchema.describe(
      "How Meta optimizes ad delivery to find the best users for your campaign objective. This choice MUST be compatible with the selected 'billingEvent'. **Our server validates this compatibility to prevent API errors.** For example: 'LANDING_PAGE_VIEWS' optimization goal is only compatible with 'LINK_CLICKS' billing event. 'IMPRESSIONS' optimization is only compatible with 'IMPRESSIONS' billing event. Special requirements: APP_INSTALLS requires promotedObject.application_id, LEAD_GENERATION requires promotedObject.page_id, VALUE/CONVERSIONS work best with conversion tracking and attribution specs. iOS 14.5+ campaigns may need minimum 3-day duration for value optimization."
    ),
    bidStrategy: AdSetBidStrategySchema.default('LOWEST_COST_WITHOUT_CAP').describe(
      'Controls how Meta bids in the ad auction. Defaults to LOWEST_COST_WITHOUT_CAP. LOWEST_COST_WITHOUT_CAP is automatic bidding. LOWEST_COST_WITH_BID_CAP uses automatic bidding with a max bid limit (requires bidAmount). COST_CAP targets an average cost per result (requires bidAmount). TARGET_COST was fully deprecated in v9.0 and is no longer a valid option. Choose based on your budget control needs.'
    ),
    bidAmount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum bid amount in cents. REQUIRED when bidStrategy is LOWEST_COST_WITH_BID_CAP or COST_CAP - server-side validation enforces this Meta API v22+ requirement. Not used with LOWEST_COST_WITHOUT_CAP. Examples: 200 for $2.00 maximum bid, 500 for $5.00 cost cap. Set based on your acceptable cost per result.'
      ),
    startTime: z.string().optional().describe('Start time in ISO format.'),
    endTime: z.string().optional().describe('End time in ISO format.'),
    status: AdSetStatusSchema.default('PAUSED').describe('The ad set status.'),
    attributionSpec: MetaAttributionSpecSchema,
    promotedObject: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        'Specifies what you are promoting. This is REQUIRED for certain optimization goals, and the structure varies. Examples: For `APP_INSTALLS`, provide `{"application_id": "1234567890"}`. For `LEAD_GENERATION`, provide `{"page_id": "1234567890"}`. For e-commerce with a catalog, provide `{"product_set_id": "1234567890"}`. Use other tools like `get_pages` to find valid IDs.'
      ),
    isSacCfcaTermsCertified: z
      .boolean()
      .optional()
      .describe(
        "Certifies CCPA compliance. REQUIRED and must be `true` for Special Ad Category (SAC) campaigns that target California AND use a conversion-focused goal (VALUE, LEAD_GENERATION, CONVERSIONS). This is a Meta API v22+ legal requirement; API calls will fail if this is omitted for applicable campaigns. Check parent campaign's category and targeting to determine if this is needed."
      ),
    isEligibleForSacCampaigns: z
      .boolean()
      .optional()
      .describe(
        "Confirms advertiser eligibility for SAC. REQUIRED and must be `true` for ALL ad sets in a Special Ad Category campaign (e.g., Housing, Employment, Financial Services). This is part of Meta's enhanced compliance framework (API v22+, Jan 2025). Server-side validation checks the parent campaign's special ad category and will reject the call if this is not provided correctly."
      ),
  })
  .superRefine((data, ctx) => {
    // 1. Conditional bid amount validation based on bid strategy
    if (
      data.bidStrategy &&
      BID_STRATEGIES_REQUIRING_BID_AMOUNT.has(data.bidStrategy) &&
      data.bidAmount === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The 'bidAmount' is required when the 'bidStrategy' is '${data.bidStrategy}'. Provide a bid amount in cents (e.g., 100 for $1.00).`,
        path: ['bidAmount'],
      });
    }

    // 2. Promoted object requirements based on optimization goal (business logic)
    if (data.optimizationGoal === 'APP_INSTALLS' && !data.promotedObject?.application_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "For the 'APP_INSTALLS' optimization goal, 'promotedObject' must include 'application_id'.",
        path: ['promotedObject'],
      });
    }
    if (data.optimizationGoal === 'LEAD_GENERATION' && !data.promotedObject?.page_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "For the 'LEAD_GENERATION' optimization goal, 'promotedObject' must include 'page_id'.",
        path: ['promotedObject'],
      });
    }

    // 3. Billing event compatibility matrix validation (business logic)
    const billingEvent = data.billingEvent;
    validateBillingOptimizationCompatibility(billingEvent, data.optimizationGoal, ctx);
  });

// UpdateAdSet schema - single source of truth for ad set updates
export const UpdateAdSetSchema = z
  .object({
    adSetId: z.string().describe('The ID of the ad set to update.'),
    name: z.string().optional().describe('New name for the ad set.'),
    status: AdSetStatusSchema.optional().describe(
      'New status for the ad set (ACTIVE, PAUSED, ARCHIVED, DELETED).'
    ),
    budget: z
      .object({
        daily: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('New daily budget in cents (e.g., 1000 = $10.00)'),
        lifetime: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('New lifetime budget in cents (e.g., 10000 = $100.00)'),
      })
      .optional()
      .refine((budget) => !budget || !(budget.daily && budget.lifetime), {
        message: 'Provide **either** daily **or** lifetime budget for an update, but not both.',
        path: ['daily'],
      })
      .describe(
        'Updates the budget for the ad set. Can only be used for ad sets in Ad Set Budget Optimization (ABO) campaigns. **Server-side validation will reject attempts to update the budget for an ad set in a Campaign Budget Optimization (CBO) campaign.** If provided, specify either daily or lifetime, not both. Changes take effect immediately.'
      ),
    bidStrategy: AdSetBidStrategySchema.optional().describe(
      'New bid strategy for the ad set. If changing to LOWEST_COST_WITH_BID_CAP or COST_CAP, you must also provide bidAmount. Changes may affect delivery temporarily while Meta adjusts to new bidding approach.'
    ),
    bidAmount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'New maximum bid amount in cents. REQUIRED when updating bidStrategy to LOWEST_COST_WITH_BID_CAP or COST_CAP - server-side validation enforces this Meta API requirement. Example: 300 for $3.00 maximum bid.'
      ),
    targeting: MetaTargetingSchema.optional().describe(
      'CRITICAL WARNING: This completely replaces ALL existing targeting, it does not merge. To add or remove a single criterion, you must first use `get_adsets` to fetch the current targeting, modify the targeting object in your code, and then pass the complete, updated object back to this tool. Failing to do so will wipe out all previous targeting settings.'
    ),
    startTime: z
      .string()
      .optional()
      .describe(
        'New start time in ISO format (YYYY-MM-DDTHH:MM:SS). Cannot be changed if the ad set is already running.'
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        'New end time in ISO format (YYYY-MM-DDTHH:MM:SS). Can be updated while the ad set is running.'
      ),
  })
  .superRefine((data, ctx) => {
    // Conditional bid amount validation for updates
    if (
      data.bidStrategy &&
      BID_STRATEGIES_REQUIRING_BID_AMOUNT.has(data.bidStrategy) &&
      data.bidAmount === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The 'bidAmount' is required when updating to the '${data.bidStrategy}' bid strategy. Provide a bid amount in cents (e.g., 100 for $1.00).`,
        path: ['bidAmount'],
      });
    }
  });

// GetAdSets schema - single source of truth for ad set retrieval
export const GetAdSetsInputSchema = z.object({
  campaignId: z.string().optional().describe('The ID of the campaign to get ad sets from.'),
  adAccountId: z
    .string()
    .optional()
    .describe(
      "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
    ),
});

// DeleteAdSet schema - single source of truth for ad set deletion
export const DeleteAdSetInputSchema = z.object({
  adSetId: z.string().describe('The ID of the ad set to delete.'),
  confirmPermanentDelete: DeletionConfirmationSchema.describe(
    'Must be set to true to confirm permanent deletion.'
  ),
});

// Export inferred types - single source of truth for TypeScript types
export type MetaTargeting = z.infer<typeof MetaTargetingSchema>;
export type MetaAttributionSpec = z.infer<typeof MetaAttributionSpecSchema>;
export type CreateAdSetRequest = z.infer<typeof CreateAdSetSchema>;
export type UpdateAdSetRequest = z.infer<typeof UpdateAdSetSchema>;
export type GetAdSetsRequest = z.infer<typeof GetAdSetsInputSchema>;
export type DeleteAdSetRequest = z.infer<typeof DeleteAdSetInputSchema>;

/**
 * Ad Set Tool Registry
 *
 * Handles registration of ad set-related MCP tools:
 * - get_adsets: Retrieve ad sets for a campaign or ad account
 * - create_adset: Create a new advertising ad set
 * - update_adset: Update an existing ad set
 * - delete_adset: Delete an ad set
 */
export class AdSetToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAdSets.bind(this),
      this.registerCreateAdSet.bind(this),
      this.registerUpdateAdSet.bind(this),
      this.registerDeleteAdSet.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Ad Set';
  }

  /**
   * Register all ad set-related MCP tools and return their names.
   */
  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  /**
   * Register the get_adsets tool
   */
  private registerGetAdSets(): string {
    const successDataSchema = z.object({
      adSets: z.array(MetaAdSetResponseSchema).describe('A list of ad sets.'),
    });

    return createMcpTool(
      this.server,
      'get_adsets',
      {
        title: 'Get Ad Sets',
        description: 'Retrieves ad sets for a campaign or ad account.',
        inputSchema: GetAdSetsInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdSets(authPayload, params),
      'Successfully retrieved ad sets.'
    );
  }

  /**
   * Register the create_adset tool
   */
  private registerCreateAdSet(): string {
    const successDataSchema = z.object({
      adSetId: z.string(),
      name: z.string(),
      campaignId: z.string(),
      status: z.string(),
    });

    return createMcpTool(
      this.server,
      'create_adset',
      {
        title: 'Create Ad Set',
        description: 'Creates a new ad set within a campaign.',
        inputSchema: CreateAdSetSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAdSet(authPayload, params),
      'Successfully created ad set.'
    );
  }

  /**
   * Register the update_adset tool
   */
  private registerUpdateAdSet(): string {
    const successDataSchema = z.object({
      adSetId: z.string(),
      updatedFields: z.array(z.string()),
    });

    return createMcpTool(
      this.server,
      'update_adset',
      {
        title: 'Update Ad Set',
        description: 'Updates an existing ad set.',
        inputSchema: UpdateAdSetSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAdSet(authPayload, params),
      'Successfully updated ad set.'
    );
  }

  /**
   * Register the delete_adset tool
   */
  private registerDeleteAdSet(): string {
    const successDataSchema = z.object({
      adSetId: z.string(),
    });

    return createMcpTool(
      this.server,
      'delete_adset',
      {
        title: 'Delete Ad Set',
        description:
          'Permanently deletes an ad set. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: DeleteAdSetInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAdSet(authPayload, params),
      'Successfully deleted ad set.'
    );
  }
}
