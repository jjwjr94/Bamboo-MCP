import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { logger } from '../utils/logger.js';
import { PromptRegistry } from './PromptRegistry.js';
import { ResourceRegistry } from './ResourceRegistry.js';
import { promptContentCache } from './promptContent.js';
import { ToolRegistry } from './registries/toolRegistry.js';

export class BambooMCPServer {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private promptRegistry: PromptRegistry;

  constructor() {
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      {
        capabilities: { tools: {}, resources: { subscribe: false }, prompts: {} },
        // Instructions will be set after prompt initialization
        instructions: undefined,
      }
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
    // Initialize both the prompt registry and global cache
    await Promise.all([this.promptRegistry.initialize(), promptContentCache.initialize()]);

    // Create instructions from cached prompt content
    // This is delivered during MCP handshake, so Claude gets context immediately
    const systemPrompt = this.promptRegistry.getSystemPromptContent();
    const bestPractices = this.promptRegistry.getBestPracticesPromptContent();

    const instructions = `# Bamboo Meta Ads AI Agent Instructions

You are an expert Meta advertising specialist. Use these instructions and context for all interactions:

## System Context
${systemPrompt || 'System prompt not available'}

## Best Practices
${bestPractices || 'Best practices not available'}

Use this context to provide expert guidance on Meta advertising operations, campaign optimization, and strategic recommendations.`;

    // Update server with instructions - this gets sent during handshake
    // TECHNICAL DEBT: MCP SDK v1.13.0 doesn't provide public API to update instructions post-init
    // This private property access may break in future SDK versions
    (this.server as any).server._instructions = instructions;

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
