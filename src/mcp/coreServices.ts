import {
  type MetaServerAuthProvider,
  composeMetaServerAuthProvider,
} from '../auth/MetaServerAuthProvider.js';
import { InitializationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { promptContentCache } from './promptContent.js';

/**
 * Manages shared, expensive-to-create resources as a singleton.
 * This ensures that components like the prompt cache and auth provider are
 * initialized only once for the entire application lifecycle.
 */
export class CoreServices {
  private static instance: CoreServices;
  private static initializationPromise: Promise<CoreServices> | null = null;

  public readonly authProvider: MetaServerAuthProvider;
  public readonly promptCache: typeof promptContentCache;

  private constructor() {
    this.authProvider = composeMetaServerAuthProvider();
    this.promptCache = promptContentCache;
    logger.info('CoreServices singleton constructor called.');
  }

  /**
   * Initializes all asynchronous core services and returns the singleton instance.
   * This method is idempotent and safe to call concurrently.
   *
   * @returns A promise that resolves with the singleton instance.
   */
  public static initialize(): Promise<CoreServices> {
    if (CoreServices.instance) {
      return Promise.resolve(CoreServices.instance);
    }
    if (!CoreServices.initializationPromise) {
      CoreServices.initializationPromise = CoreServices.performInitialization();
    }
    return CoreServices.initializationPromise;
  }

  private static async performInitialization(): Promise<CoreServices> {
    logger.info('Initializing CoreServices');
    try {
      await promptContentCache.initialize();
      CoreServices.instance = new CoreServices();
      return CoreServices.instance;
    } catch (error) {
      logger.error('CoreServices initialization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Reset promise on failure to allow retries
      CoreServices.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get the singleton instance (must be initialized first).
   */
  public static getInstance(): CoreServices {
    if (!CoreServices.instance) {
      throw new InitializationError('CoreServices not initialized. Call initialize() first.');
    }
    return CoreServices.instance;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public destroy(): void {
    this.authProvider.destroy();
  }
}
