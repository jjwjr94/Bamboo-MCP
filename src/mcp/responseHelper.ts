import type {
  CallToolResult,
  ContentBlock,
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

  if (!promptContentCache.isInitialized()) {
    logger.warn('Prompt cache not initialized, omitting embedded resources');
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
        description: 'Core system instructions for Meta advertising operations',
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
        description: 'Meta Ads best practices by vertical and campaign objective',
        mimeType: 'text/markdown',
        text: bestPractices,
      },
    });
  }

  return resources;
}

export async function createMcpSuccessResult<T>(
  data: T,
  description?: string,
  options: CreateMcpSuccessResultOptions = {}
): Promise<CallToolResult> {
  const redactedData = redactSensitiveData(data);
  const sanitizedData = removeUnderscoreProperties(redactedData);

  const successContent: McpStructuredSuccess<Sanitized<T>> = {
    type: 'success',
    data: sanitizedData,
  };

  const { attachPrompts = false } = options;
  const finalStructuredContent = { result: successContent };

  const textHumanReadableContent: TextContent | undefined = description
    ? {
        type: 'text',
        text: description,
      }
    : undefined;

  const textStructuredContent: TextContent = {
    type: 'text',
    // MCP spec backward compatibility: structured content as JSON
    text: JSON.stringify(finalStructuredContent, null, 2),
  };

  const embeddedResources = attachPrompts ? createPromptEmbeddedResources() : [];

  const content: ContentBlock[] = [];

  if (textHumanReadableContent) {
    content.push(textHumanReadableContent);
  }

  content.push(textStructuredContent);
  content.push(...embeddedResources);

  const result: CallToolResult = {
    content,
    structuredContent: finalStructuredContent,
    isError: false,
  };

  if (description) {
    result._meta = {
      description,
    };
  }

  return result;
}
