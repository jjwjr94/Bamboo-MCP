import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema.js';

// prepare: false is required for Supabase connection pooling
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: env.DB_POOL_MAX,
  onnotice: () => {},

  idle_timeout: env.DB_POOL_IDLE_TIMEOUT,
  max_lifetime: env.DB_POOL_MAX_LIFETIME,
  connect_timeout: env.DB_POOL_CONNECT_TIMEOUT,

  connection: {
    statement_timeout: env.DB_STATEMENT_TIMEOUT,
  },
});

export const db = drizzle(client, { schema });

// Derive the correct transaction type from the db.transaction callback to avoid using `any`
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Uses transactions to safely set the user context for RLS (Row Level Security)
export const withUserContext = async <T>(
  userId: string,
  operation: (tx: DbTransaction) => Promise<T>
): Promise<T> => {
  return db.transaction(async (tx) => {
    // Use set_config() instead of SET LOCAL for compatibility with Supabase
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    logger.dbOperation('SET_USER_CONTEXT', 'session', true, 0);

    return await operation(tx);
  });
};

export const testConnection = async (): Promise<boolean> => {
  try {
    await client`SELECT 1`;
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
};

// Graceful shutdown
export const closeDatabase = async (): Promise<void> => {
  try {
    await client.end();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection', { error });
  }
};
