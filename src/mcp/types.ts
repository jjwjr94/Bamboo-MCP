import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaToolsHandler } from '../tools/meta/toolsHandler.js';

/**
 * Interface that all tool registries must implement
 * Provides consistent API for registration and introspection
 */
export interface IToolRegistry {
  /**
   * Register all MCP tools for this registry
   */
  register(): void;

  /**
   * Get the number of tools this registry provides
   * Useful for logging and debugging
   */
  getToolCount(): number;

  /**
   * Get a human-readable name for this registry
   * Used in logging and error reporting
   */
  getRegistryName(): string;
}

/**
 * Constructor interface for tool registries
 * Ensures all registries can be instantiated with the same parameters
 */
export interface IToolRegistryConstructor {
  new (server: McpServer, toolsHandler: MetaToolsHandler): IToolRegistry;
}
