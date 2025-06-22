import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Global container instance attached to globalThis for 2025 best practices
declare global {
  var __TEST_CONTAINER__: StartedPostgreSqlContainer | undefined;
  var __TEST_DB_URL__: string | undefined;
}

/**
 * Global setup function called once before all tests
 * Follows 2025 best practices for testcontainers with vitest
 */
export async function setup() {
  console.info('🚀 Starting PostgreSQL test container...');

  try {
    // Start PostgreSQL container with optimal settings
    const container = await new PostgreSqlContainer('postgres:15')
      .withDatabase('bamboo_test')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(120_000) // 2 minutes max startup time
      .start();

    // Store container globally for access during teardown
    globalThis.__TEST_CONTAINER__ = container;

    // Set database URL for the application
    const dbUrl = container.getConnectionUri();
    globalThis.__TEST_DB_URL__ = dbUrl;
    process.env.DATABASE_URL = dbUrl;

    console.info('✅ PostgreSQL container started successfully');
    console.info(`📍 Container URL: ${dbUrl}`);

    // Setup database roles and run migrations
    console.info('🔄 Setting up database roles...');

    // Create setup client to initialize required roles
    const setupClient = postgres(dbUrl, { max: 1 });

    // Create the app_user role that exists in Supabase production
    await setupClient.unsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user;
        END IF;
      END
      $$;
    `);

    await setupClient.end();
    console.info('✅ Database roles created successfully');

    console.info('🔄 Running database migrations...');

    // Create migration client with single connection
    const migrationClient = postgres(dbUrl, { max: 1 });
    const migrationDb = drizzle(migrationClient);

    // Apply migrations from the actual migrations folder
    await migrate(migrationDb, {
      migrationsFolder: './src/db/migrations',
    });

    // Close migration client
    await migrationClient.end();

    console.info('✅ Database migrations completed successfully');

    // Verify connection works
    const testClient = postgres(dbUrl, { max: 1 });
    const testDb = drizzle(testClient);

    // Simple verification query to ensure database connection works
    await testDb.execute(sql`SELECT 1 as test`);
    console.info('✅ Database connection verified');

    await testClient.end();
  } catch (error) {
    console.error('❌ Failed to set up test environment:', error);
    throw error;
  }
}

/**
 * Global teardown function called once after all tests
 * Ensures clean container shutdown
 */
export async function teardown() {
  if (globalThis.__TEST_CONTAINER__) {
    console.info('🧹 Stopping PostgreSQL test container...');

    try {
      await globalThis.__TEST_CONTAINER__.stop();
      console.info('✅ PostgreSQL container stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping container:', error);
      // Don't throw to avoid masking test failures
    }

    // Clean up global references
    globalThis.__TEST_CONTAINER__ = undefined;
    globalThis.__TEST_DB_URL__ = undefined;
    process.env.DATABASE_URL = undefined;
  }
}
