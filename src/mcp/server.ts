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

  private constructor(server: McpServer) {
    this.server = server;
    this.toolsHandler = new MetaToolsHandler();
  }

  /**
   * Creates a new BambooMCPServer instance with fully initialized prompts and server.
   * This static factory method handles all server creation and async initialization.
   */
  public static async create(): Promise<BambooMCPServer> {
    let mcpServer: McpServer | undefined;

    try {
      // Initialize prompt content cache first
      await promptContentCache.initialize();

      // Build instructions from cached prompt content
      const systemPrompt = promptContentCache.getSystemPromptContent();
      const bestPractices = promptContentCache.getBestPracticesPromptContent();

      const instructions = `# Bamboo Meta Ads AI Agent Instructions

You are an expert Meta advertising specialist. Use these instructions and context for all interactions:

## System Context
${systemPrompt || 'System prompt not available'}

## Best Practices
${bestPractices || 'Best practices not available'}

Use this context to provide expert guidance on Meta advertising operations, campaign optimization, and strategic recommendations.`;

      // Create the MCP server with proper instructions
      mcpServer = new McpServer(
        { name: 'Bamboo MCP', version: '0.1.0' },
        {
          capabilities: { tools: {}, resources: {}, prompts: {} },
          instructions,
        }
      );

      // Create the wrapper instance
      const bambooServer = new BambooMCPServer(mcpServer);

      // Initialize and register all components
      const promptRegistry = new PromptRegistry(mcpServer);
      const resourceRegistry = new ResourceRegistry(mcpServer);
      const toolRegistry = new ToolRegistry(mcpServer, bambooServer.toolsHandler);

      // Register all components (no async initialization needed for PromptRegistry)
      promptRegistry.register();
      resourceRegistry.register();
      toolRegistry.register();

      logger.info('BambooMCPServer created and initialized successfully');
      return bambooServer;
    } catch (error) {
      // Cleanup any partially initialized resources
      if (mcpServer) {
        try {
          await mcpServer.close();
        } catch (cleanupError) {
          logger.error('Error during cleanup after initialization failure', {
            originalError: error instanceof Error ? error.message : 'Unknown error',
            cleanupError:
              cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error',
          });
        }
      }

      // Add context and rethrow for consistent error handling
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`BambooMCPServer initialization failed: ${message}`);
    }
  }

  public getServer(): McpServer {
    return this.server;
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
      logger.error('Failed to start MCP server', { error });
      process.exit(1);
    });
}
