import { Router, Request, Response } from 'express';
import passport from 'passport';
import FacebookTokenStrategy from 'passport-facebook-token';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { ConfigService } from '../core/config';
import { Logger } from '../core/logger';

export interface AuthUser {
  userId: string;
  email?: string;
  provider: string;
  accessToken?: string;
  refreshToken?: string;
}

export class AuthService {
  private logger: Logger;
  private config: ConfigService;
  private router: Router;
  private redis: Redis;

  constructor() {
    this.logger = new Logger('AuthService');
    this.config = ConfigService.getInstance();
    this.router = Router();
    this.redis = new Redis(this.config.get('REDIS_URL'));
    this.setupPassport();
    this.setupRoutes();
  }

  private setupPassport(): void {
    // Configure Facebook Token Strategy
    passport.use(new FacebookTokenStrategy({
      clientID: this.config.get('FACEBOOK_APP_ID'),
      clientSecret: this.config.get('FACEBOOK_APP_SECRET')
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        this.logger.info(`Facebook auth for user: ${profile.id}`);
        
        const user: AuthUser = {
          userId: profile.id,
          email: profile.emails?.[0]?.value,
          provider: 'facebook',
          accessToken,
          refreshToken
        };

        // Store tokens in Redis with expiration
        await this.storeUserTokens(user.userId, accessToken, refreshToken);

        return done(null, user);
      } catch (error) {
        this.logger.error('Facebook auth error:', error);
        return done(error, null);
      }
    }));
  }

  private setupRoutes(): void {
    // Health check for auth service
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'auth' });
    });

    // Facebook OAuth routes
    this.router.post('/facebook/token', 
      passport.authenticate('facebook-token', { session: false }),
      this.handleFacebookAuth.bind(this)
    );

    // Pipeboard authentication
    this.router.post('/pipeboard', this.handlePipeboardAuth.bind(this));

    // Token verification
    this.router.post('/token/verify', async (req, res) => {
      try {
        const { token } = req.body;
        const user = await this.verifyToken(token);
        if (user) {
          res.json({ valid: true, user });
        } else {
          res.status(401).json({ valid: false });
        }
      } catch (error) {
        res.status(401).json({ valid: false, error: 'Invalid token' });
      }
    });

    // Token refresh
    this.router.post('/token/refresh', this.handleTokenRefresh.bind(this));

    // Logout
    this.router.post('/logout', this.handleLogout.bind(this));
  }

  private async handleFacebookAuth(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as AuthUser;
      const jwtToken = this.generateToken(user);

      res.json({
        success: true,
        token: jwtToken,
        user: {
          userId: user.userId,
          email: user.email,
          provider: user.provider
        }
      });
    } catch (error) {
      this.logger.error('Facebook auth handler error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }

  private async handlePipeboardAuth(req: Request, res: Response): Promise<void> {
    try {
      const { pipeboardToken } = req.body;
      
      if (!pipeboardToken) {
        res.status(400).json({ error: 'Pipeboard token required' });
        return;
      }

      // Verify Pipeboard token by making a test API call
      const user = await this.authenticateWithPipeboard(pipeboardToken);
      const jwtToken = this.generateToken(user);

      res.json({
        success: true,
        token: jwtToken,
        user: {
          userId: user.userId,
          email: user.email,
          provider: user.provider
        }
      });
    } catch (error) {
      this.logger.error('Pipeboard auth error:', error);
      res.status(401).json({ error: 'Invalid Pipeboard token' });
    }
  }

  private async handleTokenRefresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
      }

      // Verify refresh token and generate new access token
      const user = await this.verifyRefreshToken(refreshToken);
      if (!user) {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      const newToken = this.generateToken(user);
      res.json({ token: newToken });
    } catch (error) {
      this.logger.error('Token refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  }

  private async handleLogout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        // Add token to blacklist
        await this.blacklistToken(token);
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      this.logger.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  public getRouter(): Router {
    return this.router;
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return null;
      }

      const jwtSecret = this.config.get('JWT_SECRET');
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      return {
        userId: decoded.userId,
        email: decoded.email,
        provider: decoded.provider
      };
    } catch (error) {
      this.logger.warn('Token verification failed:', error);
      return null;
    }
  }

  public generateToken(user: AuthUser): string {
    const jwtSecret = this.config.get('JWT_SECRET');
    const expiresIn = this.config.get('JWT_EXPIRES_IN');
    
    return jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        provider: user.provider
      },
      jwtSecret,
      { expiresIn }
    );
  }

  public async authenticateWithPipeboard(token: string): Promise<AuthUser> {
    try {
      // Make a test API call to Pipeboard to verify the token
      const response = await fetch('https://api.pipeboard.co/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Invalid Pipeboard token');
      }

      const userData = await response.json() as { id: string; email?: string };
      
      // Store the Pipeboard token for Meta Ads API calls
      await this.redis.setex(`pipeboard:${userData.id}`, 86400, token);

      return {
        userId: userData.id,
        email: userData.email,
        provider: 'pipeboard',
        accessToken: token
      };
    } catch (error) {
      this.logger.error('Pipeboard authentication failed:', error);
      throw new Error('Pipeboard authentication failed');
    }
  }

  public async getMetaAdsToken(userId: string): Promise<string | null> {
    try {
      // Try to get Facebook access token first
      const fbToken = await this.redis.get(`facebook:${userId}`);
      if (fbToken) {
        return fbToken;
      }

      // Fall back to Pipeboard token
      const pipeboardToken = await this.redis.get(`pipeboard:${userId}`);
      return pipeboardToken;
    } catch (error) {
      this.logger.error('Error getting Meta Ads token:', error);
      return null;
    }
  }

  private async storeUserTokens(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    try {
      // Store access token with 1 hour expiration
      await this.redis.setex(`facebook:${userId}`, 3600, accessToken);
      
      if (refreshToken) {
        // Store refresh token with 60 days expiration
        await this.redis.setex(`refresh:${userId}`, 5184000, refreshToken);
      }
    } catch (error) {
      this.logger.error('Error storing user tokens:', error);
    }
  }

  private async verifyRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    try {
      // In a real implementation, you would verify the refresh token with Facebook
      // For now, we'll just decode it if it's a JWT
      const jwtSecret = this.config.get('JWT_SECRET');
      const decoded = jwt.verify(refreshToken, jwtSecret) as any;
      
      return {
        userId: decoded.userId,
        email: decoded.email,
        provider: decoded.provider
      };
    } catch (error) {
      this.logger.warn('Refresh token verification failed:', error);
      return null;
    }
  }

  private async blacklistToken(token: string): Promise<void> {
    try {
      // Add token to blacklist with expiration matching JWT expiration
      const expiresIn = this.config.get('JWT_EXPIRES_IN');
      const expirationSeconds = this.parseExpirationToSeconds(expiresIn);
      await this.redis.setex(`blacklist:${token}`, expirationSeconds, 'true');
    } catch (error) {
      this.logger.error('Error blacklisting token:', error);
    }
  }

  private parseExpirationToSeconds(expiration: string): number {
    // Simple parser for JWT expiration format (e.g., "24h", "7d")
    const match = expiration.match(/^(\\d+)([hdm])$/);
    if (!match) return 86400; // Default to 24 hours

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      case 'm': return value * 60;
      default: return 86400;
    }
  }
}

