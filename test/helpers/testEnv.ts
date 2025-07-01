/**
 * Test Environment Setup
 *
 * Provides minimal environment variables required for testing.
 * Called before importing any application code that validates environment.
 */

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'http://localhost:3000';
process.env.FACEBOOK_APP_ID = 'test_app_id';
process.env.FACEBOOK_APP_SECRET = 'test_app_secret';
process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3000/oauth/callback';

// Valid Ed25519 test keys (for testing only, never use in production)
process.env.JWT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIO73F+04D73j9H2Ch8SE26kNy4MfYhuM1QPYabSAkM40
-----END PRIVATE KEY-----`;

process.env.JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1HXN+GFe0b7bxdSDcMjGhsc6c7OqrvPMlWrAvuuASbQ=
-----END PUBLIC KEY-----`;

// DATABASE_URL will be set by testcontainers setup - set a placeholder to pass validation
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

// Other optional variables will use their defaults

export {}; // Make this a module
