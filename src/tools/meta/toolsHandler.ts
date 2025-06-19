import type { JWTPayload } from '../../types/auth.js';
import type {
  CampaignStatus,
  CreateAdSetRequest,
  CreateCampaignRequest,
  MetaTargeting,
} from '../../types/meta.js';
import { MetaAdAccountHandler } from './adAccountHandler.js';
import { MetaAdSetHandler } from './adSetHandler.js';
import { MetaCampaignHandler } from './campaignHandler.js';

export class MetaToolsHandler {
  private adAccountHandler = new MetaAdAccountHandler();
  private campaignHandler = new MetaCampaignHandler();
  private adSetHandler = new MetaAdSetHandler();

  // Ad Account methods - delegated to MetaAdAccountHandler
  async getAdAccounts(authPayload: JWTPayload, params: Record<string, unknown> = {}) {
    return this.adAccountHandler.getAdAccounts(authPayload, params);
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
