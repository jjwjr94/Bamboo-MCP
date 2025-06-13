import { MCPTool, MCPToolCall, MCPToolResult, UpstreamServer } from '../types';
import { Logger } from '../core/logger';
import { MetaAdsProxy } from './meta-ads';
import { PostgresProxy } from './postgres';
import { AuthService } from '../auth/service';
import Redis from 'ioredis';
import { ConfigService } from '../core/config';

export class UpstreamProxy {
  private logger: Logger;
  private config: ConfigService;
  private upstreams: UpstreamServer[];
  private metaAdsProxy: MetaAdsProxy;
  private postgresProxy: PostgresProxy;
  private redis: Redis;
  private authService: AuthService;

  constructor(upstreams: UpstreamServer[], authService: AuthService) {
    this.logger = new Logger('UpstreamProxy');
    this.config = ConfigService.getInstance();
    this.upstreams = upstreams;
    this.authService = authService;
    this.redis = new Redis(this.config.get('REDIS_URL'));
    this.metaAdsProxy = new MetaAdsProxy(authService);
    this.postgresProxy = new PostgresProxy();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing upstream proxies');
      await Promise.all([
        this.metaAdsProxy.initialize(),
        this.postgresProxy.initialize()
      ]);
      this.logger.info('All upstream proxies initialized');
    } catch (error) {
      this.logger.error('Failed to initialize upstream proxies:', error);
      throw error;
    }
  }

  public async getAllTools(): Promise<MCPTool[]> {
    try {
      this.logger.info('Getting tools from all upstream servers');
      
      const allTools: MCPTool[] = [];

      // Get Meta Ads tools
      try {
        const metaAdsTools = await this.metaAdsProxy.getTools();
        allTools.push(...metaAdsTools);
        this.logger.info(`Got ${metaAdsTools.length} Meta Ads tools`);
      } catch (error) {
        this.logger.warn('Failed to get Meta Ads tools:', error);
      }

      // Get PostgreSQL tools
      try {
        const postgresTools = await this.postgresProxy.getTools();
        allTools.push(...postgresTools);
        this.logger.info(`Got ${postgresTools.length} PostgreSQL tools`);
      } catch (error) {
        this.logger.warn('Failed to get PostgreSQL tools:', error);
      }

      // Add gateway-specific tools
      allTools.push({
        name: 'get_company_profile',
        description: 'Get company profile data from the gateway database',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'string',
              description: 'Company ID to retrieve profile for'
            }
          },
          required: ['companyId']
        }
      });

      allTools.push({
        name: 'update_company_profile',
        description: 'Update company profile data in the gateway database',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'string',
              description: 'Company ID to update'
            },
            profileData: {
              type: 'object',
              description: 'Profile data to update'
            }
          },
          required: ['companyId', 'profileData']
        }
      });

      allTools.push({
        name: 'delete_company_profile',
        description: 'Delete company profile data from the gateway database',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'string',
              description: 'Company ID to delete'
            }
          },
          required: ['companyId']
        }
      });

      allTools.push({
        name: 'list_company_profiles',
        description: 'List all company profiles in the gateway database',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of profiles to return (default: 50)'
            },
            offset: {
              type: 'number',
              description: 'Number of profiles to skip (default: 0)'
            }
          }
        }
      });

      this.logger.info(`Total tools available: ${allTools.length}`);
      return allTools;
    } catch (error) {
      this.logger.error('Error getting all tools:', error);
      return [];
    }
  }

  public async callTool(toolCall: MCPToolCall, userId: string): Promise<MCPToolResult> {
    try {
      // Check rate limiting
      const rateLimitResult = await this.checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        return {
          content: [{
            type: 'text',
            text: `Rate limit exceeded. Try again in ${rateLimitResult.resetTime} seconds.`
          }],
          isError: true
        };
      }

      this.logger.info(`Calling tool: ${toolCall.name} for user: ${userId}`);
      
      // Route tool call to appropriate upstream
      if (toolCall.name.startsWith('ads.')) {
        return await this.metaAdsProxy.callTool(toolCall, userId);
      } else if (toolCall.name.startsWith('pg.')) {
        return await this.callPostgresTool(toolCall, userId);
      } else {
        // Handle gateway-specific tools
        return await this.callGatewayTool(toolCall, userId);
      }
    } catch (error) {
      this.logger.error('Error calling tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error calling tool: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async callPostgresTool(toolCall: MCPToolCall, userId: string): Promise<MCPToolResult> {
    try {
      return await this.postgresProxy.callTool(toolCall, userId);
    } catch (error) {
      this.logger.error('Error calling PostgreSQL tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error calling PostgreSQL tool: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async callGatewayTool(toolCall: MCPToolCall, userId: string): Promise<MCPToolResult> {
    // Handle gateway-specific tools like company profile management
    switch (toolCall.name) {
      case 'get_company_profile':
        return await this.getCompanyProfile(toolCall.arguments.companyId);
      case 'update_company_profile':
        return await this.updateCompanyProfile(toolCall.arguments.companyId, toolCall.arguments.profileData);
      case 'delete_company_profile':
        return await this.deleteCompanyProfile(toolCall.arguments.companyId);
      case 'list_company_profiles':
        return await this.listCompanyProfiles(toolCall.arguments.limit, toolCall.arguments.offset);
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown gateway tool: ${toolCall.name}`
          }],
          isError: true
        };
    }
  }

  private async getCompanyProfile(companyId: string): Promise<MCPToolResult> {
    try {
      // Get company profile from Redis cache first
      const cachedProfile = await this.redis.get(`company:${companyId}`);
      
      if (cachedProfile) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...JSON.parse(cachedProfile),
              source: 'cache'
            }, null, 2)
          }]
        };
      }

      // Get from database using PostgreSQL proxy
      const profile = await this.postgresProxy.getCompanyProfile(companyId);
      
      if (profile) {
        // Cache the profile for 1 hour
        await this.redis.setex(`company:${companyId}`, 3600, JSON.stringify(profile.jsonData));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              companyId: profile.companyId,
              ...profile.jsonData,
              updatedAt: profile.updatedAt,
              source: 'database'
            }, null, 2)
          }]
        };
      }

      // Return default profile if not found
      const defaultProfile = {
        companyId,
        name: 'New Company',
        industry: 'Not specified',
        description: 'Company profile not yet configured',
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en'
        },
        createdAt: new Date().toISOString(),
        source: 'default'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(defaultProfile, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error('Error getting company profile:', error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving company profile: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async updateCompanyProfile(companyId: string, profileData: any): Promise<MCPToolResult> {
    try {
      // Prepare the profile data
      const updatedProfile = {
        companyId,
        jsonData: {
          ...profileData,
          updatedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      };

      // Save to database using PostgreSQL proxy
      await this.postgresProxy.saveCompanyProfile(updatedProfile);

      // Update cache
      await this.redis.setex(`company:${companyId}`, 3600, JSON.stringify(updatedProfile.jsonData));

      this.logger.info(`Updated company profile for: ${companyId}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Company profile updated successfully',
            companyId,
            updatedAt: updatedProfile.updatedAt
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error('Error updating company profile:', error);
      return {
        content: [{
          type: 'text',
          text: `Error updating company profile: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async deleteCompanyProfile(companyId: string): Promise<MCPToolResult> {
    try {
      // Delete from database using PostgreSQL proxy
      const deleted = await this.postgresProxy.deleteCompanyProfile(companyId);

      if (deleted) {
        // Remove from cache
        await this.redis.del(`company:${companyId}`);
        
        this.logger.info(`Deleted company profile for: ${companyId}`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Company profile deleted successfully',
              companyId
            }, null, 2)
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: 'Company profile not found',
              companyId
            }, null, 2)
          }]
        };
      }
    } catch (error) {
      this.logger.error('Error deleting company profile:', error);
      return {
        content: [{
          type: 'text',
          text: `Error deleting company profile: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async listCompanyProfiles(limit: number = 50, offset: number = 0): Promise<MCPToolResult> {
    try {
      // Get profiles from database using PostgreSQL proxy
      const profiles = await this.postgresProxy.listCompanyProfiles(limit, offset);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: profiles.length,
            limit,
            offset,
            profiles: profiles.map(profile => ({
              companyId: profile.companyId,
              ...profile.jsonData,
              updatedAt: profile.updatedAt
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error('Error listing company profiles:', error);
      return {
        content: [{
          type: 'text',
          text: `Error listing company profiles: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async checkRateLimit(userId: string): Promise<{ allowed: boolean; resetTime?: number }> {
    try {
      const key = `rate_limit:${userId}`;
      const windowMs = this.config.get('RATE_LIMIT_WINDOW_MS');
      const maxRequests = this.config.get('RATE_LIMIT_MAX_REQUESTS');
      
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        // First request in window, set expiration
        await this.redis.pexpire(key, windowMs);
      }
      
      if (current > maxRequests) {
        const ttl = await this.redis.pttl(key);
        return {
          allowed: false,
          resetTime: Math.ceil(ttl / 1000)
        };
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Error checking rate limit:', error);
      // Allow request if rate limiting fails
      return { allowed: true };
    }
  }

  public async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down upstream proxies');
      await Promise.all([
        this.metaAdsProxy.shutdown(),
        this.postgresProxy.shutdown()
      ]);
      await this.redis.quit();
      this.logger.info('All upstream proxies shut down');
    } catch (error) {
      this.logger.error('Error shutting down upstream proxies:', error);
    }
  }
}

