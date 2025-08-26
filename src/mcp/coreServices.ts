import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type MetaServerAuthProvider,
  composeMetaServerAuthProvider,
} from '../auth/MetaServerAuthProvider.js';
import { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { InitializationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { PromptRegistry } from './PromptRegistry.js';
import { ResourceRegistry } from './ResourceRegistry.js';
import { promptContentCache } from './promptContent.js';
import { ToolRegistry } from './registries/toolRegistry.js';

/**
 * Manages shared, expensive-to-create resources as a singleton.
 * This ensures that components like the prompt cache, auth provider, and MCP server
 * are initialized only once for the entire application lifecycle.
 */
export class CoreServices {
  private static instance: CoreServices;
  private static initializationPromise: Promise<CoreServices> | null = null;

  public readonly authProvider: MetaServerAuthProvider;
  public readonly promptCache: typeof promptContentCache;
  public readonly mcpServer: McpServer;
  public readonly toolNames: string[];

  private constructor() {
    this.authProvider = composeMetaServerAuthProvider();
    this.promptCache = promptContentCache;

    // Create MCP server singleton with system instructions
    const systemPrompt = this.promptCache.getSystemPromptContent();
    const bestPractices = this.promptCache.getBestPracticesPromptContent();
    const instructions = `# Bamboo Meta Ads AI Agent Instructions

You are an expert Meta advertising specialist. Use these instructions and context for all interactions:

## System Context
${systemPrompt || 'System prompt not available'}

## Best Practices
${bestPractices || 'Best practices not available'}

Use this context to provide expert guidance on Meta advertising operations, campaign optimization, and strategic recommendations.`;

    this.mcpServer = new McpServer(
      { name: 'Bamboo MCP', version: '0.1.0' },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
        instructions,
      }
    );

    // Register all tools, prompts, and resources once at startup
    const toolsHandler = new MetaToolsHandler();
    const promptRegistry = new PromptRegistry(this.mcpServer);
    const resourceRegistry = new ResourceRegistry(this.mcpServer);
    const toolRegistry = new ToolRegistry(this.mcpServer, toolsHandler);

    promptRegistry.register();
    resourceRegistry.register();
    this.toolNames = toolRegistry.register();

    logger.info('CoreServices singleton constructor completed with MCP server configuration.');
  }

  /**
   * Initializes all asynchronous core services and returns the singleton instance.
   * This method is idempotent and safe to call concurrently.
   *
   * @returns A promise that resolves with the singleton instance.
   */
  public static initialize(): Promise<CoreServices> {
    if (CoreServices.instance) {
      return Promise.resolve(CoreServices.instance);
    }
    if (!CoreServices.initializationPromise) {
      CoreServices.initializationPromise = CoreServices.performInitialization();
    }
    return CoreServices.initializationPromise;
  }

  private static async performInitialization(): Promise<CoreServices> {
    logger.info('Initializing CoreServices with MCP server singleton');
    try {
      // Try to initialize prompt cache, but don't fail if it's not available
      try {
        await promptContentCache.initialize();
        logger.info('Prompt content cache initialized successfully');
      } catch (promptError) {
        logger.warn('Prompt content cache initialization failed, continuing without prompts', {
          error: promptError instanceof Error ? promptError.message : String(promptError),
        });
      }
      
      CoreServices.instance = new CoreServices();
      logger.info('CoreServices initialization completed', {
        toolCount: CoreServices.instance.toolNames.length,
        toolNames: CoreServices.instance.toolNames.sort(),
      });
      return CoreServices.instance;
    } catch (error) {
      logger.error('CoreServices initialization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Reset promise on failure to allow retries
      CoreServices.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get the singleton instance (must be initialized first).
   */
  public static getInstance(): CoreServices {
    if (!CoreServices.instance) {
      throw new InitializationError('CoreServices not initialized. Call initialize() first.');
    }
    return CoreServices.instance;
  }

  /**
   * Get the configured MCP server instance.
   */
  public getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the list of all registered tool names.
   */
  public getToolNames(): string[] {
    return [...this.toolNames]; // Return a copy to prevent mutation
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public async destroy(): Promise<void> {
    this.authProvider.destroy();
    try {
      await this.mcpServer.close();
      logger.info('CoreServices destroyed successfully');
    } catch (error) {
      logger.error('Error during CoreServices destruction', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
