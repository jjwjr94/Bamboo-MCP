import type { JWTPayload as JoseJWTPayload } from 'jose';

export interface JWTPayload extends JoseJWTPayload {
  userId: string;
  clientId: string;
  adAccountId?: string;
  scopes: string[];
  // Override optional fields from jose that we always set
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

export interface SessionData {
  clientId: string;
  redirectUri: string;
  state: string;
  originalState?: string; // The state received from the client
  clientCodeChallenge?: string;
  clientCodeChallengeMethod?: string;
  grantedScopes?: string[]; // The scopes that were granted during authorization
}

export interface TempAuthCodeData {
  sessionToken: string;
  expires: number;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}
