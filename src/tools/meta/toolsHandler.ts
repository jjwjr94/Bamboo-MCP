import type {
  GetAdAccountInsightsInput,
  GetAdInsightsInput,
} from '../../mcp/registries/InsightsToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import type {
  CampaignStatus,
  CreateAdCreativeRequest,
  CreateAdRequest,
  CreateAdSetRequest,
  CreateCampaignRequest,
  CustomAudienceRequest,
  MetaTargeting,
} from '../../types/meta.js';
import { MetaAdAccountHandler } from './adAccountHandler.js';
import { MetaAdCreativeHandler } from './adCreativeHandler.js';
import { MetaAdHandler } from './adHandler.js';
import { MetaAdSetHandler } from './adSetHandler.js';
import { MetaBusinessManagerHandler } from './businessManagerHandler.js';
import { MetaCampaignHandler } from './campaignHandler.js';
import { MetaCustomAudienceHandler } from './customAudienceHandler.js';
import { MetaInsightsHandler } from './insightsHandler.js';
import { MetaPagesHandler } from './pagesHandler.js';

export class MetaToolsHandler {
  private adAccountHandler = new MetaAdAccountHandler();
  private campaignHandler = new MetaCampaignHandler();
  private adSetHandler = new MetaAdSetHandler();
  private adCreativeHandler = new MetaAdCreativeHandler();
  private adHandler = new MetaAdHandler();
  private insightsHandler = new MetaInsightsHandler();
  private customAudienceHandler = new MetaCustomAudienceHandler();
  private pagesHandler = new MetaPagesHandler();
  private businessManagerHandler = new MetaBusinessManagerHandler();

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

  // Ad Creative methods - delegated to MetaAdCreativeHandler
  async getAdCreatives(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.adCreativeHandler.getAdCreatives(authPayload, params);
  }

  async createAdCreative(
    authPayload: JWTPayload,
    params: CreateAdCreativeRequest & { adAccountId?: string }
  ) {
    return this.adCreativeHandler.createAdCreative(authPayload, params);
  }

  async updateAdCreative(authPayload: JWTPayload, params: { adCreativeId: string; name: string }) {
    return this.adCreativeHandler.updateAdCreative(authPayload, params);
  }

  async deleteAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; confirmPermanentDelete?: boolean }
  ) {
    return this.adCreativeHandler.deleteAdCreative(authPayload, params);
  }

  // Ad methods - delegated to MetaAdHandler
  async getAds(
    authPayload: JWTPayload,
    params: { adAccountId?: string; adSetId?: string; campaignId?: string }
  ) {
    return this.adHandler.getAds(authPayload, params);
  }

  async createAd(authPayload: JWTPayload, params: CreateAdRequest & { adAccountId?: string }) {
    return this.adHandler.createAd(authPayload, params);
  }

  async updateAd(
    authPayload: JWTPayload,
    params: {
      adId: string;
      name?: string;
      status?: string;
      creativeId?: string;
    }
  ) {
    return this.adHandler.updateAd(authPayload, params);
  }

  async deleteAd(
    authPayload: JWTPayload,
    params: { adId: string; confirmPermanentDelete?: boolean }
  ) {
    return this.adHandler.deleteAd(authPayload, params);
  }

  // Insights methods - delegated to MetaInsightsHandler
  async getAdInsights(authPayload: JWTPayload, params: GetAdInsightsInput) {
    return this.insightsHandler.getAdInsights(authPayload, params);
  }

  async getAdAccountInsights(authPayload: JWTPayload, params: GetAdAccountInsightsInput) {
    return this.insightsHandler.getAdAccountInsights(authPayload, params);
  }

  // Custom Audience methods - delegated to MetaCustomAudienceHandler
  async getCustomAudiences(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.customAudienceHandler.getCustomAudiences(authPayload, params);
  }

  async createCustomAudience(
    authPayload: JWTPayload,
    params: CustomAudienceRequest & { adAccountId?: string }
  ) {
    // Ensure subtype is 'CUSTOM' as required by the handler
    const customParams = {
      ...params,
      subtype: 'CUSTOM' as const,
    };
    return this.customAudienceHandler.createCustomAudience(authPayload, customParams);
  }

  async deleteCustomAudience(
    authPayload: JWTPayload,
    params: { customAudienceId: string; confirmPermanentDelete?: boolean }
  ) {
    return this.customAudienceHandler.deleteCustomAudience(authPayload, params);
  }

  // Pages methods - delegated to MetaPagesHandler
  async getPages(authPayload: JWTPayload) {
    return this.pagesHandler.getPages(authPayload);
  }

  async getPagePosts(authPayload: JWTPayload, params: { pageId: string }) {
    return this.pagesHandler.getPagePosts(authPayload, params);
  }

  async createPagePostAd(
    authPayload: JWTPayload,
    params: {
      adAccountId?: string;
      name: string;
      adSetId: string;
      postId: string;
      status?: 'ACTIVE' | 'PAUSED';
    }
  ) {
    return this.pagesHandler.createPagePostAd(authPayload, params);
  }

  // Business Manager methods - delegated to MetaBusinessManagerHandler
  async getBusinessAccounts(authPayload: JWTPayload) {
    return this.businessManagerHandler.getBusinessAccounts(authPayload);
  }

  async getBusinessUsers(authPayload: JWTPayload, params: { businessId: string }) {
    return this.businessManagerHandler.getBusinessUsers(authPayload, params);
  }
}
