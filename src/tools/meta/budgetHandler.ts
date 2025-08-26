import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import type { JWTPayload } from '../../types/auth.js';

// Budget scheduling schemas
const CreateBudgetScheduleInput = z.object({
  accessToken: z.string().optional(),
  campaignId: z.string().describe('Meta Ads campaign ID'),
  budgetValue: z.number().positive().describe('Amount of budget increase'),
  budgetValueType: z.enum(['ABSOLUTE', 'MULTIPLIER']).describe('Type of budget value - "ABSOLUTE" or "MULTIPLIER"'),
  timeStart: z.number().describe('Unix timestamp for when the high demand period should start'),
  timeEnd: z.number().describe('Unix timestamp for when the high demand period should end'),
});

const CreateBudgetScheduleResult = z.object({
  budgetScheduleId: z.string(),
  campaignId: z.string(),
  budgetValue: z.number(),
  budgetValueType: z.string(),
  timeStart: z.number(),
  timeEnd: z.number(),
  status: z.string(),
});

// Campaign budget optimization schemas
const UpdateCampaignBudgetInput = z.object({
  accessToken: z.string().optional(),
  campaignId: z.string().describe('Meta Ads campaign ID'),
  dailyBudget: z.number().positive().optional().describe('Daily budget in account currency (in cents)'),
  lifetimeBudget: z.number().positive().optional().describe('Lifetime budget in account currency (in cents)'),
  spendCap: z.number().positive().optional().describe('Spending limit for the campaign in account currency (in cents)'),
});

const UpdateCampaignBudgetResult = z.object({
  campaignId: z.string(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  spendCap: z.number().optional(),
  status: z.string(),
});

export class BudgetHandler {
  /**
   * Create a budget schedule for a Meta Ads campaign
   */
  async createBudgetSchedule(
    authPayload: JWTPayload,
    params: z.infer<typeof CreateBudgetScheduleInput>
  ): Promise<z.infer<typeof CreateBudgetScheduleResult>> {
    logger.info('Executing create_budget_schedule', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Validate time parameters
        if (params.timeStart >= params.timeEnd) {
          throw new Error('timeStart must be before timeEnd');
        }

        if (params.timeStart < Math.floor(Date.now() / 1000)) {
          throw new Error('timeStart cannot be in the past');
        }

        // Create budget schedule using Meta's API
        const response = await api.call(params.campaignId, [
          'budget_schedule',
        ], {
          budget_schedule: {
            budget_value: params.budgetValue,
            budget_value_type: params.budgetValueType,
            time_start: params.timeStart,
            time_end: params.timeEnd,
          },
        });

        const result: z.infer<typeof CreateBudgetScheduleResult> = {
          budgetScheduleId: (response as any).id || 'unknown',
          campaignId: params.campaignId,
          budgetValue: params.budgetValue,
          budgetValueType: params.budgetValueType,
          timeStart: params.timeStart,
          timeEnd: params.timeEnd,
          status: 'created',
        };

        logger.info('Successfully created budget schedule', {
          userId: authPayload.userId,
          campaignId: params.campaignId,
          budgetScheduleId: result.budgetScheduleId,
        });

        return result;
      },
      {
        toolName: 'create_budget_schedule',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Update campaign budget settings
   */
  async updateCampaignBudget(
    authPayload: JWTPayload,
    params: z.infer<typeof UpdateCampaignBudgetInput>
  ): Promise<z.infer<typeof UpdateCampaignBudgetResult>> {
    logger.info('Executing update_campaign_budget', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Prepare update fields
        const updateFields: Record<string, any> = {};
        
        if (params.dailyBudget !== undefined) {
          updateFields.daily_budget = params.dailyBudget;
        }
        
        if (params.lifetimeBudget !== undefined) {
          updateFields.lifetime_budget = params.lifetimeBudget;
        }
        
        if (params.spendCap !== undefined) {
          updateFields.spend_cap = params.spendCap;
        }

        if (Object.keys(updateFields).length === 0) {
          throw new Error('At least one budget field must be provided (dailyBudget, lifetimeBudget, or spendCap)');
        }

        // Update campaign budget
        const response = await api.call(params.campaignId, Object.keys(updateFields), updateFields);

        const result: z.infer<typeof UpdateCampaignBudgetResult> = {
          campaignId: params.campaignId,
          dailyBudget: params.dailyBudget,
          lifetimeBudget: params.lifetimeBudget,
          spendCap: params.spendCap,
          status: 'updated',
        };

        logger.info('Successfully updated campaign budget', {
          userId: authPayload.userId,
          campaignId: params.campaignId,
          updateFields,
        });

        return result;
      },
      {
        toolName: 'update_campaign_budget',
        userId: authPayload.userId,
      }
    );
  }

  /**
   * Get campaign budget information
   */
  async getCampaignBudget(
    authPayload: JWTPayload,
    params: { accessToken?: string; campaignId: string }
  ): Promise<{
    campaignId: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
    spendCap?: number;
    budgetRemaining?: number;
    spendAmount?: number;
  }> {
    logger.info('Executing get_campaign_budget', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        // Get campaign budget information
        const response = await api.call(params.campaignId, [
          'daily_budget',
          'lifetime_budget',
          'spend_cap',
          'budget_remaining',
          'spend_amount',
        ]);

        const result = {
          campaignId: params.campaignId,
          dailyBudget: (response as any).daily_budget,
          lifetimeBudget: (response as any).lifetime_budget,
          spendCap: (response as any).spend_cap,
          budgetRemaining: (response as any).budget_remaining,
          spendAmount: (response as any).spend_amount,
        };

        logger.info('Successfully retrieved campaign budget', {
          userId: authPayload.userId,
          campaignId: params.campaignId,
        });

        return result;
      },
      {
        toolName: 'get_campaign_budget',
        userId: authPayload.userId,
      }
    );
  }
}

export const budgetHandler = new BudgetHandler();
