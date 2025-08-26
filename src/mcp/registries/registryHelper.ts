import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZodRawShape, ZodTypeAny } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import type { JWTPayload } from '../../types/auth.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import { type CreateMcpSuccessResultOptions, createMcpSuccessResult } from '../responseHelper.js';
import { createMcpOutputSchema } from '../types.js';

/**
 * A type constraint for MCP tool input schemas.
 * Ensures the schema is a ZodObject or a ZodEffects schema wrapping a ZodObject.
 * This is required by `extractShape` to get the raw shape for the MCP SDK.
 */
type McpToolInputSchema = z.ZodObject<ZodRawShape> | z.ZodEffects<z.ZodObject<ZodRawShape>>;

/**
 * Creates and registers an MCP tool with full Zod validation and type safety.
 *
 * This helper ensures complete runtime validation including complex refinements,
 * while providing the raw shape to the MCP SDK for metadata generation.
 *
 * Key improvements:
 * - Accepts only ZodObject and ZodEffects (refined schemas) for maximum type safety
 * - Performs validation internally before calling handlers
 * - Provides strongly-typed parameters to handlers
 * - Enforces type-safe handler return values that match successDataSchema
 * - Validates handler output at runtime to ensure schema conformance
 * - Maintains MCP SDK compatibility by extracting underlying object shape
 * - Eliminates runtime normalization for better performance and consistency
 *
 * @param server The MCP server instance.
 * @param toolName The name of the tool.
 * @param definition The tool's definition including title, description, and schemas.
 * @param definition.inputSchema A ZodObject or ZodEffects schema for validating input parameters.
 * @param definition.successDataSchema A Zod schema that defines the expected return type from handlers.
 * @param handlerCall The handler function that takes an auth payload and validated, typed params, and returns data matching successDataSchema.
 * @param successMessage A static message to be used as the human-readable description for successful calls.
 * @param options Optional configuration for the success result, including attachPrompts for context initialization.
 * @returns The tool name that was registered.
 *
 * @note The inputSchema must be a ZodObject or a refined ZodEffects schema to ensure
 * full type-safety and runtime validation of all parameters, including complex refinements.
 * The handlerCall return type is now enforced to match successDataSchema for end-to-end type safety.
 */
export function createMcpTool<
  TInputSchema extends McpToolInputSchema,
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
    params: z.infer<TInputSchema>
  ) => Promise<z.infer<TSuccessSchema>>,
  successMessage: string,
  options?: CreateMcpSuccessResultOptions
): string {
  /**
   * Extracts the raw shape from a Zod schema for MCP SDK compatibility.
   * Uses Zod's public APIs to safely support both plain and refined schemas.
   */
  const extractShape = (schema: TInputSchema): z.ZodRawShape => {
    // For ZodEffects (refined schemas), access the underlying schema using the public API.
    // The `McpToolInputSchema` constraint ensures the inner schema is a ZodObject.
    if (schema instanceof z.ZodEffects) {
      return schema.innerType().shape;
    }

    // For a plain ZodObject, directly access its shape.
    // The type guard is exhaustive because `TInputSchema` can only be one of these two types.
    return schema.shape;
  };

  server.registerTool(
    toolName,
    {
      title: definition.title,
      description: definition.description,
      // Extract raw shape for MCP SDK metadata/documentation compatibility
      inputSchema: extractShape(definition.inputSchema),
      outputSchema: createMcpOutputSchema(definition.successDataSchema),
    },
    async (params, extra) => {
      try {
        const authPayload = extractAuthPayload(extra);

        // CRITICAL: Perform full validation including refinements
        const validationResult = definition.inputSchema.safeParse(params);
        if (!validationResult.success) {
          // Add detailed logging for developers/debugging
          logger.warn('MCP tool input validation failed', {
            toolName,
            params, // Log the raw input that failed
            error: validationResult.error.format(), // Log the formatted error
          });
          const firstIssue = validationResult.error.issues[0];
          const errorMessage = `Invalid input for tool '${toolName}'. Field '${firstIssue.path.join('.')}': ${firstIssue.message}`;
          throw new ValidationError(errorMessage);
        }

        // Handler receives fully validated and strongly-typed parameters
        const domainResult = await handlerCall(authPayload, validationResult.data);

        // CRITICAL: Add runtime validation for the handler's output
        const successDataResult = definition.successDataSchema.safeParse(domainResult);
        if (!successDataResult.success) {
          logger.error('Handler returned invalid success data', {
            toolName,
            error: successDataResult.error.format(),
            domainResult,
          });
          throw new Error(
            `Internal Server Error: Tool '${toolName}' produced an invalid response.`
          );
        }

        // Automatically wrap the clean, validated result into the MCP success format
        return await createMcpSuccessResult(successDataResult.data, successMessage, options);
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
