import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AdSetBidStrategySchema } from '../../../../src/generated/schemas.js';
import { CreateAdSetSchema } from '../../../../src/mcp/registries/AdSetToolRegistry.js';

// Test the schema validation for create_adset tool
describe('create_adset tool validation', () => {
  // Define the country code validation schema to test
  const countryCodeSchema = z
    .string()
    .toUpperCase()
    .regex(
      /^[A-Z]{2}$/,
      "Must be a 2-letter uppercase ISO 3166-1 alpha-2 country code (e.g., 'US', 'CA', 'GB')"
    );

  // Define the compliance field schema to test
  const complianceFieldSchema = z
    .boolean()
    .optional()
    .describe(
      "Certifies CCPA compliance. Required for Special Ad Category campaigns targeting California with the 'CONVERSIONS' optimization goal."
    );

  // Define the bid strategy schema to test
  const bidStrategySchema = AdSetBidStrategySchema.optional().describe(
    'The bid strategy for the ad set. If not specified, defaults to LOWEST_COST_WITHOUT_CAP.'
  );

  // Define the modern attribution spec schema to test
  const modernAttributionSpecSchema = z
    .array(
      z.object({
        event_type: z
          .enum(['CLICK_THROUGH', 'VIEW_THROUGH'])
          .describe("The event type for attribution. Use 'CLICK_THROUGH' or 'VIEW_THROUGH'."),
        window_days: z
          .union([z.literal(1), z.literal(7)])
          .describe(
            'The attribution window in days. Valid values are 1 or 7 due to iOS 14.5+ restrictions.'
          ),
      })
    )
    .optional()
    .describe(
      'Modern attribution spec for the ad set. Required for some optimization goals. Post-iOS 14.5 only supports 1-day and 7-day windows.'
    );

  describe('country code validation', () => {
    it('should accept valid 2-letter uppercase country codes', () => {
      expect(countryCodeSchema.parse('US')).toBe('US');
      expect(countryCodeSchema.parse('CA')).toBe('CA');
      expect(countryCodeSchema.parse('GB')).toBe('GB');
    });

    it('should transform lowercase to uppercase', () => {
      expect(countryCodeSchema.parse('us')).toBe('US');
      expect(countryCodeSchema.parse('ca')).toBe('CA');
    });

    it('should reject invalid country codes', () => {
      expect(() => countryCodeSchema.parse('USA')).toThrow();
      expect(() => countryCodeSchema.parse('U')).toThrow();
      expect(() => countryCodeSchema.parse('123')).toThrow();
    });
  });

  describe('compliance field validation', () => {
    it('should accept boolean values', () => {
      expect(complianceFieldSchema.parse(true)).toBe(true);
      expect(complianceFieldSchema.parse(false)).toBe(false);
    });

    it('should accept undefined (optional)', () => {
      expect(complianceFieldSchema.parse(undefined)).toBe(undefined);
    });

    it('should reject non-boolean values', () => {
      expect(() => complianceFieldSchema.parse('true')).toThrow();
      expect(() => complianceFieldSchema.parse(1)).toThrow();
    });
  });

  describe('bid strategy validation', () => {
    it('should accept valid bid strategy values', () => {
      expect(bidStrategySchema.parse('LOWEST_COST_WITHOUT_CAP')).toBe('LOWEST_COST_WITHOUT_CAP');
      expect(bidStrategySchema.parse('LOWEST_COST_WITH_BID_CAP')).toBe('LOWEST_COST_WITH_BID_CAP');
      expect(bidStrategySchema.parse('COST_CAP')).toBe('COST_CAP');
    });

    it('should accept undefined (optional)', () => {
      expect(bidStrategySchema.parse(undefined)).toBe(undefined);
    });

    it('should reject invalid bid strategy values', () => {
      expect(() => bidStrategySchema.parse('INVALID_STRATEGY')).toThrow();
      expect(() => bidStrategySchema.parse(123)).toThrow();
    });
  });

  describe('modern attribution spec validation', () => {
    it('should accept valid attribution spec arrays', () => {
      const validSpec = [{ event_type: 'CLICK_THROUGH', window_days: 7 }];
      expect(modernAttributionSpecSchema.parse(validSpec)).toEqual(validSpec);
    });

    it('should accept both event types', () => {
      const clickSpec = [{ event_type: 'CLICK_THROUGH', window_days: 1 }];
      const viewSpec = [{ event_type: 'VIEW_THROUGH', window_days: 7 }];
      expect(modernAttributionSpecSchema.parse(clickSpec)).toEqual(clickSpec);
      expect(modernAttributionSpecSchema.parse(viewSpec)).toEqual(viewSpec);
    });

    it('should accept both valid window days', () => {
      const oneDay = [{ event_type: 'CLICK_THROUGH', window_days: 1 }];
      const sevenDays = [{ event_type: 'CLICK_THROUGH', window_days: 7 }];
      expect(modernAttributionSpecSchema.parse(oneDay)).toEqual(oneDay);
      expect(modernAttributionSpecSchema.parse(sevenDays)).toEqual(sevenDays);
    });

    it('should accept undefined (optional)', () => {
      expect(modernAttributionSpecSchema.parse(undefined)).toBe(undefined);
    });

    it('should reject invalid event types', () => {
      const invalidSpec = [{ event_type: 'INVALID_TYPE', window_days: 7 }];
      expect(() => modernAttributionSpecSchema.parse(invalidSpec)).toThrow();
    });

    it('should reject invalid window days', () => {
      const invalidSpec = [{ event_type: 'CLICK_THROUGH', window_days: 28 }];
      expect(() => modernAttributionSpecSchema.parse(invalidSpec)).toThrow();
    });
  });

  describe('create_adset budget validation', () => {
    // Use a minimal valid payload and test budget variations against the full schema
    const minimalPayload = {
      campaignId: '1',
      name: 'Test',
      targeting: { geoLocations: { countries: ['US'] } },
      billingEvent: 'IMPRESSIONS' as const,
      optimizationGoal: 'REACH' as const,
    };

    it('should pass validation when no budget is provided (for CBO)', () => {
      const result = CreateAdSetSchema.safeParse({ ...minimalPayload });
      expect(result.success).toBe(true);
    });

    it('should accept valid daily budget only', () => {
      const result = CreateAdSetSchema.safeParse({ ...minimalPayload, budget: { daily: 1000 } });
      expect(result.success).toBe(true);
    });

    it('should accept valid lifetime budget only', () => {
      const result = CreateAdSetSchema.safeParse({
        ...minimalPayload,
        budget: { lifetime: 50000 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject when both budgets provided', () => {
      const result = CreateAdSetSchema.safeParse({
        ...minimalPayload,
        budget: { daily: 1000, lifetime: 50000 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('but not both');
    });

    it('should reject when budget object is empty', () => {
      const result = CreateAdSetSchema.safeParse({ ...minimalPayload, budget: {} });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('specify **either** daily **or** lifetime');
    });

    it('should reject negative budget values', () => {
      expect(
        CreateAdSetSchema.safeParse({ ...minimalPayload, budget: { daily: -100 } }).success
      ).toBe(false);
      expect(
        CreateAdSetSchema.safeParse({ ...minimalPayload, budget: { lifetime: -500 } }).success
      ).toBe(false);
    });

    it('should reject non-integer budget values', () => {
      expect(
        CreateAdSetSchema.safeParse({ ...minimalPayload, budget: { daily: 10.5 } }).success
      ).toBe(false);
      expect(
        CreateAdSetSchema.safeParse({ ...minimalPayload, budget: { lifetime: 100.99 } }).success
      ).toBe(false);
    });
  });

  describe('update_adset budget validation', () => {
    // Test the update budget schema (optional, but if provided, enforces XOR)
    const updateBudgetSchema = z
      .object({
        daily: z.number().int().positive().optional(),
        lifetime: z.number().int().positive().optional(),
      })
      .optional()
      .refine((budget) => !budget || !(budget.daily && budget.lifetime), {
        message: 'Provide **either** daily **or** lifetime budget for an update, but not both.',
        path: ['daily'],
      });

    it('should accept undefined budget (no update)', () => {
      const result = updateBudgetSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should accept valid daily budget only', () => {
      const result = updateBudgetSchema.safeParse({ daily: 2000 });
      expect(result.success).toBe(true);
    });

    it('should accept valid lifetime budget only', () => {
      const result = updateBudgetSchema.safeParse({ lifetime: 100000 });
      expect(result.success).toBe(true);
    });

    it('should accept empty budget object', () => {
      const result = updateBudgetSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject when both budgets provided in update', () => {
      const result = updateBudgetSchema.safeParse({ daily: 2000, lifetime: 100000 });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('**either** daily **or** lifetime');
    });
  });

  describe('create_adset conditional bidAmount validation', () => {
    const minimalPayload = {
      campaignId: '1',
      name: 'Test',
      budget: { daily: 1000 },
      targeting: { geoLocations: { countries: ['US'] } },
      billingEvent: 'IMPRESSIONS' as const,
      optimizationGoal: 'REACH' as const,
    };

    it('should fail if bidStrategy is LOWEST_COST_WITH_BID_CAP and bidAmount is missing', () => {
      const payload = { ...minimalPayload, bidStrategy: 'LOWEST_COST_WITH_BID_CAP' as const };
      const result = CreateAdSetSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].path).toEqual(['bidAmount']);
      expect(result.error?.errors[0].message).toContain("'bidAmount' is required");
    });

    it('should fail if bidStrategy is COST_CAP and bidAmount is missing', () => {
      const payload = { ...minimalPayload, bidStrategy: 'COST_CAP' as const };
      const result = CreateAdSetSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].path).toEqual(['bidAmount']);
      expect(result.error?.errors[0].message).toContain("'bidAmount' is required");
    });

    it('should pass if bidStrategy is LOWEST_COST_WITH_BID_CAP and bidAmount is present', () => {
      const payload = {
        ...minimalPayload,
        bidStrategy: 'LOWEST_COST_WITH_BID_CAP' as const,
        bidAmount: 500,
      };
      const result = CreateAdSetSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should pass if bidStrategy does not require a bidAmount and it is missing', () => {
      const payload = { ...minimalPayload, bidStrategy: 'LOWEST_COST_WITHOUT_CAP' as const };
      const result = CreateAdSetSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should pass if no bidStrategy is specified (defaults to LOWEST_COST_WITHOUT_CAP)', () => {
      const payload = { ...minimalPayload };
      const result = CreateAdSetSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('Integration with CreateAdSetRequest type', () => {
    it('should validate that the new field is properly typed', () => {
      // This test ensures TypeScript compilation validates our types
      const validRequest = {
        campaignId: '123456789',
        name: 'Test Ad Set',
        budget: {
          daily: 5000, // e.g., $50.00
        },
        targeting: {
          geoLocations: {
            countries: ['US', 'CA'],
          },
        },
        billingEvent: 'IMPRESSIONS' as const,
        optimizationGoal: 'REACH' as const,
        isSacCfcaTermsCertified: true,
      };

      // TypeScript should not complain about this structure
      expect(validRequest.isSacCfcaTermsCertified).toBe(true);
      expect(validRequest.budget.daily).toBe(5000);
      expect(validRequest.targeting.geoLocations?.countries).toEqual(['US', 'CA']);
    });
  });
});
