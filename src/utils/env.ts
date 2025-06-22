import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Database (Direct PostgreSQL connection)
  DATABASE_URL: z.string().url(),

  // OAuth Refresh Token Configuration
  OAUTH_REFRESH_TOKEN_EXPIRATION_DAYS: z.string().transform(Number).default('90'),

  // Facebook OAuth
  FACEBOOK_APP_ID: z.string(),
  FACEBOOK_APP_SECRET: z.string(),
  FACEBOOK_CALLBACK_URL: z.string().url(),
  META_API_VERSION: z.string().default('v22.0'),

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

  // Database Connection Pool Configuration
  DB_POOL_MAX: z.string().transform(Number).default('10'),
  DB_POOL_IDLE_TIMEOUT: z.string().transform(Number).default('30'),
  DB_POOL_MAX_LIFETIME: z.string().transform(Number).default('900'), // 15 minutes in seconds
  DB_POOL_CONNECT_TIMEOUT: z.string().transform(Number).default('10'),

  // Timeout Configurations
  META_API_TIMEOUT: z.string().transform(Number).default('15000'),
  DB_STATEMENT_TIMEOUT: z.string().transform(Number).default('10000'),

  // Server Timeout Configurations
  FASTIFY_REQUEST_TIMEOUT: z.string().transform(Number).default('60000'),
  FASTIFY_CONNECTION_TIMEOUT: z.string().transform(Number).default('60000'),

  // Upload-Specific Timeout Configurations
  // These timeouts are designed for image/video upload endpoints that tunnel to Meta API
  // Regular endpoints should use FASTIFY_REQUEST_TIMEOUT (60s) for security
  // Upload endpoints should override with FASTIFY_UPLOAD_REQUEST_TIMEOUT (10min) per route
  // Example usage:
  //   fastify.route({
  //     method: 'POST', url: '/mcp/upload',
  //     handler: async (request, reply) => {
  //       request.raw.setTimeout(env.FASTIFY_UPLOAD_REQUEST_TIMEOUT);
  //       // handle upload with extended timeout
  //     }
  //   });
  FASTIFY_UPLOAD_REQUEST_TIMEOUT: z.string().transform(Number).default('600000'),
  FASTIFY_UPLOAD_CONNECTION_TIMEOUT: z.string().transform(Number).default('600000'),
  META_UPLOAD_TIMEOUT: z.string().transform(Number).default('480000'),
  META_UPLOAD_CHUNK_SIZE: z.string().transform(Number).default('4194304'),

  // MCP Configuration
  // The total time (in milliseconds) allowed for an entire MCP tool request to complete.
  // This must be long enough to accommodate complex operations involving multiple
  // sequential API calls, such as pagination over large datasets or batch processing.
  // Set to 60 seconds to provide a safe buffer for tools like get_ad_accounts,
  // get_ad_insights, and other operations that may require multiple API round-trips.
  MCP_REQUEST_TIMEOUT: z.string().transform(Number).default('60000'),

  // Circuit Breaker & Retry Configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.string().transform(Number).default('5'),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.string().transform(Number).default('30000'),
  RETRY_MAX_ATTEMPTS: z.string().transform(Number).default('3'),
  RETRY_BASE_DELAY: z.string().transform(Number).default('1000'),
  RETRY_MAX_DELAY: z.string().transform(Number).default('10000'),

  // Safety Limits
  META_MAX_BATCH_SIZE: z.string().transform(Number).default('50'),
  META_MAX_CAMPAIGNS_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_ADS_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_ADSETS_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_CREATIVES_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_INSIGHTS_TO_FETCH: z.string().transform(Number).default('10000'),
  META_MAX_AD_ACCOUNTS_TO_FETCH: z.string().transform(Number).default('100'),
  META_MAX_BUSINESS_USERS_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_BUSINESS_ACCOUNTS_TO_FETCH: z.string().transform(Number).default('100'),
  META_MAX_AUDIENCES_TO_FETCH: z.string().transform(Number).default('1000'),
  META_MAX_PAGES_TO_FETCH: z.string().transform(Number).default('100'),
  META_MAX_POSTS_TO_FETCH: z.string().transform(Number).default('500'),
  META_MAX_ADS_ARCHIVE_TO_FETCH: z.string().transform(Number).default('5000'),
  MAX_RECURSION_DEPTH: z.string().transform(Number).default('20'),
  MAX_REDACTION_DEPTH: z.string().transform(Number).default('20'),

  // Image fetching configuration
  IMAGE_FETCH_ENABLED: z
    .string()
    .transform((val) => val !== 'false')
    .default('true'),
  IMAGE_FETCH_TIMEOUT_MS: z.string().transform(Number).default('10000'),
  IMAGE_MAX_SIZE_BYTES: z.string().transform(Number).default('2097152'), // 2MB
});

export const env = envSchema.parse(process.env);
