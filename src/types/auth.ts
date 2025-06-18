export interface JWTPayload {
  userId: string;
  clientId: string;
  adAccountId?: string;
  scopes: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti?: string;
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
