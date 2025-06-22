import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import {
  AdCreativeCallToActionTypeSchema,
  MetaAdCreativeResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';
import type { IToolRegistry } from '../types.js';

/**
 * Ad Creative Tool Registry
 *
 * Handles registration of ad creative-related MCP tools:
 * - get_ad_creatives: Retrieve ad creatives for an ad account
 * - create_ad_creative: Create a new ad creative
 * - update_ad_creative: Update an existing ad creative
 * - delete_ad_creative: Delete an ad creative
 */
export class AdCreativeToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetAdCreatives.bind(this),
      this.registerCreateAdCreative.bind(this),
      this.registerUpdateAdCreative.bind(this),
      this.registerDeleteAdCreative.bind(this),
      this.registerRequestCreativeUpload.bind(this),
      this.registerCheckUploadStatus.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Ad Creative';
  }

  /**
   * Register all ad creative-related MCP tools
   */
  public register(): void {
    logger.info('Registering Ad Creative MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Ad Creative MCP tools registered', { count: this.getToolCount() });
  }

  private registerGetAdCreatives(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adCreatives: z
          .array(MetaAdCreativeResponseSchema)
          .describe('A list of ad creatives with all available Meta API fields.'),
      }),
    });

    this.server.registerTool(
      'get_ad_creatives',
      {
        title: 'Get Ad Creatives',
        description:
          'Retrieves all ad creatives for a specific ad account. If no adAccountId is provided, uses the previously selected account or auto-selects if only one account is available.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.getAdCreatives(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCreateAdCreative(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adCreativeId: z.string(),
        name: z.string(),
      }),
    });

    this.server.registerTool(
      'create_ad_creative',
      {
        title: 'Create Ad Creative',
        description: 'Creates a new ad creative.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          name: z.string().describe('The name of the ad creative.'),
          objectStorySpec: z
            .object({
              pageId: z.string().describe('The ID of the Facebook Page.'),
              linkData: z
                .object({
                  link: z.string().describe('The destination URL for the ad.'),
                  message: z.string().optional().describe('The main text of the ad.'),
                  name: z.string().optional().describe('The headline of the ad.'),
                  description: z.string().optional().describe('The description text of the ad.'),
                  imageHash: z.string().optional().describe('Hash of the uploaded image to use.'),
                  callToAction: z
                    .object({
                      type: AdCreativeCallToActionTypeSchema.describe(
                        'The type of call-to-action button.'
                      ),
                      value: z
                        .object({
                          link: z.string().optional().describe('Optional link for the CTA.'),
                        })
                        .optional(),
                    })
                    .optional(),
                })
                .optional()
                .describe('Link data for link-based ads.'),
              videoData: z
                .object({
                  videoId: z.string().describe('The ID of the uploaded video.'),
                  title: z.string().optional().describe('The title of the video ad.'),
                  message: z.string().optional().describe('The main text of the video ad.'),
                  callToAction: z
                    .object({
                      type: AdCreativeCallToActionTypeSchema.describe(
                        'The type of call-to-action button.'
                      ),
                      value: z
                        .object({
                          link: z.string().optional().describe('Optional link for the CTA.'),
                        })
                        .optional(),
                    })
                    .optional(),
                })
                .optional()
                .describe('Video data for video-based ads.'),
            })
            .describe('The specification for the creative content.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.createAdCreative(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerUpdateAdCreative(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adCreativeId: z.string(),
        updatedFields: z.array(z.string()),
      }),
    });

    this.server.registerTool(
      'update_ad_creative',
      {
        title: 'Update Ad Creative',
        description: 'Updates an existing ad creative.',
        inputSchema: {
          adCreativeId: z.string().describe('The ID of the ad creative to update.'),
          name: z.string().describe('New name for the ad creative.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.updateAdCreative(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerDeleteAdCreative(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        adCreativeId: z.string(),
      }),
    });

    this.server.registerTool(
      'delete_ad_creative',
      {
        title: 'Delete Ad Creative',
        description: 'Permanently deletes an ad creative. This action cannot be undone.',
        inputSchema: {
          adCreativeId: z.string().describe('The ID of the ad creative to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Must be set to true to confirm permanent deletion of the ad creative.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          // The handler validates raw API responses and sanitization is applied automatically
          return await this.toolsHandler.deleteAdCreative(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerRequestCreativeUpload(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        uploadId: z.string().describe('The unique ID for this upload operation.'),
        uploadUrl: z
          .string()
          .url()
          .describe('The URL for the user to upload the creative asset file via web interface.'),
      }),
    });

    this.server.registerTool(
      'request_creative_upload',
      {
        title: 'Request Creative Asset Upload',
        description:
          'Initiates a file upload process for creative assets. Returns a URL for the user to upload files via web interface, since MCP clients cannot directly transfer large files. Asset type (image/video) is automatically determined from the uploaded file.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
          filename: z
            .string()
            .min(1, 'Filename is required')
            .max(255, 'Filename too long')
            .regex(
              /^[^\/\\<>:"|?*]+$/,
              'Filename cannot contain path separators or special system characters (/ \\ < > : " | ? *)'
            )
            .describe('The name of the file to be uploaded.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.requestCreativeUpload(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCheckUploadStatus(): void {
    const outputSchema = z.object({
      type: z.literal('success'),
      data: z.object({
        status: z
          .enum(['pending', 'uploading', 'completed', 'failed'])
          .describe('The current status of the upload.'),
        metaAssetId: z
          .string()
          .optional()
          .describe(
            'The asset ID (hash for images, ID for videos) from Meta upon successful completion.'
          ),
        errorMessage: z.string().optional().describe('Details of the error if the upload failed.'),
      }),
    });

    this.server.registerTool(
      'check_upload_status',
      {
        title: 'Check Creative Asset Upload Status',
        description:
          'Checks the status of a file upload initiated by `request_creative_upload`. If completed, it returns the `metaAssetId` required to create an ad creative.',
        inputSchema: {
          uploadId: z.string().describe('The unique ID returned by `request_creative_upload`.'),
        },
        outputSchema: outputSchema.shape,
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.checkUploadStatus(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
