import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { env } from './src/utils/env.js';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
  // Enable role management for RLS policies
  entities: {
    roles: true, // Manage custom application roles
  },
});
