import Joi from 'joi';
import { GatewayConfig } from '../types';

export class ConfigService {
  private static instance: ConfigService;
  private config: Map<string, any> = new Map();

  private constructor() {
    this.loadConfig();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private loadConfig(): void {
    // Load all environment variables
    this.config.set('PORT', parseInt(process.env.PORT || '8443'));
    this.config.set('NODE_ENV', process.env.NODE_ENV || 'development');
    this.config.set('DATABASE_URL', process.env.DATABASE_URL);
    this.config.set('REDIS_URL', process.env.REDIS_URL);
    this.config.set('JWT_SECRET', process.env.JWT_SECRET);
    this.config.set('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN || '24h');
    this.config.set('FACEBOOK_APP_ID', process.env.FACEBOOK_APP_ID);
    this.config.set('FACEBOOK_APP_SECRET', process.env.FACEBOOK_APP_SECRET);
    this.config.set('FACEBOOK_CALLBACK_URL', process.env.FACEBOOK_CALLBACK_URL);
    this.config.set('RATE_LIMIT_WINDOW_MS', parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'));
    this.config.set('RATE_LIMIT_MAX_REQUESTS', parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60'));
    this.config.set('PIPEBOARD_API_TOKEN', process.env.PIPEBOARD_API_TOKEN);
    this.config.set('CORS_ORIGIN', process.env.CORS_ORIGIN);
    this.config.set('LOG_LEVEL', process.env.LOG_LEVEL || 'info');
    this.config.set('META_ADS_MCP_COMMAND', process.env.META_ADS_MCP_COMMAND || 'uvx');
    this.config.set('META_ADS_MCP_ARGS', process.env.META_ADS_MCP_ARGS || 'meta-ads-mcp');
    this.config.set('POSTGRES_MCP_COMMAND', process.env.POSTGRES_MCP_COMMAND || 'postgres-mcp');
  }

  public get(key: string): any {
    return this.config.get(key);
  }

  public set(key: string, value: any): void {
    this.config.set(key, value);
  }

  public async validate(): Promise<void> {
    const schema = Joi.object({
      PORT: Joi.number().port().required(),
      NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
      DATABASE_URL: Joi.string().uri().required(),
      REDIS_URL: Joi.string().uri().required(),
      JWT_SECRET: Joi.string().min(32).required(),
      JWT_EXPIRES_IN: Joi.string().required(),
      FACEBOOK_APP_ID: Joi.string().required(),
      FACEBOOK_APP_SECRET: Joi.string().required(),
      FACEBOOK_CALLBACK_URL: Joi.string().uri().required(),
      RATE_LIMIT_WINDOW_MS: Joi.number().positive().required(),
      RATE_LIMIT_MAX_REQUESTS: Joi.number().positive().required(),
      PIPEBOARD_API_TOKEN: Joi.string().optional(),
      CORS_ORIGIN: Joi.string().optional(),
      LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
      META_ADS_MCP_COMMAND: Joi.string().required(),
      META_ADS_MCP_ARGS: Joi.string().required(),
      POSTGRES_MCP_COMMAND: Joi.string().required()
    });

    const configObject = Object.fromEntries(this.config);
    const { error } = schema.validate(configObject);

    if (error) {
      throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }
  }

  public getGatewayConfig(): GatewayConfig {
    return {
      port: this.get('PORT'),
      upstreams: [
        {
          name: 'meta-ads',
          type: 'meta-ads',
          prefix: 'ads.',
          process: {
            command: this.get('META_ADS_MCP_COMMAND'),
            args: [this.get('META_ADS_MCP_ARGS')],
            env: {
              PIPEBOARD_API_TOKEN: this.get('PIPEBOARD_API_TOKEN')
            }
          }
        },
        {
          name: 'postgres',
          type: 'postgres',
          prefix: 'pg.',
          process: {
            command: this.get('POSTGRES_MCP_COMMAND'),
            args: ['--access-mode=unrestricted'],
            env: {
              DATABASE_URI: this.get('DATABASE_URL')
            }
          }
        }
      ],
      auth: {
        jwt: {
          secret: this.get('JWT_SECRET'),
          expiresIn: this.get('JWT_EXPIRES_IN')
        },
        facebook: {
          appId: this.get('FACEBOOK_APP_ID'),
          appSecret: this.get('FACEBOOK_APP_SECRET'),
          callbackUrl: this.get('FACEBOOK_CALLBACK_URL')
        }
      },
      database: {
        url: this.get('DATABASE_URL')
      },
      redis: {
        url: this.get('REDIS_URL')
      },
      rateLimit: {
        windowMs: this.get('RATE_LIMIT_WINDOW_MS'),
        max: this.get('RATE_LIMIT_MAX_REQUESTS')
      }
    };
  }
}

