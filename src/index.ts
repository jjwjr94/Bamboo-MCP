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
import { CoreServices } from './mcp/coreServices.js';
import { setupMCPHttpTransport } from './mcp/http.js';
import { MetaToolsHandler } from './tools/meta/toolsHandler.js';
import { env } from './utils/env.js';
import { ValidationError } from './utils/errors.js';
import { logger } from './utils/logger.js';

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

// Helper functions extracted to keep route handler below cognitive-complexity limits
// -----------------------------------------------------------------------------

type UploadSuccessResult = {
  assetType: string;
  metaAssetId: string;
};

/**
 * Generates the HTML markup for a successful upload response.
 */
function renderUploadSuccessPage({ assetType, metaAssetId }: UploadSuccessResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Complete</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
</head>
<body>
  <main class="container">
    <article>
      <h1>✅ Upload Complete!</h1>
      <p><strong>Asset Type:</strong> ${assetType}</p>
      <p><strong>Meta Asset ID:</strong> ${metaAssetId}</p>
      <p>Your file has been successfully uploaded to Meta. You can now close this window.</p>
    </article>
  </main>
</body>
</html>`;
}

// Troubleshooting blocks broken out to avoid inline cognitive overload
const TROUBLESHOOTING_TEMPLATES = {
  metaApi: `
    <div class="troubleshooting">
      <h3>Possible Solutions:</h3>
      <ul>
        <li><strong>Check Ad Account Access:</strong> Verify the ad account still exists and you have access to it in Meta Business Manager</li>
        <li><strong>Verify Permissions:</strong> Ensure your account has Admin or Advertiser role on the ad account</li>
        <li><strong>Check Account Status:</strong> The ad account may be disabled, under review, or restricted by Meta</li>
        <li><strong>Token Issues:</strong> Your access token may have expired or been revoked</li>
      </ul>
      <p><strong>Next Steps:</strong> Please check your Meta Business Manager and try again, or contact your account administrator.</p>
    </div>
  `,
  permission: `
    <div class="troubleshooting">
      <h3>Permission Issue Detected:</h3>
      <ul>
        <li>Verify you have the required permissions for this ad account</li>
        <li>Check if your access token is still valid</li>
        <li>Ensure you have the 'ads_management' permission scope</li>
      </ul>
    </div>
  `,
  fileFormat: `
    <div class="troubleshooting">
      <h3>File Format Issue:</h3>
      <ul>
        <li><strong>Supported Image Formats:</strong> JPEG, PNG, GIF, WebP</li>
        <li><strong>Supported Video Formats:</strong> MP4, MOV</li>
        <li>Check that your file is not corrupted</li>
        <li>Ensure the file extension matches the actual file type</li>
      </ul>
    </div>
  `,
  network: `
    <div class="troubleshooting">
      <h3>Network Issue:</h3>
      <ul>
        <li>Check your internet connection</li>
        <li>The file may be too large - try a smaller file</li>
        <li>Try uploading again in a few minutes</li>
      </ul>
    </div>
  `,
  general: `
    <div class="troubleshooting">
      <h3>General Troubleshooting:</h3>
      <ul>
        <li>Try refreshing the page and uploading again</li>
        <li>Check that your file is not corrupted</li>
        <li>Ensure you have a stable internet connection</li>
        <li>If the problem persists, please contact support with the error details</li>
      </ul>
    </div>
  `,
} as const;

/**
 * Determines the error category and corresponding troubleshooting steps from an error message.
 */
function categorizeUploadError(errorMessage: string): {
  errorCategory: string;
  troubleshootingSteps: string;
} {
  // Order matters – first match wins
  const checks: Array<{ predicate: (msg: string) => boolean; category: string; steps: string }> = [
    {
      predicate: (msg) =>
        msg.includes('does not exist, cannot be loaded due to missing permissions'),
      category: 'Meta API Permission Error',
      steps: TROUBLESHOOTING_TEMPLATES.metaApi,
    },
    {
      predicate: (msg) => msg.includes('permissions') || msg.includes('access'),
      category: 'Permission Error',
      steps: TROUBLESHOOTING_TEMPLATES.permission,
    },
    {
      predicate: (msg) => msg.includes('Unsupported file type') || msg.includes('MIME type'),
      category: 'File Format Error',
      steps: TROUBLESHOOTING_TEMPLATES.fileFormat,
    },
    {
      predicate: (msg) =>
        msg.includes('timeout') || msg.includes('network') || msg.includes('fetch'),
      category: 'Network Error',
      steps: TROUBLESHOOTING_TEMPLATES.network,
    },
  ];

  for (const check of checks) {
    if (check.predicate(errorMessage)) {
      return { errorCategory: check.category, troubleshootingSteps: check.steps };
    }
  }

  return {
    errorCategory: 'Upload Error',
    troubleshootingSteps: TROUBLESHOOTING_TEMPLATES.general,
  };
}

/**
 * Generates the HTML markup for a failed upload response.
 */
function renderUploadFailedPage(
  errorCategory: string,
  errorMessage: string,
  troubleshootingSteps: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Failed</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    .troubleshooting {
      background-color: var(--pico-card-background-color);
      border: 1px solid var(--pico-border-color);
      border-radius: var(--pico-border-radius);
      padding: 1rem;
      margin-top: 1rem;
    }
    .troubleshooting h3 { margin-top: 0; color: var(--pico-color); }
    .troubleshooting ul { margin-bottom: 0; }
    .troubleshooting li { margin-bottom: 0.5rem; }
    .error-details {
      background-color: var(--pico-del-background-color);
      border-left: 4px solid var(--pico-del-color);
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 var(--pico-border-radius) var(--pico-border-radius) 0;
    }
    .error-details code {
      background-color: rgba(0,0,0,0.1);
      padding: 0.2rem 0.4rem;
      border-radius: 0.2rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <main class="container">
    <article>
      <h1>❌ Upload Failed</h1>
      <h2>${errorCategory}</h2>
      <div class="error-details">
        <p><strong>Error Details:</strong></p>
        <code>${errorMessage}</code>
      </div>
      ${troubleshootingSteps}
      <div style="margin-top: 2rem;">
        <p><strong>Need Help?</strong> If you continue to experience issues, please:</p>
        <ul>
          <li>Copy the error details above</li>
          <li>Note the time when the error occurred</li>
          <li>Contact your system administrator or support team</li>
        </ul>
      </div>
      <div style="margin-top: 2rem; text-align: center;">
        <button onclick="window.location.reload()" style="margin-right: 1rem;">Try Again</button>
        <button onclick="window.close()" class="secondary">Close Window</button>
      </div>
    </article>
  </main>
</body>
</html>`;
}

// -----------------------------------------------------------------------------

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
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
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

  app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
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

  const mcpAuthRouter = createMCPAuthRouter();
  app.use('/', mcpAuthRouter);

  // Initialize CoreServices once at startup
  const coreServices = await CoreServices.initialize();
  logger.info('CoreServices initialized for HTTP transport');

  // Initialize the MetaToolsHandler for upload processing
  const metaToolsHandler = new MetaToolsHandler();

  // Pass the CoreServices instance to the transport setup
  setupMCPHttpTransport(app, coreServices);

  // Creative asset upload endpoints

  /**
   * GET endpoint: Serves HTML upload form for creative assets
   * This endpoint validates that the uploadId exists and is in 'pending' status
   * but does not require authentication - security is provided by the unguessable UUID
   */
  app.get('/v1/assets/upload/:uploadId', async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };

    try {
      const uploadRecord = await db.query.creativeAssetUploads.findFirst({
        where: eq(creativeAssetUploads.id, uploadId),
      });

      // Check if record exists, is pending, and has not expired
      if (
        !uploadRecord ||
        uploadRecord.status !== 'pending' ||
        new Date() > uploadRecord.expiresAt
      ) {
        return reply
          .status(404)
          .type('text/html')
          .send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Upload Session Not Found</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
          </head>
          <body>
            <main class="container">
              <article>
                <h1>Upload Session Not Found</h1>
                <p>This upload session is invalid, expired, or has already been used.</p>
              </article>
            </main>
          </body>
          </html>
        `);
      }

      // Serve upload form
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Upload Creative Asset</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
          <style>
            button[aria-busy="true"] { color: transparent; }
          </style>
        </head>
        <body>
          <main class="container">
            <article>
              <h1>Upload Creative Asset</h1>
              <p>Upload file: <strong>${uploadRecord.filename}</strong></p>
              <p>The file type (image or video) will be automatically detected.</p>
              <p><small>Supported formats: JPEG, PNG, GIF, WebP, MP4, MOV</small></p>
              
              <form id="uploadForm" action="/v1/assets/upload/${uploadId}" method="post" enctype="multipart/form-data">
                <label for="file">
                  Select file to upload:
                  <input type="file" id="file" name="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov,video/quicktime" required>
                </label>
                <button id="submitBtn" type="submit">Upload File</button>
              </form>
            </article>
          </main>
          <script>
            const form = document.getElementById('uploadForm');
            const submitBtn = document.getElementById('submitBtn');
            const fileInput = document.getElementById('file');

            form.addEventListener('submit', () => {
              if (fileInput.files.length > 0) {
                submitBtn.setAttribute('aria-busy', 'true');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Uploading...';
              }
            });
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      logger.error('Failed to serve upload form', { uploadId, error });
      return reply
        .status(500)
        .type('text/html')
        .send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Error</title></head>
        <body>
          <h1>Server Error</h1>
          <p>Unable to load upload form. Please try again later.</p>
        </body>
        </html>
      `);
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
        return reply.type('text/html').send(renderUploadSuccessPage(result));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'File upload failed';
        logger.error('File upload failed', { uploadId, error: errorMessage });

        const statusCode = error instanceof ValidationError ? 400 : 500;
        const { errorCategory, troubleshootingSteps } = categorizeUploadError(errorMessage);

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
    logger.info(`Received ${signal}, starting graceful shutdown`);

    try {
      await app.close();
      // Per-request bambooServer instances are cleaned up automatically
      // We only need to close the shared database connection pool
      await closeDatabase();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
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
