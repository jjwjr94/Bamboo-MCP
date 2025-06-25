import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZodObject, ZodTypeAny } from 'zod';
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
 */
export function createMcpTool<
  TInputSchema extends Record<string, ZodTypeAny>,
  TSuccessSchema extends ZodTypeAny,
>(
  server: McpServer,
  toolName: string,
  definition: {
    title: string;
    description: string;
    inputSchema: TInputSchema;
    successDataSchema: TSuccessSchema;
  },
  handlerCall: (
    authPayload: JWTPayload,
    params: z.infer<ZodObject<TInputSchema>>
  ) => Promise<unknown>,
  successMessage: string,
  options?: CreateMcpSuccessResultOptions
) {
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
        const typedParams = params as unknown as z.infer<ZodObject<TInputSchema>>;
        const domainResult = await handlerCall(authPayload, typedParams);

        // Automatically wrap the clean result into the MCP success format
        return await createMcpSuccessResult(domainResult, successMessage, options);
      } catch (error) {
        // Error handling remains the same, wrapping errors in the MCP format
        return createMcpErrorResult(error);
      }
    }
  );
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
