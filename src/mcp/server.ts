import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { logger } from '../utils/logger.js';
import { ResourceRegistry } from './ResourceRegistry.js';
import { ToolRegistry } from './registries/toolRegistry.js';

export class BambooMCPServer {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor() {
    this.server = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      { capabilities: { tools: {}, resources: { subscribe: false } } }
    );
    this.toolsHandler = new MetaToolsHandler();

    const resourceRegistry = new ResourceRegistry(this.server);
    resourceRegistry.register();

    const toolRegistry = new ToolRegistry(this.server, this.toolsHandler);
    toolRegistry.register();
  }

  public getServer(): McpServer {
    return this.server;
  }

  public async runStdio() {
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
