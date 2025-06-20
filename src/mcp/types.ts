import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetaToolsHandler } from '../tools/meta/toolsHandler.js';
import { mcpErrorSchema } from './errorHandler.js';

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

/**
 * Creates a Zod schema for an MCP tool's output, structured as a discriminated union
 * to handle both success and error cases. This ensures type-safe parsing of tool results.
 *
 * The `success` case includes the provided `successDataSchema` within a `data` property.
 * The `error` case conforms to the standardized `mcpErrorSchema` from errorHandler.ts.
 *
 * @param successDataSchema - A Zod schema defining the structure of the successful output data.
 * @returns A Zod `discriminatedUnion` schema that can parse both successful and error responses.
 *
 * @example
 * const userProfileSchema = z.object({ id: z.string(), name: z.string() });
 * const toolOutputSchema = createMcpOutputSchema(userProfileSchema);
 *
 * // Valid success: { type: 'success', data: { id: '123', name: 'Alice' } }
 * // Valid error:   { type: 'error', message: '...', error: { ... } }
 */
export function createMcpOutputSchema<T extends z.ZodTypeAny>(successDataSchema: T) {
  const successSchema = z
    .object({
      type: z.literal('success'),
      data: successDataSchema,
    })
    .passthrough();

  return z.discriminatedUnion('type', [successSchema, mcpErrorSchema]);
}
