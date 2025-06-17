export interface User {
  id: string;
  facebookUserId: string;
  createdAt: Date;
}

export interface OAuthToken {
  id: string;
  userId: string;
  accessToken: string;
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
