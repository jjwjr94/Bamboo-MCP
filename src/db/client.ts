import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema.js';

// FIX: Remove prepare property as it's not supported in the current version
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT * 1000,
  connectionTimeoutMillis: env.DB_POOL_CONNECT_TIMEOUT * 1000,
  maxLifetimeSeconds: env.DB_POOL_MAX_LIFETIME,
  statement_timeout: env.DB_STATEMENT_TIMEOUT,
});

export const db = drizzle(pool, { schema, logger: false });

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withUserContext<T>(
  userId: string,
  callback: (tx: DatabaseTransaction) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);

    logger.dbOperation('SET_USER_CONTEXT', 'session', true, 0);

    return await callback(tx);
  });
}

export const testConnection = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
};

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
