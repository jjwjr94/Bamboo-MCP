import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { JWTPayload } from '../../types/auth.js';
import { createMcpErrorResult } from '../errorHandler.js';
import { type CreateMcpSuccessResultOptions, createMcpSuccessResult } from '../responseHelper.js';
import { createMcpOutputSchema } from '../types.js';

/**
 * Creates and registers an MCP tool with discriminated union outputs.
 * This helper wraps a handler call that returns a clean domain object, and
 * automatically formats the result into the standard MCP success structure.
 *
 * It simplifies handler implementation by abstracting away the MCP-specific
 * response format. Handlers can focus on returning pure data objects.
 *
 * @param server The MCP server instance.
 * @param toolName The name of the tool.
 * @param definition The tool's definition including title, description, and schemas.
 * @param handlerCall The handler function that takes an auth payload and params, and returns a promise of the clean domain result.
 * @param successMessage A static message to be used as the human-readable description for successful calls.
 * @param options Optional configuration for the success result, including attachPrompts for context initialization.
 * @returns The tool name that was registered.
 */
export function createMcpTool<TInputSchema extends ZodTypeAny, TSuccessSchema extends ZodTypeAny>(
  server: McpServer,
  toolName: string,
  definition: {
    title: string;
    description: string;
    inputSchema: TInputSchema | Record<string, ZodTypeAny>;
    successDataSchema: TSuccessSchema;
  },
  // biome-ignore lint/suspicious/noExplicitAny: Complex generic constraints require any for flexible parameter handling
  handlerCall: (authPayload: JWTPayload, params: any) => Promise<unknown>,
  successMessage: string,
  options?: CreateMcpSuccessResultOptions
): string {
  server.registerTool(
    toolName,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema as Record<string, ZodTypeAny>,
      outputSchema: createMcpOutputSchema(definition.successDataSchema),
    },
    async (params, extra) => {
      try {
        const authPayload = extractAuthPayload(extra);

        // Call the handler which now returns a clean domain object
        // biome-ignore lint/suspicious/noExplicitAny: Runtime type assertion needed for MCP parameter handling
        const typedParams = params as any;
        const domainResult = await handlerCall(authPayload, typedParams);

        // Automatically wrap the clean result into the MCP success format
        return await createMcpSuccessResult(domainResult, successMessage, options);
      } catch (error) {
        // Error handling remains the same, wrapping errors in the MCP format
        return createMcpErrorResult(error);
      }
    }
  );

  return toolName;
}

/**
 * Common deletion confirmation schema for all deletion tools.
 * Ensures consistent behavior across the codebase for permanent deletion operations.
 */
export const DeletionConfirmationSchema = z.literal(true, {
  errorMap: () => ({
    message: 'Permanent deletion was not confirmed. Set confirmPermanentDelete to true to proceed.',
  }),
});

/**
 * Creates a standardized success schema for delete operations.
 * @param idKey The name of the ID field (e.g., 'campaignId', 'adSetId').
 * @param description Optional description for the ID field.
 */
export function createDeletionSuccessSchema(idKey: string, description?: string) {
  return z.object({
    [idKey]: z.string().describe(description || `The ${idKey} that was deleted.`),
  });
}

/**
 * Creates a standardized success schema for bulk delete operations.
 * @param idKey The name of the ID field (e.g., 'campaignIds', 'adSetIds').
 * @param description Optional description for the ID array field.
 */
export function createBulkDeletionSuccessSchema(idKey: string, description?: string) {
  return z.object({
    [idKey]: z.array(z.string()).describe(description || `The ${idKey} that were deleted.`),
    deletedCount: z.number().describe('The number of items successfully deleted.'),
  });
}
