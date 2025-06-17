import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractTokenFromHeader, verifyJWT } from '../auth/jwt.js';
import { db } from '../db/client.js';
import type { JWTPayload } from '../types/index.js';
import { env } from '../utils/env.js';
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { bambooServer } from './server.js';

// Create a function to get a new server instance for each request
function createMCPServerInstance(): McpServer {
  // For stateless pattern, we should create a new server instance for each request
  // But the current architecture uses a singleton, so we'll reuse it
  // TODO: Refactor to proper factory pattern
  return bambooServer.getServer();
}

export function setupMCPHttpTransport(fastify: FastifyInstance): void {
  fastify.post('/mcp', { 
    // Tell Fastify we'll handle the response manually
    config: { 
      disableRequestLogging: false 
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const requestBody =
      typeof request.body === 'object' && request.body ? (request.body as any) : {};
    const { id = null, method = 'unknown' } = requestBody;

    // Take control of the response immediately
    reply.hijack();

    try {
      // Authentication: Extract and verify JWT, with development mode fallback
      let authPayload: JWTPayload;
      const authHeader = request.headers.authorization;

      if (authHeader) {
        const token = extractTokenFromHeader(authHeader);
        authPayload = verifyJWT(token);
      } else if (env.NODE_ENV === 'development') {
        // Development mode: create mock auth payload for inspector testing
        const testUser = await db.query.users.findFirst();
        if (!testUser) {
          throw new AuthenticationError(
            'For testing without a token, at least one user must exist in the database. Please run the OAuth flow once.'
          );
        }
        authPayload = {
          userId: testUser.id,
          clientId: 'bamboo-mcp-client',
          scopes: env.FACEBOOK_OAUTH_SCOPES.split(','),
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
          iss: env.BASE_URL,
          aud: 'bamboo-mcp-client',
          jti: `dev-token-${Date.now()}`,
        };
        logger.info(`HTTP MCP: Using mock JWT payload for user ${testUser.id}`);
      } else {
        throw new AuthenticationError('Authorization header with Bearer token is required.');
      }

      // Create NEW server and transport for this request (stateless pattern)
      const mcpServer = createMCPServerInstance();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
        enableJsonResponse: true,
      });

      // Clean up when request closes
      reply.raw.on('close', () => {
        logger.debug('Request closed, cleaning up MCP resources');
        transport.close();
        // Don't close mcpServer since it's a singleton for now
      });

      // Handle request errors and cleanup
      reply.raw.on('error', (error) => {
        logger.error('Request error, cleaning up MCP resources', { error });
        transport.close();
        // Don't close mcpServer since it's a singleton for now
      });

      // Connect server to transport for this request
      await mcpServer.connect(transport);
      logger.debug('Created new MCP transport for request', { method, userId: authPayload.userId });

      // Handle request using the dedicated transport instance
      const authInfo: AuthInfo = {
        token: authHeader ? extractTokenFromHeader(authHeader) : `dev-token-${Date.now()}`,
        clientId: 'bamboo-mcp-client',
        scopes: authPayload.scopes,
        expiresAt: authPayload.exp,
        extra: { authPayload },
      };

      const reqWithAuth = Object.assign(request.raw, { auth: authInfo });
      await transport.handleRequest(reqWithAuth, reply.raw, request.body);

      const duration = Date.now() - startTime;
      logger.mcpRequest(method, authPayload.userId, true, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.mcpRequest(method, undefined, false, duration);

      // Handle authentication errors
      if (error instanceof AuthenticationError) {
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(401, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: error.message,
            },
            id,
          }));
        }
        return;
      }

      // Handle other errors
      logger.error('MCP HTTP transport error', {
        method,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id,
        }));
      }
    }
  });

  // Method not allowed for MCP endpoint
  fastify.get('/mcp', async (_request, reply) => {
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });

  fastify.delete('/mcp', async (_request, reply) => {
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });
}
