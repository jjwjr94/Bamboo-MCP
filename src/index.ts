import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyExpress from '@fastify/express';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { createMCPAuthRouter, createMCPOAuthProvider } from './auth/mcpOAuthSetup.js';
import { closeDatabase, db, testConnection } from './db/client.js';
import { creativeAssetUploads } from './db/schema.js';
import {
  AI_COPY_SCRIPT_HASH,
  CLOSE_BUTTON_SCRIPT_HASH,
  RELOAD_BUTTON_SCRIPT_HASH,
  TRY_AGAIN_BUTTON_SCRIPT_HASH,
  UPLOAD_FORM_SCRIPT_HASH,
} from './generated/cspHashes.js';
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
        // Allow scripts from self plus specific, trusted inline scripts via hashes.
        scriptSrc: [
          "'self'",
          UPLOAD_FORM_SCRIPT_HASH, // Hash for upload form script
          AI_COPY_SCRIPT_HASH, // Hash for AI copy functionality
          CLOSE_BUTTON_SCRIPT_HASH, // Hash for close button script
          TRY_AGAIN_BUTTON_SCRIPT_HASH, // Hash for try again button script
          RELOAD_BUTTON_SCRIPT_HASH, // Hash for reload button script
        ],
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

  // Validate that ALLOWED_ORIGINS is set in production.
  if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.length === 0) {
    logger.error(
      'CRITICAL: ALLOWED_ORIGINS environment variable is not defined for production. Server is shutting down.'
    );
    process.exit(1);
  }

  // Log a warning if no origins are set in a non-production environment.
  if (env.ALLOWED_ORIGINS.length === 0) {
    logger.warn(
      'SECURITY_RISK: No ALLOWED_ORIGINS defined. CORS is set to permissive mode. This is insecure for production.'
    );
  }

  app.register(cors, {
    // If origins are defined, use them. Otherwise, fall back to permissive mode in non-production.
    origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : env.NODE_ENV !== 'production',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 4 * 1024 * 1024 * 1024, // 4GB limit for creative assets (Meta's max video size)
      files: 1, // Only allow one file per upload
    },
  });

  app.get('/health', async (_request, reply) => {
    const dbConnected = await testConnection();

    const healthStatus = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      database: dbConnected ? 'connected' : 'disconnected',
      mcp: 'ready',
    };

    if (!dbConnected) {
      return reply.status(503).send(healthStatus);
    }

    return reply.send(healthStatus);
  });

  app.get('/oauth/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state parameter' });
    }

    const provider = createMCPOAuthProvider();
    const result = await provider.handleCallback(code, state);

    if (result.success) {
      return reply.redirect(result.redirectUrl);
    }

    logger.error('OAuth callback failed', { error: result.error });
    return reply.status(400).send({ error: result.error || 'OAuth callback failed' });
  });

  // Initialize CoreServices once at startup
  const coreServices = await CoreServices.initialize();
  logger.info('CoreServices initialized for HTTP transport');

  // Initialize the MetaToolsHandler for upload processing
  const metaToolsHandler = new MetaToolsHandler();

  // Pass the CoreServices instance to the transport setup
  setupMCPHttpTransport(app, coreServices);

  // Auth routes
  const mcpAuthRouter = createMCPAuthRouter();
  app.use('/', mcpAuthRouter);

  // Creative asset upload endpoints

  /**
   * GET endpoint: Serves appropriate HTML pages based on upload session state
   * This endpoint validates the uploadId and serves different pages based on status:
   * - pending/failed: upload form (allows retry)
   * - uploading: progress page with 409 status
   * - completed: success page
   * - expired/not found: 404 page
   * Security is provided by the unguessable UUID
   */
  app.get('/v1/assets/upload/:uploadId', async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };

    try {
      const uploadRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, uploadId),
      });

      // 1. Handle non-existent or expired sessions first (404)
      if (!uploadRecord || new Date() > uploadRecord.expiresAt) {
        logger.warn('Upload session not found or expired', { uploadId });
        return reply.status(404).type('text/html').send(renderUploadSessionNotFoundPage());
      }

      // 2. Handle different states with a switch statement
      switch (uploadRecord.status) {
        case 'pending':
        case 'failed':
          // Show upload form for pending and failed states to allow retry
          return reply.type('text/html').send(renderUploadFormPage(uploadId));

        case 'uploading':
          // Show a "blocked" page if an upload is in progress (409 Conflict)
          return reply.status(409).type('text/html').send(renderUploadInProgressPage());

        case 'completed':
          // Show success page if already completed
          if (!uploadRecord.metaAssetId || uploadRecord.assetType === 'pending') {
            const errorMessage = `The upload record is in an inconsistent state. Please contact support and provide this ID: ${uploadId}.`;
            logger.error('Inconsistent "completed" state for upload record', { uploadId });
            return reply.status(500).type('text/html').send(renderServerErrorPage(errorMessage));
          }
          return reply.type('text/html').send(
            renderUploadSuccessPage({
              uploadId,
              assetType: uploadRecord.assetType,
              metaAssetId: uploadRecord.metaAssetId,
            })
          );

        default:
          // Fallback for any other unexpected status
          logger.error('Unknown upload status encountered', {
            uploadId,
            status: uploadRecord.status,
          });
          return reply.status(404).type('text/html').send(renderUploadSessionNotFoundPage());
      }
    } catch (error) {
      logger.error('Failed to serve upload page', { uploadId, error });
      return reply.status(500).type('text/html').send(renderServerErrorPage());
    }
  });

  /**
   * POST endpoint: Handles file upload without JWT authentication
   * Security is maintained through the unguessable uploadId and database constraints
   */
  app.post(
    '/v1/assets/upload/:uploadId',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { uploadId } = request.params as { uploadId: string };

      try {
        // Set extended timeout for uploads
        request.raw.setTimeout(env.FASTIFY_UPLOAD_REQUEST_TIMEOUT);

        // Validate uploaded file
        const data = await request.file();
        if (!data) {
          throw new ValidationError('No file uploaded');
        }

        // Delegate to the handler (no JWT auth required - gets userId from uploadId)
        const result = await metaToolsHandler.handleCreativeAssetUpload(uploadId, data);

        logger.info('File upload successful', {
          uploadId,
          assetType: result.assetType,
          metaAssetId: result.metaAssetId,
        });

        // Return success page
        return reply.type('text/html').send(
          renderUploadSuccessPage({
            uploadId,
            assetType: result.assetType,
            metaAssetId: result.metaAssetId,
          })
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'File upload failed';
        const { errorCategory, troubleshootingSteps } = categorizeUploadError(errorMessage);

        logger.error('File upload failed', {
          uploadId,
          error: errorMessage,
          category: errorCategory,
        });

        const statusCode = error instanceof ValidationError ? 400 : 500;

        return reply
          .status(statusCode)
          .type('text/html')
          .send(renderUploadFailedPage(errorCategory, errorMessage, troubleshootingSteps));
      }
    }
  );

  app.setErrorHandler(async (error, request, reply) => {
    logger.error('Unhandled request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    return reply.status(500).send({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
    });
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);

    try {
      await app.close();
      coreServices.destroy();
      await closeDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown error', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const start = async () => {
    try {
      const app = await build();
      const address = await app.listen({
        port: env.PORT,
        host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
      });

      logger.info('Server started', {
        address,
        env: env.NODE_ENV,
        version: '0.1.0',
      });
    } catch (error) {
      logger.error('Server start failed', { error });
      process.exit(1);
    }
  };

  start();
}
