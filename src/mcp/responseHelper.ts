import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
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
 * @returns A sanitized CallToolResult object
 */
export function createMcpSuccessResult<T>(
  data: T,
  description?: string
): CallToolResult & { structuredContent: T } {
  // Sanitize the data to remove internal properties (e.g., _api with access tokens)
  const sanitizedData = removeUnderscoreProperties(data);

  const textContent: TextContent = {
    type: 'text',
    text: JSON.stringify(sanitizedData, null, 2),
  };

  const result = {
    content: [textContent],
    structuredContent: sanitizedData,
    isError: false,
  } as CallToolResult & { structuredContent: T };

  if (description) {
    result._meta = {
      description,
    };
  }

  return result;
}
