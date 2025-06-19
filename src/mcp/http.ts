import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import pTimeout, { TimeoutError } from 'p-timeout';
import { extractTokenFromHeader, verifyJWT } from '../auth/jwt.js';
import { db } from '../db/client.js';
import type { JWTPayload } from '../types/auth.js';
import { env } from '../utils/env.js';
import { AuthenticationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { BambooMCPServer } from './server.js';

// Create a new server instance for each request (stateless pattern)
function createMCPServerInstance(): McpServer {
  // Create a new server instance for true request isolation
  const bambooServer = new BambooMCPServer();
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
  // Use deterministic ordering for development consistency
  const testUser = await db.query.users.findFirst({
    orderBy: (users, { asc }) => [asc(users.createdAt)],
  });

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

  try {
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

    // Wrap transport.handleRequest with timeout to prevent hanging
    await pTimeout(transport.handleRequest(reqWithAuth, reply.raw, request.body), {
      milliseconds: env.MCP_REQUEST_TIMEOUT,
      message: `MCP transport request timed out after ${env.MCP_REQUEST_TIMEOUT}ms for method: ${method}`,
    });
  } catch (error) {
    // The transport layer failed. Log the low-level error and re-throw.
    // The top-level handler will be responsible for sending the HTTP response.
    logger.error('MCP transport layer error', {
      method,
      userId: authPayload.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export function setupMCPHttpTransport(fastify: FastifyInstance): void {
  fastify.post(
    '/',
    {
      // Tell Fastify we'll handle the response manually
      config: {
        disableRequestLogging: false,
      },
    },
    async (request: FastifyRequest<{ Body: JsonRpcRequestBody }>, reply: FastifyReply) => {
      const startTime = Date.now();
      const { id = null, method = 'unknown' } = request.body ?? {};
      let authPayload: JWTPayload | undefined; // Declare here for access in catch block

      // Take control of the response immediately
      reply.hijack();

      try {
        // Authentication
        authPayload = await authenticateRequest(request.headers.authorization);
        logger.info(`HTTP MCP: Using auth payload for user ${authPayload.userId}`);

        // Handle the MCP request
        await handleMCPRequest(request, reply, authPayload, method);

        const duration = Date.now() - startTime;
        logger.mcpRequest(method, authPayload.userId, true, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        const userId = authPayload?.userId;
        logger.mcpRequest(method, userId, false, duration);

        // Handle timeout errors
        if (error instanceof TimeoutError) {
          logger.error('MCP request timed out', {
            method,
            userId,
            error: error.message,
          });
          sendInternalError(reply, id);
          return;
        }

        // Handle authentication errors
        if (error instanceof AuthenticationError) {
          sendAuthError(reply, error, id);
          return;
        }

        // Handle other errors
        logger.error('MCP HTTP transport error', {
          method,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        sendInternalError(reply, id);
      }
    }
  );

  // Method not allowed for MCP endpoint
  fastify.get('/', async (_request, reply) => {
    return reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });

  fastify.delete('/', async (_request, reply) => {
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
