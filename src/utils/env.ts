import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),

    // CORS Configuration
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .transform((val) => (val ? val.split(',').map((s) => s.trim()) : [])),

    // Server - conditionally required based on environment
    BASE_URL: z.string().url().optional(),

    // Additional properties for index.ts
    APP_VERSION: z.string().default('0.1.0'),
    HOST: z.string().default('0.0.0.0'),
    MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB

    // Optional: Database (only if you want to use it)
    DATABASE_URL: z.string().url().optional(),

    // Optional: Facebook OAuth (only if you want OAuth)
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    FACEBOOK_CALLBACK_URL: z.string().url().optional(),

    // Optional: JWT (only if you want JWT auth)
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default('24h'),

    // Meta API Configuration
    META_API_VERSION: z.string().default('v22.0'),
    META_API_TIMEOUT: z.string().transform(Number).default('15000'),

    // OAuth Scopes (optional)
    FACEBOOK_OAUTH_SCOPES: z
      .string()
      .default(
        'ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read'
      ),

    // OAuth Refresh Token Configuration (optional)
    OAUTH_REFRESH_TOKEN_EXPIRATION_DAYS: z.string().transform(Number).default('90'),

    // Database Connection Pool Configuration (optional)
    DB_POOL_MAX: z.string().transform(Number).default('10'),
    DB_POOL_IDLE_TIMEOUT: z.string().transform(Number).default('30'),
    DB_POOL_MAX_LIFETIME: z.string().transform(Number).default('900'), // 15 minutes in seconds
    DB_POOL_CONNECT_TIMEOUT: z.string().transform(Number).default('10'),

    // Timeout Configurations
    DB_STATEMENT_TIMEOUT: z.string().transform(Number).default('10000'),

    // Server Timeout Configurations
    FASTIFY_REQUEST_TIMEOUT: z.string().transform(Number).default('60000'),
    FASTIFY_CONNECTION_TIMEOUT: z.string().transform(Number).default('60000'),

    // Upload-Specific Timeout Configurations
    FASTIFY_UPLOAD_REQUEST_TIMEOUT: z.string().transform(Number).default('600000'),
    FASTIFY_UPLOAD_CONNECTION_TIMEOUT: z.string().transform(Number).default('600000'),
    META_UPLOAD_TIMEOUT: z.string().transform(Number).default('480000'),
    META_UPLOAD_CHUNK_SIZE: z.string().transform(Number).default('4194304'),

    // MCP Configuration
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
  })
  .superRefine((data, ctx) => {
    // Only require BASE_URL for non-test environments if OAuth is being used
    if (data.NODE_ENV !== 'test' && !data.BASE_URL && (data.FACEBOOK_APP_ID || data.FACEBOOK_APP_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'BASE_URL is required when using OAuth features.',
        path: ['BASE_URL'],
      });
    }
  });

export const env = envSchema.parse(process.env);

/**
 * Gets the BASE_URL with proper validation and error handling.
 * Throws a descriptive error if BASE_URL is required but not available.
 *
 * @param context - Description of where BASE_URL is being used (for better error messages)
 * @returns The BASE_URL as a string
 * @throws Error if BASE_URL is not available when required
 */
export function getRequiredBaseUrl(context: string): string {
  if (!env.BASE_URL) {
    throw new Error(
      `BASE_URL is required for ${context} but is not configured. Please set BASE_URL environment variable in non-test environments. Current NODE_ENV: ${env.NODE_ENV}`
    );
  }
  return env.BASE_URL;
}
