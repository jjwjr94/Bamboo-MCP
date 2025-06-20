import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Sanitized } from '../types/utils.js';
import { removeUnderscoreProperties } from '../utils/objectUtils.js';

/**
 * Creates a success CallToolResult with both content and structuredContent fields.
 * This function automatically sanitizes the response data by recursively removing
 * any properties starting with an underscore (`_`). This prevents leaking internal
 * SDK properties (e.g., a `_api` object containing an access token) to the model
 * or end-user.
 *
 * @param data - The successful result payload as an object
 * @param description - Optional description for the response's metadata
 * @returns A sanitized CallToolResult object with type-safe structured content
 */
/**
 * A structured success object for the structuredContent field of a CallToolResult.
 * Follows a discriminated union pattern with `type: 'success'`.
 */
export interface McpStructuredSuccess<T> {
  type: 'success';
  data: T;
  [key: string]: unknown;
}

export function createMcpSuccessResult<T>(
  data: T,
  description?: string
): CallToolResult & { structuredContent: McpStructuredSuccess<Sanitized<T>> } {
  // Sanitize the data to remove internal properties (e.g., _api with access tokens)
  const sanitizedData = removeUnderscoreProperties(data);

  // Wrap the data in the standardized success structure
  const successContent: McpStructuredSuccess<Sanitized<T>> = {
    type: 'success',
    data: sanitizedData,
  };

  const textHumanReadableContent: TextContent | undefined = description
    ? {
        type: 'text',
        // Use the human-readable description if available, otherwise serialize the structured content.
        // This provides a more useful summary for text-only clients, similar to error messages.
        text: description,
      }
    : undefined;

  const textStructuredContent: TextContent = {
    type: 'text',
    // From the 2025-06-18 MCP spec:
    // For backwards compatibility, a tool that returns structured content SHOULD also return
    // functionally equivalent unstructured content. (For example, serialized JSON can be returned
    // in a TextContent block.)
    text: JSON.stringify(successContent, null, 2),
  };

  const result = {
    // Filter out textHumanReadableContent if it's undefined
    content: [textHumanReadableContent, textStructuredContent].filter(Boolean),
    structuredContent: successContent,
    isError: false,
  } as CallToolResult & { structuredContent: McpStructuredSuccess<Sanitized<T>> };

  if (description) {
    result._meta = {
      description,
    };
  }

  return result;
}
