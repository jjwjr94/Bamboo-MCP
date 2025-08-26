import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyExpress from '@fastify/express';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { createMCPAuthRouter, createMCPOAuthProvider } from './auth/mcpOAuthSetup.js';
import { closeDatabase, db, testConnection } from './db/client.js';
import { creativeAssetUploads } from './db/schema.js';
import { CoreServices } from './mcp/coreServices.js';
import { setupMCPHttpTransport } from './mcp/http.js';
import { MetaToolsHandler } from './tools/meta/toolsHandler.js';
import { env } from './utils/env.js';
import { ValidationError } from './utils/errors.js';
import { logger } from './utils/logger.js';

import {
  categorizeUploadError,
  renderServerErrorPage,
  renderUploadFailedPage,
  renderUploadFormPage,
  renderUploadInProgressPage,
  renderUploadSessionNotFoundPage,
  renderUploadSuccessPage,
} from './utils/uploadTemplates.js';

// Global unhandled promise rejection handler for process resilience
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // For a server, it's often better to log and let a process manager restart it
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Upload template utilities have been extracted to src/utils/uploadTemplates.ts

export async function build(opts = {}) {
  const app = Fastify({
    // logger: true,
    logger: {
      level: 'debug',
    },
    requestTimeout: env.FASTIFY_REQUEST_TIMEOUT,
    connectionTimeout: env.FASTIFY_CONNECTION_TIMEOUT,
    ...opts,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow stylesheets from self only. External CSS moved to self-hosted Bamboo UI.
        styleSrc: ["'self'"],
        // Allow inline style attributes for dynamic styling and template styles
        styleSrcAttr: ["'unsafe-inline'"],
        // Allow scripts from self only. All scripts are now external files for CSP compliance.
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        // Explicitly prevent object/plugin execution for defense-in-depth
        objectSrc: ["'none'"],
        // Prevent clickjacking by disallowing the page to be framed.
        frameAncestors: ["'none'"],
        // Ensure forms can only be submitted to our own origin.
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(fastifyExpress);

  // Configure trust proxy for Render hosting (single proxy hop)
  app.express.set('trust proxy', 1);

  await app.register(fastifyStatic, {
    root: join(__dirname, '../public'),
    prefix: '/',
    decorateReply: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1h',
    setHeaders: (res, _pathName) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.length === 0) {
    logger.error(
      'CRITICAL: ALLOWED_ORIGINS environment variable is not defined for production. Server is shutting down.'
    );
    process.exit(1);
  }

  // CORS configuration
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Cache-Control',
    ],
  });

  await app.register(formbody);
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_FILE_SIZE,
      files: 1,
    },
  });

  // Database connection test
  try {
    await testConnection();
    logger.info('Database connection successful');
  } catch (error) {
    logger.error('Database connection failed:', error);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // Initialize core services
  const coreServices = new CoreServices();
  const toolsHandler = new MetaToolsHandler();

  // Setup MCP HTTP transport
  await setupMCPHttpTransport(app, coreServices, toolsHandler);

  // Health check endpoint
  app.get('/health', async (request, reply) => {
    const dbStatus = await testConnection()
      .then(() => 'connected')
      .catch(() => 'disconnected');

    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
      service: 'Bamboo MCP Gateway',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: env.NODE_ENV,
      database: dbStatus,
      transport: 'streamable-http',
      authentication: 'meta-token-direct'
    });
  });

  // Root endpoint
  app.get('/', async (request, reply) => {
    return reply.send({
      name: 'Bamboo MCP Gateway',
      version: env.APP_VERSION,
      description: 'MCP Gateway for Meta Ads with comprehensive API coverage',
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp',
        manifest: '/manifest',
        health: '/health'
      },
      authentication: {
        type: 'bearer',
        description: 'Use your Meta access token as Bearer token',
        howToGetToken: 'Create a Meta app at developers.facebook.com and generate an access token'
      }
    });
  });

  // MCP Manifest endpoint
  app.get('/manifest', async (request, reply) => {
    return reply.send({
      version: env.APP_VERSION,
      name: 'Bamboo MCP Gateway',
      description: 'Comprehensive MCP Gateway for Meta Ads with 39+ tools',
      author: {
        name: 'Jay Wong',
        email: 'jay@example.com'
      },
      license: 'MIT',
      homepage: 'https://github.com/jjwjr94/Bamboo-MCP',
      capabilities: {
        tools: 39, // All Meta Ads tools
        resources: ['meta_ads_schema', 'company_context']
      },
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp'
      }
    });
  });

  return app;
}

// Start the server
async function start() {
  try {
    const app = await build();
    const port = env.PORT || 8443;
    const host = env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    logger.info(`🚀 Bamboo MCP Gateway is running on port ${port}`);
    logger.info(`📡 MCP Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    logger.info(`📋 MCP Manifest: http://localhost:${port}/manifest`);
    logger.info(`🏥 Health check: http://localhost:${port}/health`);
    logger.info('');
    logger.info('🔧 Configuration:');
    logger.info('   - Transport: HTTP Streamable (MCP 2025-06-18)');
    logger.info('   - Authentication: Meta access token (Bearer)');
    logger.info('   - Tools: 39+ Meta Ads API tools');
    logger.info('   - CORS: Enabled for configured origins');
    logger.info('');
    logger.info('📖 How to use with n8n:');
    logger.info('   1. Get Meta access token from developers.facebook.com');
    logger.info('   2. In n8n MCP Client Tool:');
    logger.info(`      - Endpoint: http://localhost:${port}/mcp`);
    logger.info('      - Authentication: Bearer');
    logger.info('      - Token: [Your Meta access token]');

  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export default build;

