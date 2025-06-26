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
 * Creates a standardized Zod output schema shape for an MCP tool that handles both success and error cases.
 *
 * This function builds a schema that wraps a tool's output in a standard envelope,
 * allowing for both successful data and structured errors to be represented.
 *
 * The key reason for this helper is to work around a requirement of the MCP SDK's
 * `registerTool` function. The `outputSchema` property expects a Zod "raw shape"
 * (i.e., the plain object passed to `z.object({...})`), not a compiled `ZodObject` instance.
 *
 * This function constructs a `z.discriminatedUnion` for success/error cases, wraps it in a
 * `{ result: ... }` object, and returns the `.shape` of that object. This provides the
 * raw shape that the SDK requires, while still enabling type-safe parsing of tool outputs.
 *
 * @param successDataSchema - A Zod schema defining the structure of the successful output data.
 * This will be nested under `result.data` in the final output.
 * @returns A `ZodRawShape` object `{ result: ZodDiscriminatedUnion<...> }` that is compatible
 * with the `outputSchema` property in `registerTool`.
 *
 * @example
 * const userProfileSchema = z.object({ id: z.string(), name: z.string() });
 *
 * // This creates a shape, not a ZodObject instance
 * const toolOutputShape = createMcpOutputSchema(userProfileSchema);
 *
 * // Used in a tool definition like this:
 * // server.registerTool('getUser', {
 * //   ...
 * //   outputSchema: toolOutputShape,
 * // });
 *
 * // Valid success output: { result: { type: 'success', data: { id: '123', name: 'Alice' } } }
 * // Valid error output:   { result: { type: 'error', message: '...', error: { ... } } }
 */
export function createMcpOutputSchema<T extends z.ZodTypeAny>(successDataSchema: T) {
  const successSchema = z
    .object({
      type: z.literal('success'),
      data: successDataSchema,
    })
    .passthrough();

  const discriminatedUnion = z.discriminatedUnion('type', [successSchema, mcpErrorSchema]);

  return z.object({ result: discriminatedUnion }).shape;
}
