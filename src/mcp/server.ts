import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../utils/logger.js';
import { CoreServices } from './coreServices.js';

export class BambooMCPServer {
  private server: McpServer;
  private isShutdown = false;
  private readonly requestId: string | undefined;

  /**
   * Creates a new, lightweight BambooMCPServer instance that references the singleton MCP server.
   * All tool registration and expensive setup is done once in CoreServices.
   */
  constructor(coreServices: CoreServices, requestId?: string) {
    this.requestId = requestId;

    // Get the pre-configured singleton MCP server from CoreServices
    this.server = coreServices.getMcpServer();

    logger.debug('BambooMCPServer instance created with singleton MCP server reference.', {
      requestId: this.requestId,
      toolCount: coreServices.getToolNames().length,
    });
  }

  public static async create(): Promise<BambooMCPServer> {
    const coreServices = await CoreServices.initialize();
    return new BambooMCPServer(coreServices);
  }

  public getServer(): McpServer {
    return this.server;
  }

  /**
   * Gracefully and idempotently shuts down the per-request MCP server instance.
   * This method can be called multiple times without causing errors.
   * Note: This does NOT shut down the singleton MCP server itself, only the reference.
   */
  public async shutdown(): Promise<void> {
    if (this.isShutdown) {
      logger.debug('MCP server already shutting down', { requestId: this.requestId });
      return;
    }

    logger.debug('Shutting down MCP server reference', { requestId: this.requestId });
    this.isShutdown = true;

    // Note: We don't close the actual MCP server since it's a singleton
    // Only log the completion of this instance's shutdown
    logger.debug('MCP server reference shutdown complete', { requestId: this.requestId });
  }

  public async runStdio() {
    logger.info('Starting MCP server in stdio mode');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server stdio transport connected');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  BambooMCPServer.create()
    .then((bambooServer) => bambooServer.runStdio())
    .catch((error) => {
      logger.error('Failed to start MCP server in stdio mode', { error });
      process.exit(1);
    });
}
