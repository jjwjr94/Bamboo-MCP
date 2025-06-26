import { ValidationError } from './errors.js';

// Curated list of MIME types supported by Meta Marketing API for ad creatives
// Based on official Meta API documentation
const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg', // Some browsers use this variant
  'image/png',
  'image/gif',
  'image/webp',
]);

const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/mov',
  'video/quicktime', // Alternative for .mov files
]);

/**
 * Detects the creative asset type from a given MIME type string.
 *
 * This utility uses an allow-list of specific MIME types supported by Meta's
 * Marketing API to ensure files are valid before attempting upload.
 *
 * @param mimeType - The MIME type of the uploaded file (e.g., 'image/jpeg', 'video/mp4')
 * @returns The detected asset type ('image' or 'video')
 * @throws ValidationError if the MIME type is not in the supported allow-list
 */
export function detectAssetTypeFromMimeType(mimeType: string): 'image' | 'video' {
  // Defensive check for null, undefined, or empty MIME type
  if (!mimeType || typeof mimeType !== 'string' || mimeType.trim() === '') {
    throw new ValidationError(
      'Missing or invalid MIME type. Please upload a supported image (JPEG, PNG, GIF, WebP) or video (MP4, MOV) format.'
    );
  }

  const normalizedMimeType = mimeType.toLowerCase().trim();
  if (SUPPORTED_IMAGE_MIMES.has(normalizedMimeType)) {
    return 'image';
  }

  if (SUPPORTED_VIDEO_MIMES.has(normalizedMimeType)) {
    return 'video';
  }

  throw new ValidationError(
    `Unsupported file type: '${mimeType}'. Please upload a supported image (JPEG, PNG, GIF, WebP) or video (MP4, MOV) format.`
  );
}
