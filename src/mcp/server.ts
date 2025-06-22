import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { logger } from '../utils/logger.js';
import { PromptRegistry } from './PromptRegistry.js';
import { ResourceRegistry } from './ResourceRegistry.js';
import { CoreServices } from './coreServices.js';
import { ToolRegistry } from './registries/toolRegistry.js';

export class BambooMCPServer {
  private server: McpServer;
  private isShutdown = false;
  private readonly requestId: string | undefined;

  /**
   * Creates a new, lightweight BambooMCPServer instance for a single request.
   * All expensive resources are passed in via the CoreServices singleton.
   */
  constructor(coreServices: CoreServices, requestId?: string) {
    this.requestId = requestId;
    const promptCache = coreServices.promptCache;
    const systemPrompt = promptCache.getSystemPromptContent();
    const bestPractices = promptCache.getBestPracticesPromptContent();
    const instructions = `# Bamboo Meta Ads AI Agent Instructions

You are an expert Meta advertising specialist. Use these instructions and context for all interactions:

## System Context
${systemPrompt || 'System prompt not available'}

## Best Practices
${bestPractices || 'Best practices not available'}

Use this context to provide expert guidance on Meta advertising operations, campaign optimization, and strategic recommendations.`;

    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
        instructions,
      }
    );

    const toolsHandler = new MetaToolsHandler();
    const promptRegistry = new PromptRegistry(this.server);
    const resourceRegistry = new ResourceRegistry(this.server);
    const toolRegistry = new ToolRegistry(this.server, toolsHandler);

    promptRegistry.register();
    resourceRegistry.register();
    toolRegistry.register();

    logger.debug('Per-request BambooMCPServer instance created.', { requestId: this.requestId });
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
   */
  public async shutdown(): Promise<void> {
    if (this.isShutdown) {
      logger.debug('Shutdown already initiated for this BambooMCPServer instance. Skipping.', {
        requestId: this.requestId,
      });
      return;
    }

    logger.debug('Shutting down per-request Bamboo MCP Server...', { requestId: this.requestId });
    this.isShutdown = true;

    try {
      await this.server.close();
      logger.debug('Per-request Bamboo MCP Server shutdown complete.', {
        requestId: this.requestId,
      });
    } catch (error) {
      logger.error('Error during per-request Bamboo MCP Server shutdown.', {
        requestId: this.requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Do not re-throw the error, allowing graceful shutdown of other components
      // to continue even if one instance fails to close cleanly.
    }
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
