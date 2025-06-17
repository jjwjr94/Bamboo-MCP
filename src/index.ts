import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyExpress from '@fastify/express';
import { env } from './utils/env.js';
import { logger } from './utils/logger.js';
import { testConnection, closeDatabase } from './db/client.js';
import { 
  handleAuthorize, 
  handleFacebookCallback, 
  handleTokenExchange 
} from './auth/oauth.js';
import { createMCPAuthRouter } from './auth/mcpOAuthSetup.js';
import { bambooServer } from './mcp/server.js';
import { setupMCPHttpTransport } from './mcp/http.js';

// Build Fastify app 
export async function build(opts = {}) {
  const app = Fastify({
    logger: false, // Use our custom logger instead
    ...opts,
  });

  // Register Express compatibility layer
  await app.register(fastifyExpress);

  // Register CORS
  app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Health check endpoint
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

  // OAuth server metadata endpoint
  app.get('/.well-known/oauth-authorization-server', async (_request, reply) => {
    return reply.send({
      issuer: env.BASE_URL,
      authorization_endpoint: `${env.BASE_URL}/authorize`,
      token_endpoint: `${env.BASE_URL}/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['ads_management', 'business_management'],
    });
  });

  // OAuth routes (existing custom implementation)
  app.get('/authorize', handleAuthorize);
  app.get('/auth/facebook/callback', handleFacebookCallback);
  app.post('/token', handleTokenExchange);

  // MCP OAuth router (new MCP SDK implementation)
  const mcpAuthRouter = createMCPAuthRouter();
  app.use('/', mcpAuthRouter);

  // Setup MCP HTTP transport
  setupMCPHttpTransport(app, bambooServer.getServer());

  // Global error handler
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

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);
    
    try {
      await app.close();
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

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const start = async () => {
    try {
      const app = await build();
      const address = await app.listen({ 
        port: env.PORT, 
        host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
      });
      
      logger.info('Server started', { 
        address, 
        env: env.NODE_ENV,
        version: '0.1.0'
      });
    } catch (error) {
      logger.error('Server start failed', { error });
      process.exit(1);
    }
  };

  start();
} 