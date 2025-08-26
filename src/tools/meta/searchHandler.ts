import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { createMetaApiInstance, getApiInstanceUserId, handleMetaApiCall } from './api.js';
import type { JWTPayload } from '../../types/auth.js';

// Enhanced search schemas
const EnhancedSearchInput = z.object({
  accessToken: z.string().optional(),
  query: z.string().describe('Search query string (e.g., "Injury Payouts pages", "active campaigns", "ads with high CTR")'),
  limit: z.number().min(1).max(100).default(25).describe('Maximum number of results to return'),
});

const EnhancedSearchResult = z.object({
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

export class SearchHandler {
  /**
   * Enhanced search across accounts, campaigns, ads, and pages
   */
  async enhancedSearch(
    authPayload: JWTPayload,
    params: z.infer<typeof EnhancedSearchInput>
  ): Promise<z.infer<typeof EnhancedSearchResult>> {
    logger.info('Executing enhanced_search', { userId: authPayload.userId, params });

    return await handleMetaApiCall(
      async () => {
        const api = await createMetaApiInstance(getApiInstanceUserId(authPayload));

        const query = params.query.toLowerCase();
        let searchType = 'general';
        let results: any[] = [];

        // Auto-detect search type based on query
        if (query.includes('page') || query.includes('pages')) {
          searchType = 'pages';
          results = await this.searchPages(api, params.query, params.limit);
        } else if (query.includes('campaign') || query.includes('campaigns')) {
          searchType = 'campaigns';
          results = await this.searchCampaigns(api, params.query, params.limit);
        } else if (query.includes('ad') || query.includes('ads')) {
          searchType = 'ads';
          results = await this.searchAds(api, params.query, params.limit);
        } else if (query.includes('account') || query.includes('accounts')) {
          searchType = 'accounts';
          results = await this.searchAccounts(api, params.query, params.limit);
        } else {
          // General search - try multiple types
          searchType = 'general';
          results = await this.generalSearch(api, params.query, params.limit);
        }

        const formattedResults = results.map(result => ({
          id: result.id,
          name: result.name || result.title || 'Unknown',
          type: result.type || searchType.slice(0, -1), // Remove 's' from end
          status: result.status || result.effective_status,
          additionalInfo: {
            ...result,
            id: undefined,
            name: undefined,
            title: undefined,
            type: undefined,
            status: undefined,
            effective_status: undefined,
          },
        }));

        return {
          searchType,
          results: formattedResults,
          totalCount: formattedResults.length,
        };
      },
      {
        toolName: 'enhanced_search',
        userId: authPayload.userId,
      }
    );
  }

  private async searchPages(api: any, query: string, limit: number): Promise<any[]> {
    try {
      const response = await api.call('me/accounts', {
        fields: 'id,name,account_status,account_type',
      });

      return response.data
        .filter((account: any) => 
          account.name.toLowerCase().includes(query.toLowerCase()) ||
          account.id.includes(query)
        )
        .slice(0, limit)
        .map((account: any) => ({
          ...account,
          type: 'page',
        }));
    } catch (error) {
      logger.warn('Error searching pages', { error });
      return [];
    }
  }

  private async searchCampaigns(api: any, query: string, limit: number): Promise<any[]> {
    try {
      // First get ad accounts
      const accountsResponse = await api.call('me/adaccounts', {
        fields: 'id,name',
      });

      const allCampaigns = [];
      
      for (const account of accountsResponse.data.slice(0, 3)) { // Limit to first 3 accounts
        try {
          const campaignsResponse = await api.call(`${account.id}/campaigns`, {
            fields: 'id,name,status,objective,created_time',
            limit: Math.ceil(limit / 3),
          });

          allCampaigns.push(...campaignsResponse.data);
        } catch (error) {
          logger.warn('Error getting campaigns for account', { accountId: account.id, error });
        }
      }

      return allCampaigns
        .filter((campaign: any) => 
          campaign.name.toLowerCase().includes(query.toLowerCase()) ||
          campaign.id.includes(query) ||
          campaign.objective.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map((campaign: any) => ({
          ...campaign,
          type: 'campaign',
        }));
    } catch (error) {
      logger.warn('Error searching campaigns', { error });
      return [];
    }
  }

  private async searchAds(api: any, query: string, limit: number): Promise<any[]> {
    try {
      // First get ad accounts
      const accountsResponse = await api.call('me/adaccounts', {
        fields: 'id,name',
      });

      const allAds = [];
      
      for (const account of accountsResponse.data.slice(0, 3)) { // Limit to first 3 accounts
        try {
          const adsResponse = await api.call(`${account.id}/ads`, {
            fields: 'id,name,status,effective_status,created_time',
            limit: Math.ceil(limit / 3),
          });

          allAds.push(...adsResponse.data);
        } catch (error) {
          logger.warn('Error getting ads for account', { accountId: account.id, error });
        }
      }

      return allAds
        .filter((ad: any) => 
          ad.name.toLowerCase().includes(query.toLowerCase()) ||
          ad.id.includes(query) ||
          ad.status.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map((ad: any) => ({
          ...ad,
          type: 'ad',
        }));
    } catch (error) {
      logger.warn('Error searching ads', { error });
      return [];
    }
  }

  private async searchAccounts(api: any, query: string, limit: number): Promise<any[]> {
    try {
      const response = await api.call('me/adaccounts', {
        fields: 'id,name,account_status,account_type,currency,timezone_name',
      });

      return response.data
        .filter((account: any) => 
          account.name.toLowerCase().includes(query.toLowerCase()) ||
          account.id.includes(query) ||
          account.account_type.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map((account: any) => ({
          ...account,
          type: 'account',
        }));
    } catch (error) {
      logger.warn('Error searching accounts', { error });
      return [];
    }
  }

  private async generalSearch(api: any, query: string, limit: number): Promise<any[]> {
    const results = [];

    // Try searching accounts first
    const accounts = await this.searchAccounts(api, query, Math.ceil(limit / 3));
    results.push(...accounts);

    // Try searching campaigns
    const campaigns = await this.searchCampaigns(api, query, Math.ceil(limit / 3));
    results.push(...campaigns);

    // Try searching ads
    const ads = await this.searchAds(api, query, Math.ceil(limit / 3));
    results.push(...ads);

    return results.slice(0, limit);
  }
}

export const searchHandler = new SearchHandler();
