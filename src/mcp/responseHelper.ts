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
 * Options for configuring the behavior of createMcpSuccessResult.
 */
export interface CreateMcpSuccessResultOptions {
  /**
   * If true, attaches the system prompt and best practices as embedded resources.
   * This is useful for initializing the AI's context at the start of a session.
   * Defaults to false to conserve context window space on subsequent calls.
   */
  attachPrompts?: boolean;

  /**
   * Optional array of tool names to include in the response when attachPrompts is true.
   * This provides the MCP client with a complete manifest of available tools to prevent hallucination.
   */
  toolNames?: string[];
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

  const { attachPrompts = false, toolNames = [] } = options;
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

  // Add tool names as TextContent when attachPrompts is true and toolNames are provided
  if (attachPrompts && toolNames.length > 0) {
    const sortedToolNames = toolNames.sort();
    const toolManifestContent: TextContent = {
      type: 'text',
      text: `Available MCP Tools: ${JSON.stringify(sortedToolNames, null, 2)}`,
    };
    content.push(toolManifestContent);
  }

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
