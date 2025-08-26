import { z } from 'zod';

// Enhanced search schemas
export const EnhancedSearchInput = z.object({
  accessToken: z.string().optional(),
  query: z.string().describe('Search query string (e.g., "Injury Payouts pages", "active campaigns", "ads with high CTR")'),
  limit: z.number().min(1).max(100).default(25).describe('Maximum number of results to return'),
});

export const EnhancedSearchResult = z.object({
  searchType: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.string().optional(),
    additionalInfo: z.record(z.any()).optional(),
  })),
  totalCount: z.number(),
});

export type EnhancedSearchInput = z.infer<typeof EnhancedSearchInput>;
export type EnhancedSearchResult = z.infer<typeof EnhancedSearchResult>;
