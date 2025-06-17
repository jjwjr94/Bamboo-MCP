export interface SessionData {
  clientId: string;
  redirectUri: string;
  state: string;
  originalState?: string; // The state received from the client
  clientCodeChallenge?: string;
  clientCodeChallengeMethod?: string;
}
