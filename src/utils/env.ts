import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Database (Direct PostgreSQL connection)
  DATABASE_URL: z.string().url(),

  // Facebook OAuth
  FACEBOOK_APP_ID: z.string(),
  FACEBOOK_APP_SECRET: z.string(),
  FACEBOOK_CALLBACK_URL: z.string().url(),

  // OAuth Scopes (comprehensive Meta API access)
  FACEBOOK_OAUTH_SCOPES: z
    .string()
    .default(
      'ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read'
    ),

  // JWT - EdDSA (Ed25519) asymmetric keys only
  JWT_PRIVATE_KEY: z
    .string()
    .regex(
      /^-----BEGIN PRIVATE KEY-----[\s\r\n]+([A-Za-z0-9+/=\s\r\n]+)[\s\r\n]+-----END PRIVATE KEY-----[\s\r\n]*$/,
      'JWT_PRIVATE_KEY must be a valid Ed25519 private key in PEM format'
    ),
  JWT_PUBLIC_KEY: z
    .string()
    .regex(
      /^-----BEGIN PUBLIC KEY-----[\s\r\n]+([A-Za-z0-9+/=\s\r\n]+)[\s\r\n]+-----END PUBLIC KEY-----[\s\r\n]*$/,
      'JWT_PUBLIC_KEY must be a valid Ed25519 public key in PEM format'
    ),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Server
  BASE_URL: z.string().url(),

  // Timeout Configurations
  META_API_TIMEOUT: z.string().transform(Number).default('15000'),
  DB_STATEMENT_TIMEOUT: z.string().transform(Number).default('10000'),

  // MCP Configuration
  MCP_REQUEST_TIMEOUT: z.string().transform(Number).default('30000'),

  // Circuit Breaker & Retry Configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.string().transform(Number).default('5'),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.string().transform(Number).default('30000'),
  RETRY_MAX_ATTEMPTS: z.string().transform(Number).default('3'),
  RETRY_BASE_DELAY: z.string().transform(Number).default('1000'),
  RETRY_MAX_DELAY: z.string().transform(Number).default('10000'),
});

export const env = envSchema.parse(process.env);
