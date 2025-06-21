import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import pTimeout, { TimeoutError } from 'p-timeout';
import { extractTokenFromHeader, verifyJWT } from '../auth/jwt.js';
import type { JWTPayload } from '../types/auth.js';
import { env } from '../utils/env.js';
import { AuthenticationError, TokenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CoreServices } from './coreServices.js';
import { BambooMCPServer } from './server.js';

// Removed createMCPServerInstance function - using singleton pattern instead

interface JsonRpcRequestBody {
  id?: string | number | null;
  method?: string;
  [key: string]: unknown;
}

function setupTransportCleanup(
  transport: StreamableHTTPServerTransport,
  reply: FastifyReply
): void {
  const cleanup = () => {
    logger.debug('Cleaning up MCP resources');
    transport.close();
  };

  // Handle successful response completion
  reply.raw.on('finish', () => {
    logger.debug('MCP response successfully completed');
  });

  // Handle connection close (client disconnect, network error, or after finish)
  reply.raw.on('close', cleanup);

  // Handle stream errors (must be handled to prevent process crashes)
  reply.raw.on('error', (error) => {
    logger.error('Request error, cleaning up MCP resources', { error });
    cleanup();
  });
}

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

async function handleMCPRequest(
  request: FastifyRequest<{ Body: JsonRpcRequestBody }>,
  reply: FastifyReply,
  token: string,
  authPayload: JWTPayload,
  method: string,
  bambooServer: BambooMCPServer
): Promise<void> {
  const mcpServer = bambooServer.getServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  setupTransportCleanup(transport, reply);

  try {
    await mcpServer.connect(transport);
    logger.debug('Created new MCP transport for request', {
      method,
      userId: authPayload.userId,
    });

    const authInfo: AuthInfo = {
      token: token,
      clientId: authPayload.clientId,
      scopes: authPayload.scopes,
      expiresAt: authPayload.exp,
      extra: { authPayload },
    };

    const reqWithAuth = Object.assign(request.raw, { auth: authInfo });

    const clientCapabilities = mcpServer.server.getClientCapabilities();
    logger.debug('MCP client capabilities', { clientCapabilities });

    await pTimeout(transport.handleRequest(reqWithAuth, reply.raw, request.body), {
      milliseconds: env.MCP_REQUEST_TIMEOUT,
      message: `MCP transport request timed out after ${env.MCP_REQUEST_TIMEOUT}ms for method: ${method}`,
    });
  } catch (error) {
    logger.error('MCP transport layer error', {
      method,
      userId: authPayload.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export function setupMCPHttpTransport(fastify: FastifyInstance, coreServices: CoreServices): void {
  fastify.post(
    '/',
    {
      config: {
        disableRequestLogging: false,
      },
    },
    async (request: FastifyRequest<{ Body: JsonRpcRequestBody }>, reply: FastifyReply) => {
      const startTime = Date.now();
      const { id = null, method = 'unknown' } = request.body ?? {};
      let authPayload: JWTPayload | undefined;
      let bambooServer: BambooMCPServer | undefined;

      try {
        const token = extractTokenFromHeader(request.headers.authorization);
        authPayload = await verifyJWT(token);

        // Hijack ONLY after successful authentication
        reply.hijack();

        logger.info(`HTTP MCP: Authenticated user ${authPayload.userId}`, {
          requestId: request.id,
        });

        // Create a new server instance for this request
        bambooServer = new BambooMCPServer(coreServices);

        await handleMCPRequest(request, reply, token, authPayload, method, bambooServer);

        const duration = Date.now() - startTime;
        logger.mcpRequest(method, authPayload.userId, true, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        const userId = authPayload?.userId;
        logger.mcpRequest(method, userId, false, duration);

        if (error instanceof TimeoutError) {
          logger.error('MCP request timed out', {
            method,
            userId,
            error: error.message,
            requestId: request.id,
          });
          sendInternalError(reply, id);
          return;
        }

        // Handle TokenError as authentication error
        if (error instanceof TokenError) {
          sendAuthError(reply, new AuthenticationError(error.message), id);
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
          requestId: request.id,
        });

        sendInternalError(reply, id);
      } finally {
        // Ensure shutdown is called for the per-request instance
        if (bambooServer) {
          await bambooServer.shutdown();
        }
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
