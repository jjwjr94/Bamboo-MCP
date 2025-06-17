import type { JWTPayload } from '../types/auth.js';
import type {
  CampaignStatus,
  CreateAdSetRequest,
  CreateCampaignRequest,
  MetaTargeting,
} from '../types/meta.js';
import { MetaAdAccountHandler } from './metaAdAccountHandler.js';
import { MetaAdSetHandler } from './metaAdSetHandler.js';
import { MetaApiHandler } from './metaApiHandler.js';
import { MetaCampaignHandler } from './metaCampaignHandler.js';

export class MetaToolsHandler {
  private adAccountHandler = new MetaAdAccountHandler();
  private campaignHandler = new MetaCampaignHandler();
  private adSetHandler = new MetaAdSetHandler();
  private apiHandler = new MetaApiHandler();

  // Ad Account methods - delegated to MetaAdAccountHandler
  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
    return this.adAccountHandler.getAdAccounts(authPayload, params);
  }

  // Generic API methods - delegated to MetaApiHandler
  async callMetaApi(
    authPayload: JWTPayload,
    params: {
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      fields?: string[];
      parameters?: Record<string, any>;
    }
  ) {
    return this.apiHandler.callMetaApi(authPayload, params);
  }

  // Campaign methods - delegated to MetaCampaignHandler
  async getCampaigns(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.campaignHandler.getCampaigns(authPayload, params);
  }

  async createCampaign(authPayload: JWTPayload, params: CreateCampaignRequest) {
    return this.campaignHandler.createCampaign(authPayload, params);
  }

  async updateCampaign(
    authPayload: JWTPayload,
    params: {
      campaignId: string;
      name?: string;
      status?: CampaignStatus;
      dailyBudget?: number;
      lifetimeBudget?: number;
    }
  ) {
    return this.campaignHandler.updateCampaign(authPayload, params);
  }

  async deleteCampaign(authPayload: JWTPayload, params: { campaignId: string }) {
    return this.campaignHandler.deleteCampaign(authPayload, params);
  }

  // Ad Set methods - delegated to MetaAdSetHandler
  async getAdSets(authPayload: JWTPayload, params: { campaignId?: string; adAccountId?: string }) {
    return this.adSetHandler.getAdSets(authPayload, params);
  }

  async createAdSet(authPayload: JWTPayload, params: CreateAdSetRequest) {
    return this.adSetHandler.createAdSet(authPayload, params);
  }

  async updateAdSet(
    authPayload: JWTPayload,
    params: {
      adSetId: string;
      name?: string;
      status?: CampaignStatus;
      dailyBudget?: number;
      lifetimeBudget?: number;
      bidAmount?: number;
      targeting?: MetaTargeting;
      startTime?: string;
      endTime?: string;
    }
  ) {
    return this.adSetHandler.updateAdSet(authPayload, params);
  }

  async deleteAdSet(authPayload: JWTPayload, params: { adSetId: string }) {
    return this.adSetHandler.deleteAdSet(authPayload, params);
  }
}
