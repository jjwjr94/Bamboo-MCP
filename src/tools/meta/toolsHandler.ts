import type {
  CreateAdCreativeRequest,
  UpdateAdCreativeRequest,
} from '../../mcp/registries/AdCreativeToolRegistry.js';
import type {
  CreateAdSetRequest,
  UpdateAdSetRequest,
} from '../../mcp/registries/AdSetToolRegistry.js';
import type { CreateAdRequest, UpdateAdRequest } from '../../mcp/registries/AdToolRegistry.js';
import type {
  GetAdsArchiveInsightsInput,
  GetPageArchiveAdsInput,
  GetPoliticalAdsInput,
  SearchAdsArchiveInput,
} from '../../mcp/registries/AdsArchiveToolRegistry.js';
import type {
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from '../../mcp/registries/CampaignToolRegistry.js';
import type { CreateCustomAudienceRequest } from '../../mcp/registries/CustomAudienceToolRegistry.js';
import type {
  GetAdAccountInsightsInput,
  GetAdInsightsInput,
} from '../../mcp/registries/InsightsToolRegistry.js';
import type { JWTPayload } from '../../types/auth.js';
import { MetaAdAccountHandler } from './adAccountHandler.js';
import { MetaAdCreativeHandler } from './adCreativeHandler.js';
import { AdCreativeUploadHandler } from './adCreativeUploadHandler.js';
import { MetaAdHandler } from './adHandler.js';
import { MetaAdSetHandler } from './adSetHandler.js';
import { MetaAdsArchiveHandler } from './adsArchiveHandler.js';
import { MetaBusinessManagerHandler } from './businessManagerHandler.js';
import { MetaCampaignHandler } from './campaignHandler.js';
import { MetaCustomAudienceHandler } from './customAudienceHandler.js';
import { MetaInsightsHandler } from './insightsHandler.js';
import { MetaPagesHandler } from './pagesHandler.js';
import { MetaTargetingSearchHandler } from './targetingSearchHandler.js';

export class MetaToolsHandler {
  private adAccountHandler = new MetaAdAccountHandler();
  private campaignHandler = new MetaCampaignHandler();
  private adSetHandler = new MetaAdSetHandler();
  private adCreativeHandler = new MetaAdCreativeHandler();
  private adCreativeUploadHandler = new AdCreativeUploadHandler();
  private adHandler = new MetaAdHandler();
  private insightsHandler = new MetaInsightsHandler();
  private customAudienceHandler = new MetaCustomAudienceHandler();
  private pagesHandler = new MetaPagesHandler();
  private businessManagerHandler = new MetaBusinessManagerHandler();
  private adsArchiveHandler = new MetaAdsArchiveHandler();
  private targetingSearchHandler = new MetaTargetingSearchHandler();

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

  async updateCampaign(authPayload: JWTPayload, params: UpdateCampaignRequest) {
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

  async updateAdSet(authPayload: JWTPayload, params: UpdateAdSetRequest) {
    return this.adSetHandler.updateAdSet(authPayload, params);
  }

  async deleteAdSet(authPayload: JWTPayload, params: { adSetId: string }) {
    return this.adSetHandler.deleteAdSet(authPayload, params);
  }

  // Ad Creative methods - delegated to MetaAdCreativeHandler
  async getAdCreatives(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.adCreativeHandler.getAdCreatives(authPayload, params);
  }

  async createAdCreative(authPayload: JWTPayload, params: CreateAdCreativeRequest) {
    return this.adCreativeHandler.createAdCreative(authPayload, params);
  }

  async updateAdCreative(authPayload: JWTPayload, params: UpdateAdCreativeRequest) {
    return this.adCreativeHandler.updateAdCreative(authPayload, params);
  }

  async deleteAdCreative(
    authPayload: JWTPayload,
    params: { adCreativeId: string; confirmPermanentDelete?: boolean }
  ) {
    return this.adCreativeHandler.deleteAdCreative(authPayload, params);
  }

  async initiateAssetUpload(authPayload: JWTPayload, params: { adAccountId?: string }) {
    return this.adCreativeUploadHandler.initiateAssetUpload(authPayload, params);
  }

  async getAssetUploadStatus(authPayload: JWTPayload, params: { uploadId: string }) {
    return this.adCreativeUploadHandler.getAssetUploadStatus(authPayload, params);
  }

  async handleCreativeAssetUpload(
    uploadId: string,
    fileData: import('@fastify/multipart').MultipartFile
  ) {
    return this.adCreativeUploadHandler.handleCreativeAssetUpload(uploadId, fileData);
  }

  // Ad methods - delegated to MetaAdHandler
  async getAds(
    authPayload: JWTPayload,
    params: { adAccountId?: string; adSetId?: string; campaignId?: string }
  ) {
    return this.adHandler.getAds(authPayload, params);
  }

  async createAd(authPayload: JWTPayload, params: CreateAdRequest) {
    return this.adHandler.createAd(authPayload, params);
  }

  async updateAd(authPayload: JWTPayload, params: UpdateAdRequest) {
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

  async createCustomAudience(authPayload: JWTPayload, params: CreateCustomAudienceRequest) {
    return this.customAudienceHandler.createCustomAudience(authPayload, params);
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

  // Ads Archive methods - delegated to MetaAdsArchiveHandler
  async searchAdsArchive(authPayload: JWTPayload, params: SearchAdsArchiveInput) {
    return this.adsArchiveHandler.searchAdsArchive(authPayload, params);
  }

  async getPoliticalAds(authPayload: JWTPayload, params: GetPoliticalAdsInput) {
    return this.adsArchiveHandler.getPoliticalAds(authPayload, params);
  }

  async getPageArchiveAds(authPayload: JWTPayload, params: GetPageArchiveAdsInput) {
    return this.adsArchiveHandler.getPageArchiveAds(authPayload, params);
  }

  async getAdsArchiveInsights(authPayload: JWTPayload, params: GetAdsArchiveInsightsInput) {
    return this.adsArchiveHandler.getAdsArchiveInsights(authPayload, params);
  }

  // Targeting Search methods - delegated to MetaTargetingSearchHandler
  async searchInterests(
    authPayload: JWTPayload,
    params: {
      query: string;
      limit?: number;
    }
  ) {
    return this.targetingSearchHandler.searchInterests(authPayload, params);
  }

  async searchBehaviors(
    authPayload: JWTPayload,
    params: {
      query: string;
      limit?: number;
    }
  ) {
    return this.targetingSearchHandler.searchBehaviors(authPayload, params);
  }

  async searchLocations(
    authPayload: JWTPayload,
    params: {
      query: string;
      type?: 'country' | 'region' | 'city';
      limit?: number;
    }
  ) {
    return this.targetingSearchHandler.searchLocations(authPayload, params);
  }

  async validateTargetingOptions(
    authPayload: JWTPayload,
    params: {
      targetingOptionIds: string[];
    }
  ) {
    return this.targetingSearchHandler.validateTargetingOptions(authPayload, params);
  }
}
