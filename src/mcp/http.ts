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

/**
 * MCP HTTP Transport Design Notes:
 *
 * This transport implements a per-request server instance model (`BambooMCPServer`).
 * - A new `BambooMCPServer` is created for each incoming MCP POST request.
 * - Each instance is automatically cleaned up when the connection closes.
 * - This approach provides maximum request isolation, preventing state leakage and
 *   simplifying resource management, which resolves potential race conditions.
 * - The trade-off is performance: creating server and registry instances for every
 *   request has higher overhead than a shared-instance model. This is mitigated by
 *   the `CoreServices` singleton, which manages expensive, shared resources.
 * - This design is considered optimal for stability and correctness but should be
 *   monitored for performance under high-load production environments.
 */

interface JsonRpcRequestBody {
  id?: string | number | null;
  method?: string;
  [key: string]: unknown;
}

function setupTransportCleanup(
  reply: FastifyReply,
  bambooServer: BambooMCPServer,
  requestId: string
): void {
  const cleanup = async () => {
    logger.debug(`Cleaning up MCP resources for request: ${requestId}`);
    try {
      // Simple timeout protection for cleanup
      await pTimeout(bambooServer.shutdown(), {
        milliseconds: 5000, // 5-second timeout for cleanup
        message: `Cleanup timed out for request ${requestId}`,
      });
      logger.debug(`Cleanup complete for request: ${requestId}`);
    } catch (error) {
      logger.error(`Error during server shutdown for request ${requestId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // The 'close' event handles both successful completion and client disconnection
  reply.raw.on('close', () => {
    logger.debug(`Request stream closed for request: ${requestId}, ensuring cleanup`);
    cleanup().catch((error) =>
      logger.error(`Error during 'close' cleanup for request ${requestId}`, { error })
    );
  });

  // Handle stream errors, which might not always trigger 'close'
  reply.raw.on('error', (error) => {
    logger.error(`Request stream error for request ${requestId}, forcing cleanup`, { error });
    cleanup().catch((cleanupError) =>
      logger.error(`Error during 'error' cleanup for request ${requestId}`, { cleanupError })
    );
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

// Centralised error processing to keep the primary route handler concise
interface McpPostErrorContext {
  error: unknown;
  request: FastifyRequest<{ Body: JsonRpcRequestBody }>;
  reply: FastifyReply;
  id: string | number | null;
  method: string;
  authPayload?: JWTPayload;
  startTime: number;
}

async function processMcpPostError({
  error,
  request,
  reply,
  id,
  method,
  authPayload,
  startTime,
}: McpPostErrorContext): Promise<void> {
  const duration = Date.now() - startTime;
  const userId = authPayload?.userId;
  logger.mcpRequest(method, userId, false, duration);

  if (error instanceof TimeoutError) {
    logger.error('MCP request timeout', {
      method,
      userId,
      error: error.message,
      requestId: request.id,
    });
    sendInternalError(reply, id);
    return;
  }

  if (error instanceof TokenError) {
    sendAuthError(reply, new AuthenticationError(error.message), id);
    return;
  }

  if (error instanceof AuthenticationError) {
    sendAuthError(reply, error, id);
    return;
  }

  logger.error('MCP HTTP transport error', {
    method,
    userId,
    error: error instanceof Error ? error.message : 'Unknown error',
    requestId: request.id,
  });
  sendInternalError(reply, id);
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

  // Pass the server instance and request ID to the cleanup handler
  setupTransportCleanup(reply, bambooServer, request.id);

  try {
    await mcpServer.connect(transport);
    logger.debug('Created new MCP transport for request', {
      method,
      userId: authPayload.userId,
      requestId: request.id,
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
      requestId: request.id,
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

      try {
        const token = extractTokenFromHeader(request.headers.authorization);
        authPayload = await verifyJWT(token);

        // Hijack ONLY after successful authentication
        reply.hijack();

        logger.info(`HTTP MCP: Authenticated user ${authPayload.userId}`, {
          requestId: request.id,
        });

        // Create a new server instance for this request
        const bambooServer = new BambooMCPServer(coreServices, request.id);

        await handleMCPRequest(request, reply, token, authPayload, method, bambooServer);

        const duration = Date.now() - startTime;
        logger.mcpRequest(method, authPayload.userId, true, duration);
      } catch (error) {
        await processMcpPostError({
          error,
          request,
          reply,
          id,
          method,
          authPayload,
          startTime,
        });
        // The 'close' event on reply.raw will trigger the cleanup, so no
        // manual cleanup is needed here for the bambooServer instance.
      }
      // The 'finally' block that called bambooServer.shutdown() is intentionally removed.
    }
  );

  // GET endpoint for SSE streams (required by MCP specification)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const acceptHeader = request.headers.accept;
    
    // Check if client is requesting Server-Sent Events
    if (acceptHeader && acceptHeader.includes('text/event-stream')) {
      try {
        // Extract and verify JWT token for authentication
        const token = extractTokenFromHeader(request.headers.authorization);
        const authPayload = await verifyJWT(token);
        
        logger.info(`HTTP MCP SSE: Authenticated user ${authPayload.userId}`, {
          requestId: request.id,
        });

        // Set up SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
        });

        // Create a new server instance for this SSE connection
        const bambooServer = new BambooMCPServer(coreServices, request.id);
        const mcpServer = bambooServer.getServer();

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: false, // SSE mode
        });

        // Set up cleanup when connection closes
        setupTransportCleanup(reply, bambooServer, request.id);

        try {
          await mcpServer.connect(transport);
          
          const authInfo: AuthInfo = {
            token: token,
            clientId: authPayload.clientId,
            scopes: authPayload.scopes,
            expiresAt: authPayload.exp,
            extra: { authPayload },
          };

          const reqWithAuth = Object.assign(request.raw, { auth: authInfo });

          // Handle the SSE stream
          await pTimeout(transport.handleRequest(reqWithAuth, reply.raw, null), {
            milliseconds: env.MCP_REQUEST_TIMEOUT,
            message: `MCP SSE stream timed out after ${env.MCP_REQUEST_TIMEOUT}ms`,
          });
        } catch (error) {
          logger.error('MCP SSE transport error', {
            userId: authPayload.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            requestId: request.id,
          });
          
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
            reply.raw.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'SSE stream error',
              },
              id: null,
            }));
          }
        }
      } catch (error) {
        // Authentication failed
        if (error instanceof TokenError || error instanceof AuthenticationError) {
          logger.warn('SSE authentication failed', {
            error: error.message,
            requestId: request.id,
          });
          
          return reply.status(401).send({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: error.message,
            },
            id: null,
          });
        }
        
        // Other errors
        logger.error('SSE setup error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId: request.id,
        });
        
        return reply.status(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    } else {
      // If not requesting SSE, return method not allowed
      return reply.status(405).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed. Use POST for MCP requests or include text/event-stream in Accept header.',
        },
        id: null,
      });
    }
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
