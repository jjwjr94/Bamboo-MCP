import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable globals for describe, it, expect without imports
    globals: true,

    // Use node environment for server-side testing
    environment: 'node',

    // Include test files
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'test/fixtures/**'],

    // Global setup for testcontainers
    globalSetup: ['test/setup.ts'],

    // Longer timeout for container startup and database operations
    testTimeout: 30000,
    hookTimeout: 30000,

    // Enable test isolation to prevent cross-test contamination
    isolate: true,

    // Enable coverage with v8
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/auth/**/*.ts',
        'src/tools/meta/**/*.ts',
        'src/utils/**/*.ts',
        'src/mcp/**/*.ts',
      ],
      exclude: ['src/**/*.d.ts', 'src/generated/**/*', 'src/**/*.test.ts'],
      // Focus on critical paths
      thresholds: {
        'src/auth/': { branches: 85, functions: 90, lines: 85 },
        'src/tools/meta/adAccountHandler.ts': { branches: 80, functions: 85, lines: 80 },
        'src/utils/metaErrorClassifier.ts': { branches: 90, functions: 95, lines: 90 },
      },
    },

    // Environment variables for debugging
    env: {
      DEBUG: 'testcontainers*',
    },

    // Mock reset for clean test state
    mockReset: true,
    restoreMocks: true,

    // Disable watch mode by default - tests should run once and exit
    watch: false,

    // Force single-threaded execution to prevent database deadlocks.
    // Integration tests share a single PostgreSQL container, so concurrent
    // workers can create lock contention and deadlocks. Running sequentially
    // ensures deterministic test execution and eliminates race conditions.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
  },

  // Path aliases for clean imports
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
    },
  },
});
