import type {
  CallToolResult,
  ContentBlock,
  EmbeddedResource,
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { ImageFetchService } from '../services/imageFetchService.js';
import type { Sanitized } from '../types/utils.js';
import { env } from '../utils/env.js';
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
 * Recursively extracts all `thumbnail_url` fields from a nested object structure.
 * Returns a deduplicated array of URL strings found in the data.
 *
 * @param data - The object to search for thumbnail URLs
 * @param visited - WeakSet to track visited objects and prevent circular references
 * @returns Array of unique thumbnail URLs found in the data
 */
function extractThumbnailUrls(data: unknown, visited: WeakSet<object> = new WeakSet()): string[] {
  const urls = new Set<string>();

  // Predicate helper to keep the thumbnail check logic in one place.
  function isThumbnailField(key: string, value: unknown): value is string {
    return key === 'thumbnail_url' && typeof value === 'string' && value.trim() !== '';
  }

  function handleArray(arr: unknown[]): void {
    for (const item of arr) {
      traverse(item);
    }
  }

  function handleObject(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (isThumbnailField(key, value)) {
        urls.add(value);
      } else {
        traverse(value);
      }
    }
  }

  function traverse(node: unknown): void {
    if (node == null || typeof node !== 'object') return;

    // Prevent circular references
    if (visited.has(node as object)) return;
    visited.add(node as object);

    if (Array.isArray(node)) {
      handleArray(node);
    } else {
      handleObject(node as Record<string, unknown>);
    }
  }

  traverse(data);
  return Array.from(urls);
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

export async function createMcpSuccessResult<T>(
  data: T,
  description?: string,
  options: CreateMcpSuccessResultOptions = {}
): Promise<CallToolResult> {
  // Layer 1: Redact known sensitive fields first.
  const redactedData = redactSensitiveData(data);

  // Layer 2: Sanitize the redacted data to remove internal properties (e.g., _api).
  const sanitizedData = removeUnderscoreProperties(redactedData);

  // Layer 3: Extract and fetch thumbnail images in parallel
  const thumbnailUrls = extractThumbnailUrls(sanitizedData);
  const imageResults = env.IMAGE_FETCH_ENABLED
    ? await ImageFetchService.fetchMultipleImagesAsBase64(thumbnailUrls, {
        maxSizeBytes: env.IMAGE_MAX_SIZE_BYTES,
        timeoutMs: env.IMAGE_FETCH_TIMEOUT_MS,
      })
    : new Map<string, import('../services/imageFetchService.js').ImageData | Error>();

  // Wrap the data in the standardized success structure
  const successContent: McpStructuredSuccess<Sanitized<T>> = {
    type: 'success',
    data: sanitizedData,
  };

  const { attachPrompts = false } = options;

  // Always wrap the success content for discriminated union compatibility
  const finalStructuredContent = { result: successContent };

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
    text: JSON.stringify(finalStructuredContent, null, 2),
  };

  // Conditionally create embedded resources for prompt content
  const embeddedResources = attachPrompts ? createPromptEmbeddedResources() : [];

  const content: ContentBlock[] = [];

  // Add human-readable description if provided
  if (textHumanReadableContent) {
    content.push(textHumanReadableContent);
  }

  // Add structured JSON content for backwards compatibility
  content.push(textStructuredContent);

  // Track failed image fetches for error reporting
  const failedFetches: { url: string; error: string }[] = [];

  // Add successfully fetched images as ImageContent blocks
  for (const [url, result] of Array.from(imageResults.entries())) {
    if (result instanceof Error) {
      failedFetches.push({ url, error: result.message });
      logger.warn('Failed to fetch image for MCP response', { url, error: result.message });
    } else {
      const imageContent: ImageContent = {
        type: 'image',
        data: result.base64Data,
        mimeType: result.mimeType,
        _meta: {
          originalUrl: url,
          size: result.size,
        },
      };
      content.push(imageContent);
    }
  }

  // Add embedded resources
  content.push(...embeddedResources);

  const result: CallToolResult = {
    content,
    structuredContent: finalStructuredContent,
    isError: false,
  };

  // Add metadata including description and error information
  if (description || failedFetches.length > 0) {
    result._meta = {
      ...(description && { description }),
      ...(failedFetches.length > 0 && { errors: { imageFetches: failedFetches } }),
    };
  }

  return result;
}
