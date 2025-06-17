import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { extractTokenFromHeader, verifyJWT } from '../auth/jwt.js';
import { AuthenticationError } from '../utils/errors.js';
import { env } from '../utils/env.js';
import { db } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { JWTPayload } from '../types/index.js';

export function setupMCPHttpTransport(fastify: FastifyInstance, mcpServer: McpServer) {
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const requestBody = typeof request.body === 'object' && request.body ? (request.body as any) : {};
    const { id = null, method = 'unknown' } = requestBody;

    try {
      // 1. Authentication: Extract and verify JWT, with development mode fallback
      let authPayload: JWTPayload;
      const authHeader = request.headers.authorization;
      
      if (authHeader) {
        const token = extractTokenFromHeader(authHeader);
        authPayload = verifyJWT(token);
      } else if (env.NODE_ENV === 'development') {
        // Development mode: create mock auth payload for inspector testing
        const testUser = await db.query.users.findFirst();
        if (!testUser) {
          throw new AuthenticationError('For testing without a token, at least one user must exist in the database. Please run the OAuth flow once.');
        }
        authPayload = {
          userId: testUser.id,
          scopes: env.FACEBOOK_OAUTH_SCOPES.split(','),
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (60 * 60), // Expires in 1 hour
          iss: env.BASE_URL,
          aud: 'bamboo-mcp-client',
          jti: `dev-token-${Date.now()}`,
        };
        logger.info(`HTTP MCP: Using mock JWT payload for user ${testUser.id}`);
      } else {
        throw new AuthenticationError('Authorization header with Bearer token is required.');
      }

      // 2. Create transport with auth context
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        enableJsonResponse: true, // Use JSON responses for MCP protocol
      });

      // 3. Connect the server to the transport
      await mcpServer.connect(transport);

      // 4. Handle request with auth context injection
      const authInfo: AuthInfo = {
        token: authHeader ? extractTokenFromHeader(authHeader) : `dev-token-${Date.now()}`,
        clientId: 'bamboo-mcp-client',
        scopes: authPayload.scopes,
        expiresAt: authPayload.exp,
        extra: { authPayload }
      };
      
      const reqWithAuth = Object.assign(request.raw, { auth: authInfo });
      await transport.handleRequest(reqWithAuth, reply.raw, request.body);

      const duration = Date.now() - startTime;
      logger.mcpRequest(method, authPayload.userId, true, duration);

      // Request lifecycle is handled by the transport
      request.raw.on("close", () => {
        transport.close();
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.mcpRequest(method, undefined, false, duration);
      
      // Handle authentication errors
      if (error instanceof AuthenticationError) {
        return reply.status(401).send({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: error.message,
          },
          id,
        });
      }

      // Handle other errors
      logger.error('MCP HTTP transport error', { method, error: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id,
      });
    }
  });

  // Method not allowed for MCP endpoint
  fastify.get('/mcp', async (_request, reply) => {
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.'
      },
      id: null
    });
  });

  fastify.delete('/mcp', async (_request, reply) => {
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.'
      },
      id: null
    });
  });
} 