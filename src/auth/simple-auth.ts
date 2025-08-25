import { Logger } from '../core/logger';

export interface AuthUser {
  userId: string;
  email?: string;
  provider: 'meta';
  accessToken: string;
}

export class SimpleAuthService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SimpleAuthService');
  }

  /**
   * Verify Meta access token by making a test API call
   */
  public async verifyMetaToken(token: string): Promise<AuthUser | null> {
    try {
      // Test the token with Meta Graph API
      const response = await fetch(`https://graph.facebook.com/me?access_token=${token}`);
      
      if (!response.ok) {
        this.logger.warn('Meta token verification failed:', response.status);
        return null;
      }

      const userData = await response.json();
      
      this.logger.info(`Meta token verified for user: ${userData.id}`);
      
      return {
        userId: userData.id,
        email: userData.email,
        provider: 'meta',
        accessToken: token
      };
    } catch (error) {
      this.logger.error('Meta token verification error:', error);
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  public extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) {
      return null;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Get Meta Ads API token (same as the access token)
   */
  public getMetaAdsToken(user: AuthUser): string {
    return user.accessToken;
  }
}

