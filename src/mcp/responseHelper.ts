import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';

/**
 * Creates a success CallToolResult with both content and structuredContent fields
 * for backward compatibility with existing code patterns.
 *
 * @param data - The successful result payload as an object
 * @param description - Optional description for the response
 * @returns A CallToolResult object with both content and structuredContent
 */
export function createMcpSuccessResult<T>(
  data: T,
  description?: string
): CallToolResult & { structuredContent: T } {
  const textContent: TextContent = {
    type: 'text',
    text: JSON.stringify(data, null, 2),
  };

  const result = {
    content: [textContent],
    structuredContent: data,
    isError: false,
  } as CallToolResult & { structuredContent: T };

  // Add description in _meta if provided
  if (description) {
    result._meta = {
      description,
    };
  }

  return result;
}
