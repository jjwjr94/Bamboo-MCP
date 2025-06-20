import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { logger } from '../utils/logger.js';
import { PromptRegistry } from './PromptRegistry.js';
import { ResourceRegistry } from './ResourceRegistry.js';
import { ToolRegistry } from './registries/toolRegistry.js';

export class BambooMCPServer {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private promptRegistry: PromptRegistry;

  constructor() {
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      { capabilities: { tools: {}, resources: { subscribe: false }, prompts: {} } }
    );
    this.toolsHandler = new MetaToolsHandler();

    // Instantiate registries
    this.promptRegistry = new PromptRegistry(this.server);
    const resourceRegistry = new ResourceRegistry(this.server);
    const toolRegistry = new ToolRegistry(this.server, this.toolsHandler);

    // Register handlers (this part is synchronous)
    // Note: promptRegistry.register() is now called in initialize() after content is cached
    resourceRegistry.register();
    toolRegistry.register();
  }

  public getServer(): McpServer {
    return this.server;
  }

  /**
   * Initializes all asynchronous dependencies, such as caching prompts.
   * This must be called before the server starts accepting requests.
   */
  public async initialize(): Promise<void> {
    await this.promptRegistry.initialize();
    // Register prompts only after content is successfully cached
    this.promptRegistry.register();
    // Add any other async initialization here in the future
  }

  /**
   * Gracefully shuts down the MCP server and releases all resources.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down Bamboo MCP Server...');
    await this.server.close();
    logger.info('Bamboo MCP Server shutdown complete');
  }

  public async runStdio() {
    // Initialize the server first
    await this.initialize();

    logger.info('Starting MCP server in stdio mode');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server stdio transport connected');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bambooServer = new BambooMCPServer();
  bambooServer.runStdio().catch((error) => {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  });
}
