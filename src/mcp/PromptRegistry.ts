import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extractAuthPayload } from '../auth/mcpAuthUtils.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Use import.meta.url to safely resolve file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDir = path.resolve(__dirname, '../prompts');

export class PromptRegistry {
  private server: McpServer;
  private systemPromptContent: string | null = null;
  private bestPracticesPromptContent: string | null = null;

  constructor(server: McpServer) {
    this.server = server;
  }

  public getSystemPromptContent(): string | null {
    return this.systemPromptContent;
  }

  public getBestPracticesPromptContent(): string | null {
    return this.bestPracticesPromptContent;
  }

  public async initialize(): Promise<void> {
    logger.info('Initializing and caching MCP prompts...');
    try {
      [this.systemPromptContent, this.bestPracticesPromptContent] = await Promise.all([
        readFile(path.join(promptsDir, 'system_prompt.md'), 'utf-8'),
        readFile(path.join(promptsDir, 'best_practices.md'), 'utf-8'),
      ]);

      // Validate that prompt files are not empty
      if (!this.systemPromptContent || this.systemPromptContent.trim().length === 0) {
        logger.error(
          'System prompt file is empty or contains only whitespace. This is a fatal error.'
        );
        process.exit(1);
      }

      if (!this.bestPracticesPromptContent || this.bestPracticesPromptContent.trim().length === 0) {
        logger.error(
          'Best practices prompt file is empty or contains only whitespace. This is a fatal error.'
        );
        process.exit(1);
      }

      logger.info('MCP prompts cached successfully');
    } catch (error) {
      logger.error('Failed to initialize and cache MCP prompts. This is a fatal error.', { error });
      // This is a startup failure, so we should exit the process
      process.exit(1);
    }
  }

  public register(): void {
    logger.info('Registering MCP prompts...');

    // Register system prompt
    this.server.registerPrompt(
      'context:system',
      {
        title: 'System Context',
        description:
          'Core system instructions defining the AI agent behavior and expertise for Meta advertising operations',
      },
      async (_args: unknown, _extra: unknown) => {
        // Claude doesn't send auth payload when requesting prompts
        // const authPayload = extractAuthPayload(extra);
        // logger.info('Serving cached system prompt', {
        //   userId: authPayload.userId,
        // });

        if (this.systemPromptContent === null) {
          // This should not happen if initialize() succeeded
          logger.error('System prompt content is not cached - initialization may have failed');
          throw new NotFoundError('System prompt');
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: this.systemPromptContent,
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
        // Claude doesn't send auth payload when requesting prompts
        // const authPayload = extractAuthPayload(extra);
        // logger.info('Serving cached best practices prompt', {
        //   userId: authPayload.userId,
        // });

        if (this.bestPracticesPromptContent === null) {
          // This should not happen if initialize() succeeded
          logger.error(
            'Best practices prompt content is not cached - initialization may have failed'
          );
          throw new NotFoundError('Best practices prompt');
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: this.bestPracticesPromptContent,
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

        if (this.systemPromptContent === null) {
          logger.error('System prompt content is not cached - initialization may have failed');
          throw new NotFoundError('System prompt resource');
        }

        return {
          contents: [
            {
              uri: uri.href,
              name: 'system-prompt',
              title: 'System Prompt',
              description:
                'Core system instructions defining the AI agent behavior and expertise for Meta advertising operations',
              mimeType: 'text/markdown',
              text: this.systemPromptContent,
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

        if (this.bestPracticesPromptContent === null) {
          logger.error(
            'Best practices prompt content is not cached - initialization may have failed'
          );
          throw new NotFoundError('Best practices prompt resource');
        }

        return {
          contents: [
            {
              uri: uri.href,
              name: 'best-practices-prompt',
              title: 'Best Practices Prompt',
              description:
                'Comprehensive Meta Ads best practices organized by vertical and campaign objective for expert guidance',
              mimeType: 'text/markdown',
              text: this.bestPracticesPromptContent,
            },
          ],
        };
      }
    );

    logger.info('MCP prompts and resources registered successfully', { prompts: 2, resources: 2 });
  }
}
