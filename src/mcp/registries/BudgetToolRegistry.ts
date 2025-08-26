import { z } from 'zod';

// Budget scheduling schemas
export const CreateBudgetScheduleInput = z.object({
  accessToken: z.string().optional(),
  campaignId: z.string().describe('Meta Ads campaign ID'),
  budgetValue: z.number().positive().describe('Amount of budget increase'),
  budgetValueType: z.enum(['ABSOLUTE', 'MULTIPLIER']).describe('Type of budget value - "ABSOLUTE" or "MULTIPLIER"'),
  timeStart: z.number().describe('Unix timestamp for when the high demand period should start'),
  timeEnd: z.number().describe('Unix timestamp for when the high demand period should end'),
});

export const CreateBudgetScheduleResult = z.object({
  budgetScheduleId: z.string(),
  campaignId: z.string(),
  budgetValue: z.number(),
  budgetValueType: z.string(),
  timeStart: z.number(),
  timeEnd: z.number(),
  status: z.string(),
});

// Campaign budget optimization schemas
export const UpdateCampaignBudgetInput = z.object({
  accessToken: z.string().optional(),
  campaignId: z.string().describe('Meta Ads campaign ID'),
  dailyBudget: z.number().positive().optional().describe('Daily budget in account currency (in cents)'),
  lifetimeBudget: z.number().positive().optional().describe('Lifetime budget in account currency (in cents)'),
  spendCap: z.number().positive().optional().describe('Spending limit for the campaign in account currency (in cents)'),
});

export const UpdateCampaignBudgetResult = z.object({
  campaignId: z.string(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  spendCap: z.number().optional(),
  status: z.string(),
});

// Get campaign budget schemas
export const GetCampaignBudgetInput = z.object({
  accessToken: z.string().optional(),
  campaignId: z.string().describe('Meta Ads campaign ID'),
});

export const GetCampaignBudgetResult = z.object({
  campaignId: z.string(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  spendCap: z.number().optional(),
  budgetRemaining: z.number().optional(),
  spendAmount: z.number().optional(),
});

export type CreateBudgetScheduleInput = z.infer<typeof CreateBudgetScheduleInput>;
export type CreateBudgetScheduleResult = z.infer<typeof CreateBudgetScheduleResult>;
export type UpdateCampaignBudgetInput = z.infer<typeof UpdateCampaignBudgetInput>;
export type UpdateCampaignBudgetResult = z.infer<typeof UpdateCampaignBudgetResult>;
export type GetCampaignBudgetInput = z.infer<typeof GetCampaignBudgetInput>;
export type GetCampaignBudgetResult = z.infer<typeof GetCampaignBudgetResult>;
