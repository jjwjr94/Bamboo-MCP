// Global type definitions for Bamboo MCP

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface OAuthToken {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdAccount {
  id: string; // Meta ad account ID (act_xxxx)
  userId: string;
  name: string;
  status: string;
  currency?: string;
  timezone?: string;
  createdAt: Date;
}

export interface JWTPayload {
  userId: string;
  adAccountId?: string;
  scopes: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  permissions: string[];
  createdAt: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget?: number;
  created_time: string;
  updated_time: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  dailyBudget?: number;
  targeting?: any;
  billingEvent?: string;
  optimizationGoal?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adsetId: string;
  creativeId?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaAsset {
  id: string;
  filename: string;
  type: 'image' | 'video';
  dimensions?: string;
  hash?: string;
  url: string;
  thumbnailUrl?: string;
  createdTime: string;
  displayData?: {
    dataUri: string;
    alt: string;
  };
} 