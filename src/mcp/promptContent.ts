import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Use import.meta.url to safely resolve file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDir = path.resolve(__dirname, '../prompts');

/**
 * Global cache for prompt content that can be accessed from anywhere in the application.
 * This is initialized once during server startup and used by response helpers.
 */
class PromptContentCache {
  private systemPromptContent: string | null = null;
  private bestPracticesPromptContent: string | null = null;
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing global prompt content cache...');
    try {
      [this.systemPromptContent, this.bestPracticesPromptContent] = await Promise.all([
        readFile(path.join(promptsDir, 'system_prompt.md'), 'utf-8'),
        readFile(path.join(promptsDir, 'best_practices.md'), 'utf-8'),
      ]);

      // Validate that prompt files are not empty
      if (!this.systemPromptContent || this.systemPromptContent.trim().length === 0) {
        throw new ValidationError('System prompt file is empty or contains only whitespace');
      }

      if (!this.bestPracticesPromptContent || this.bestPracticesPromptContent.trim().length === 0) {
        throw new ValidationError(
          'Best practices prompt file is empty or contains only whitespace'
        );
      }

      this.initialized = true;
      logger.info('Global prompt content cache initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize global prompt content cache', { error });
      throw error;
    }
  }

  public getSystemPromptContent(): string | null {
    return this.systemPromptContent;
  }

  public getBestPracticesPromptContent(): string | null {
    return this.bestPracticesPromptContent;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

// Global singleton instance
export const promptContentCache = new PromptContentCache();
