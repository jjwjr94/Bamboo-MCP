import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extractAuthPayload } from '../auth/mcpAuthUtils.js';
import { logger } from '../utils/logger.js';
import { promptContentCache } from './promptContent.js';

export class PromptRegistry {
  private server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  public register(): void {
    logger.info('Registering MCP prompts...');

    // Get content from the single source of truth
    const systemPromptContent = promptContentCache.getSystemPromptContent();
    const bestPracticesPromptContent = promptContentCache.getBestPracticesPromptContent();

    if (!systemPromptContent || !bestPracticesPromptContent) {
      logger.warn('Prompt content not available, skipping prompt registration');
      return;
    }

    // Register system prompt
    this.server.registerPrompt(
      'context:system',
      {
        title: 'System Context',
        description:
          'Core system instructions defining the AI agent behavior and expertise for Meta advertising operations',
      },
      async (_args: unknown, _extra: unknown) => {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: systemPromptContent,
              },
            },
          ],
        };
      }
    );

    // Register best practices prompt
    this.server.registerPrompt(
      'context:best-practices',
      {
        title: 'Best Practices Context',
        description:
          'Comprehensive Meta Ads best practices organized by vertical and campaign objective for expert guidance',
      },
      async (_args: unknown, _extra: unknown) => {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: bestPracticesPromptContent,
              },
            },
          ],
        };
      }
    );

    // Register system prompt as a resource
    this.server.registerResource(
      'system-prompt-resource',
      'bamboo://prompts/system',
      {
        title: 'System Prompt Resource',
        description:
          'Core system instructions defining the AI agent behavior and expertise, available as a resource',
        mimeType: 'text/markdown',
      },
      async (uri: URL, extra: unknown) => {
        const authPayload = extractAuthPayload(extra);
        logger.info('Reading system prompt resource', {
          userId: authPayload.userId,
          uri: uri.href,
        });

        return {
          contents: [
            {
              uri: uri.href,
              name: 'system-prompt',
              title: 'System Prompt',
              description:
                'Core system instructions defining the AI agent behavior and expertise for Meta advertising operations',
              mimeType: 'text/markdown',
              text: systemPromptContent,
            },
          ],
        };
      }
    );

    // Register best practices prompt as a resource
    this.server.registerResource(
      'best-practices-prompt-resource',
      'bamboo://prompts/best-practices',
      {
        title: 'Best Practices Resource',
        description:
          'Comprehensive Meta Ads best practices for expert guidance, available as a resource',
        mimeType: 'text/markdown',
      },
      async (uri: URL, extra: unknown) => {
        const authPayload = extractAuthPayload(extra);
        logger.info('Reading best practices prompt resource', {
          userId: authPayload.userId,
          uri: uri.href,
        });

        return {
          contents: [
            {
              uri: uri.href,
              name: 'best-practices-prompt',
              title: 'Best Practices',
              description:
                'Comprehensive Meta Ads best practices for expert guidance, available as a resource',
              mimeType: 'text/markdown',
              text: bestPracticesPromptContent,
            },
          ],
        };
      }
    );

    logger.info('MCP prompts and resources registered', {
      prompts: 2,
      resources: 2,
    });
  }
}
