import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodObject, ZodTypeAny, z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { JWTPayload } from '../../types/auth.js';
import { createMcpErrorResult } from '../errorHandler.js';
import { createMcpSuccessResult } from '../responseHelper.js';
import { createMcpOutputSchema } from '../types.js';

/**
 * Creates and registers an MCP tool with discriminated union outputs.
 * This wraps existing handler calls that return CallToolResult and transforms them
 * to the new discriminated union format automatically.
 *
 * Preserves dynamic success messages from handlers and provides type safety.
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
  ) => Promise<CallToolResult>,
  successMessage: string
) {
  server.registerTool(
    toolName,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema as any, // MCP SDK requires specific type format
      outputSchema: createMcpOutputSchema(definition.successDataSchema),
    },
    async (params, extra) => {
      try {
        const authPayload = extractAuthPayload(extra);

        // Call the existing handler which returns CallToolResult
        const handlerResult = await handlerCall(authPayload, params as any);

        // Extract data from the success result and re-wrap for discriminated union
        if (
          handlerResult.structuredContent &&
          typeof handlerResult.structuredContent === 'object' &&
          'data' in handlerResult.structuredContent &&
          !handlerResult.isError
        ) {
          const data = (handlerResult.structuredContent as { data: unknown }).data;
          // Prefer the dynamic message from the handler's result, fall back to the static message
          const message = (handlerResult._meta?.description as string) || successMessage;
          return await createMcpSuccessResult(data, message, {
            useResultWrapper: true,
          });
        }

        throw new Error(`Handler for tool '${toolName}' returned unexpected result structure.`);
      } catch (error) {
        return createMcpErrorResult(error, { useResultWrapper: true });
      }
    }
  );
}
