import type {
  CallToolResult,
  EmbeddedResource,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import type { Sanitized } from '../types/utils.js';
import { logger } from '../utils/logger.js';
import { removeUnderscoreProperties } from '../utils/objectUtils.js';
import { redactSensitiveData } from '../utils/securityUtils.js';
import { promptContentCache } from './promptContent.js';

/**
 * Creates a success CallToolResult with both content and structuredContent fields.
 * This function automatically sanitizes the response data using a multi-layer approach
 * for defense in depth:
 *
 * 1.  **Redaction Layer**: Recursively finds and redacts sensitive data fields
 *     (e.g., `access_token`, `password`, `*_secret`) to prevent leakage.
 * 2.  **Sanitization Layer**: Recursively removes any properties starting with an
 *     underscore (`_`) to prevent leaking internal SDK properties.
 *
 * @param data - The successful result payload as an object
 * @param description - Optional description for the response's metadata
 * @returns A sanitized CallToolResult object with type-safe structured content
 */

/**
 * Options for configuring the behavior of createMcpSuccessResult.
 */
export interface CreateMcpSuccessResultOptions {
  /**
   * If true, attaches the system prompt and best practices as embedded resources.
   * This is useful for initializing the AI's context at the start of a session.
   * Defaults to false to conserve context window space on subsequent calls.
   */
  attachPrompts?: boolean;
}

/**
 * A structured success object for the structuredContent field of a CallToolResult.
 * Follows a discriminated union pattern with `type: 'success'`.
 */
export interface McpStructuredSuccess<T> {
  type: 'success';
  data: T;
  [key: string]: unknown;
}

/**
 * Creates embedded resources for system prompts that are included in tool call results.
 * This ensures Claude gets the prompt content with every successful tool call response.
 */
function createPromptEmbeddedResources(): EmbeddedResource[] {
  const resources: EmbeddedResource[] = [];

  // Only include resources if the prompt content cache is initialized
  if (!promptContentCache.isInitialized()) {
    logger.warn(
      'Prompt content cache not initialized, embedded prompt resources will be omitted from response'
    );
    return resources;
  }

  const systemPrompt = promptContentCache.getSystemPromptContent();
  const bestPractices = promptContentCache.getBestPracticesPromptContent();

  if (systemPrompt) {
    resources.push({
      type: 'resource',
      resource: {
        uri: 'bamboo://prompts/system',
        name: 'system-prompt',
        title: 'System Prompt',
        description:
          'Core system instructions defining the AI agent behavior and expertise for Meta advertising operations',
        mimeType: 'text/markdown',
        text: systemPrompt,
      },
    });
  }

  if (bestPractices) {
    resources.push({
      type: 'resource',
      resource: {
        uri: 'bamboo://prompts/best-practices',
        name: 'best-practices-prompt',
        title: 'Best Practices Prompt',
        description:
          'Comprehensive Meta Ads best practices organized by vertical and campaign objective for expert guidance',
        mimeType: 'text/markdown',
        text: bestPractices,
      },
    });
  }

  return resources;
}

export function createMcpSuccessResult<T>(
  data: T,
  description?: string,
  options: CreateMcpSuccessResultOptions = {}
): CallToolResult & { structuredContent: McpStructuredSuccess<Sanitized<T>> } {
  // Layer 1: Redact known sensitive fields first.
  const redactedData = redactSensitiveData(data);

  // Layer 2: Sanitize the redacted data to remove internal properties (e.g., _api).
  const sanitizedData = removeUnderscoreProperties(redactedData);

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

  const { attachPrompts = false } = options;
  // Conditionally create embedded resources for prompt content
  const embeddedResources = attachPrompts ? createPromptEmbeddedResources() : [];

  const result = {
    // Filter out textHumanReadableContent if it's undefined
    content: [textHumanReadableContent, textStructuredContent, ...embeddedResources].filter(
      Boolean
    ),
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
