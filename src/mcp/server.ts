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

  /**
   * Creates a new, lightweight BambooMCPServer instance for a single request.
   * All expensive resources are passed in via the CoreServices singleton.
   */
  constructor(coreServices: CoreServices) {
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

    // Create a new McpServer instance for this request
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
        instructions,
      }
    );

    // Instantiate handlers and registries for this specific server instance
    const toolsHandler = new MetaToolsHandler();
    const promptRegistry = new PromptRegistry(this.server);
    const resourceRegistry = new ResourceRegistry(this.server);
    const toolRegistry = new ToolRegistry(this.server, toolsHandler);

    // Register all components
    promptRegistry.register();
    resourceRegistry.register();
    toolRegistry.register();

    logger.debug('Per-request BambooMCPServer instance created.');
  }

  // Keep the original create method for backward compatibility (stdio mode)
  public static async create(): Promise<BambooMCPServer> {
    const coreServices = await CoreServices.initialize();
    return new BambooMCPServer(coreServices);
  }

  public getServer(): McpServer {
    return this.server;
  }

  /**
   * Gracefully shuts down the per-request MCP server instance.
   */
  public async shutdown(): Promise<void> {
    logger.debug('Shutting down per-request Bamboo MCP Server...');
    await this.server.close();
    logger.debug('Per-request Bamboo MCP Server shutdown complete.');
  }

  public async runStdio() {
    logger.info('Starting MCP server in stdio mode');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server stdio transport connected');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // The create method now handles all initialization via CoreServices
  BambooMCPServer.create()
    .then((bambooServer) => bambooServer.runStdio())
    .catch((error) => {
      logger.error('Failed to start MCP server in stdio mode', { error });
      process.exit(1);
    });
}
