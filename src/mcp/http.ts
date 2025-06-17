import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractTokenFromHeader, verifyJWT } from '../auth/jwt.js';
import { db } from '../db/client.js';
import type { JWTPayload } from '../types/auth.js';
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

// JSON-RPC request body (minimal fields needed in this handler)
// See https://www.jsonrpc.org/specification for full definition.
interface JsonRpcRequestBody {
  id?: string | number | null;
  method?: string;
  // Allow additional JSON-RPC fields (e.g. params, jsonrpc, etc.)
  [key: string]: unknown;
}

// Authentication helper functions
async function authenticateRequest(authHeader: string | undefined): Promise<JWTPayload> {
  if (authHeader) {
    const token = extractTokenFromHeader(authHeader);
    return verifyJWT(token);
  }

  if (env.NODE_ENV === 'development') {
    return createMockAuthPayload();
  }

  throw new AuthenticationError('Authorization header with Bearer token is required.');
}

async function createMockAuthPayload(): Promise<JWTPayload> {
  const testUser = await db.query.users.findFirst();
  if (!testUser) {
    throw new AuthenticationError(
      'For testing without a token, at least one user must exist in the database. Please run the OAuth flow once.'
    );
  }

  return {
    userId: testUser.id,
    clientId: 'bamboo-mcp-client',
    scopes: env.FACEBOOK_OAUTH_SCOPES.split(','),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
    iss: env.BASE_URL,
    aud: 'bamboo-mcp-client',
    jti: `dev-token-${Date.now()}`,
  };
}

// Resource management helper
function setupTransportCleanup(
  transport: StreamableHTTPServerTransport,
  reply: FastifyReply
): void {
  const cleanup = () => {
    logger.debug('Cleaning up MCP resources');
    transport.close();
  };

  reply.raw.on('close', cleanup);
  reply.raw.on('error', (error) => {
    logger.error('Request error, cleaning up MCP resources', { error });
    cleanup();
  });
}

// Error response helpers
function sendAuthError(
  reply: FastifyReply,
  error: AuthenticationError,
  id: string | number | null
): void {
  if (reply.raw.headersSent) return;

  reply.raw.writeHead(401, { 'Content-Type': 'application/json' });
  reply.raw.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: error.message,
      },
      id,
    })
  );
}

function sendInternalError(reply: FastifyReply, id: string | number | null): void {
  if (reply.raw.headersSent) return;

  reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
  reply.raw.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
      },
      id,
    })
  );
}

// Main MCP request handler
async function handleMCPRequest(
  request: FastifyRequest<{ Body: JsonRpcRequestBody }>,
  reply: FastifyReply,
  authPayload: JWTPayload,
  method: string
): Promise<void> {
  // Create NEW server and transport for this request (stateless pattern)
  const mcpServer = createMCPServerInstance();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true,
  });

  // Setup cleanup handlers
  setupTransportCleanup(transport, reply);

  // Connect server to transport for this request
  await mcpServer.connect(transport);
  logger.debug('Created new MCP transport for request', {
    method,
    userId: authPayload.userId,
  });

  // Handle request using the dedicated transport instance
  const authInfo: AuthInfo = {
    token: request.headers.authorization
      ? extractTokenFromHeader(request.headers.authorization)
      : `dev-token-${Date.now()}`,
    clientId: 'bamboo-mcp-client',
    scopes: authPayload.scopes,
    expiresAt: authPayload.exp,
    extra: { authPayload },
  };

  const reqWithAuth = Object.assign(request.raw, { auth: authInfo });
  await transport.handleRequest(reqWithAuth, reply.raw, request.body);
}

export function setupMCPHttpTransport(fastify: FastifyInstance): void {
  fastify.post(
    '/mcp',
    {
      // Tell Fastify we'll handle the response manually
      config: {
        disableRequestLogging: false,
      },
    },
    async (request: FastifyRequest<{ Body: JsonRpcRequestBody }>, reply: FastifyReply) => {
      const startTime = Date.now();
      const { id = null, method = 'unknown' } = request.body ?? {};

      // Take control of the response immediately
      reply.hijack();

      try {
        // Authentication
        const authPayload = await authenticateRequest(request.headers.authorization);
        logger.info(`HTTP MCP: Using auth payload for user ${authPayload.userId}`);

        // Handle the MCP request
        await handleMCPRequest(request, reply, authPayload, method);

        const duration = Date.now() - startTime;
        logger.mcpRequest(method, authPayload.userId, true, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.mcpRequest(method, undefined, false, duration);

        // Handle authentication errors
        if (error instanceof AuthenticationError) {
          sendAuthError(reply, error, id);
          return;
        }

        // Handle other errors
        logger.error('MCP HTTP transport error', {
          method,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        sendInternalError(reply, id);
      }
    }
  );

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
