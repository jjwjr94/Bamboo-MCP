import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema.js';

// Direct PostgreSQL connection with Drizzle ORM
// prepare: false is required for Supabase connection pooling
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 10, // Connection pool size
  onnotice: () => {}, // Suppress notices

  // Production-ready timeout configurations
  idle_timeout: 30, // Close idle connections after 30 seconds
  max_lifetime: 60 * 15, // Retire connections after 15 minutes
  connect_timeout: 10, // Connection timeout in seconds

  // Set statement timeout at the PostgreSQL level
  connection: {
    statement_timeout: env.DB_STATEMENT_TIMEOUT,
  },
});

export const db = drizzle(client, { schema });

// Derive the correct transaction type from the db.transaction callback to avoid using `any`
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Helper function to execute database operations with user context
// Uses transactions to safely set the user context for RLS (Row Level Security)
export const withUserContext = async <T>(
  userId: string,
  operation: (tx: DbTransaction) => Promise<T>
): Promise<T> => {
  return db.transaction(async (tx) => {
    // Use set_config() instead of SET LOCAL for custom variables
    // This works in both standard PostgreSQL and Supabase
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    logger.dbOperation('SET_USER_CONTEXT', 'session', true, 0);

    // Execute the user operation within the scoped transaction
    return await operation(tx);
  });
};

// Helper function to test database connection
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
