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
});

export const db = drizzle(client, { schema });

// Helper function to execute database operations with user context
// Uses transactions to safely set the user context for RLS (Row Level Security)
export const withUserContext = async <T>(
  userId: string,
  operation: (tx: any) => Promise<T>
): Promise<T> => {
  return db.transaction(async (tx) => {
    // SET LOCAL is transaction-scoped and safe for concurrent requests
    await tx.execute(sql`SET LOCAL app.current_user_id = ${userId}`);
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
