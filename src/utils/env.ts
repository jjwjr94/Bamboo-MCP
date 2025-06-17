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

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Server
  BASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
