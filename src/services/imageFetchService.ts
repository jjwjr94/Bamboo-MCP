import { AuthorizationError, TimeoutError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ImageData {
  base64Data: string;
  mimeType: string;
  size: number;
}

export interface ImageFetchOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
  allowedMimeTypes?: string[];
}

const DEFAULT_OPTIONS: Required<ImageFetchOptions> = {
  maxSizeBytes: 2 * 1024 * 1024, // 2MB
  timeoutMs: 10000, // 10 seconds
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};

export class ImageFetchService {
  static async fetchImageAsBase64(
    imageUrl: string,
    options: ImageFetchOptions = {}
  ): Promise<ImageData> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      logger.debug('Fetching image for base64 conversion', { imageUrl, options: opts });

      ImageFetchService.assertAllowedDomain(new URL(imageUrl).hostname);
      const response = await ImageFetchService.fetchWithTimeout(imageUrl, opts.timeoutMs);
      ImageFetchService.assertAllowedDomain(new URL(response.url).hostname);

      const { base64Data, mimeType, size } = await ImageFetchService.validateAndExtractImage(
        response,
        opts as Required<ImageFetchOptions>
      );

      logger.debug('Successfully converted image to base64', {
        imageUrl,
        finalUrl: response.url,
        size,
        mimeType,
      });

      return { base64Data, mimeType, size };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Image fetch timed out', { imageUrl });
        throw new TimeoutError(`Image fetch timed out for URL: ${imageUrl}`);
      }

      logger.warn('Failed to fetch image for base64 conversion', {
        imageUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      if (
        error instanceof AuthorizationError ||
        error instanceof ValidationError ||
        error instanceof TimeoutError
      ) {
        throw error;
      }

      throw new ValidationError(
        `Failed to fetch image from ${imageUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensure the provided hostname belongs to an allowed CDN domain.
   * @throws AuthorizationError when the hostname is not permitted.
   */
  private static assertAllowedDomain(hostname: string): void {
    if (!ImageFetchService.isAllowedDomain(hostname)) {
      throw new AuthorizationError(`Domain not allowed: ${hostname}`);
    }
  }

  /**
   * Perform a fetch call that is automatically aborted after the given timeout.
   */
  private static async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Bamboo-MCP/1.0' },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate response status, headers, and size, then convert to base64.
   */
  private static async validateAndExtractImage(
    response: Response,
    opts: Required<ImageFetchOptions>
  ): Promise<{ base64Data: string; mimeType: string; size: number }> {
    if (!response.ok) {
      throw new ValidationError(`HTTP ${response.status}: ${response.statusText}`);
    }

    const mimeType = response.headers.get('content-type') || '';
    if (!opts.allowedMimeTypes.includes(mimeType)) {
      throw new ValidationError(`MIME type not allowed: ${mimeType}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader && Number.parseInt(contentLengthHeader, 10) > opts.maxSizeBytes) {
      throw new ValidationError(`Image too large: ${contentLengthHeader} bytes`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > opts.maxSizeBytes) {
      throw new ValidationError(`Image too large: ${arrayBuffer.byteLength} bytes`);
    }

    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    return { base64Data, mimeType, size: arrayBuffer.byteLength };
  }

  private static isAllowedDomain(hostname: string): boolean {
    const allowedDomains = [
      'scontent.cdninstagram.com',
      'scontent.facebookcdn.net',
      'external.cdninstagram.com',
      'scontent-*.cdninstagram.com',
      'scontent-*.facebookcdn.net',
      'fbcdn.net',
      'xx.fbcdn.net',
    ];

    return allowedDomains.some((domain) => {
      if (domain.includes('*')) {
        // Replace wildcard with a more specific pattern that doesn't cross dots
        const pattern = `^${domain.replace(/\./g, '\\.').replace(/\*/g, '[a-zA-Z0-9-]+')}$`;
        return new RegExp(pattern).test(hostname);
      }
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });
  }

  static async fetchMultipleImagesAsBase64(
    imageUrls: string[],
    options: ImageFetchOptions = {},
    concurrencyLimit = 10
  ): Promise<Map<string, ImageData | Error>> {
    const results = new Map<string, ImageData | Error>();

    if (imageUrls.length === 0) {
      return results;
    }

    logger.debug('Fetching multiple images in parallel', {
      count: imageUrls.length,
      concurrencyLimit,
      urls: imageUrls,
    });

    const queue = [...imageUrls];
    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < Math.min(concurrencyLimit, imageUrls.length); i++) {
      workerPromises.push(ImageFetchService.worker(queue, options, results));
    }

    await Promise.all(workerPromises);

    const successCount = Array.from(results.values()).filter((r) => !(r instanceof Error)).length;
    logger.info('Completed parallel image fetching', {
      total: imageUrls.length,
      successful: successCount,
      failed: imageUrls.length - successCount,
    });

    return results;
  }

  private static async worker(
    queue: string[],
    options: ImageFetchOptions,
    results: Map<string, ImageData | Error>
  ): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) continue;

      try {
        const imageData = await ImageFetchService.fetchImageAsBase64(url, options);
        results.set(url, imageData);
      } catch (error) {
        results.set(url, error as Error);
      }
    }
  }
}
