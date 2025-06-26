import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdCreativeCallToActionTypeSchema,
  MetaAdCreativeResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

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
      this.registerInitiateAssetUpload.bind(this),
      this.registerGetAssetUploadStatus.bind(this),
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
    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }
  }

  private registerGetAdCreatives(): void {
    const successDataSchema = z.object({
      adCreatives: z
        .array(MetaAdCreativeResponseSchema)
        .describe('A list of ad creatives with all available Meta API fields.'),
    });

    createMcpTool(
      this.server,
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
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdCreatives(authPayload, params),
      'Successfully retrieved ad creatives.'
    );
  }

  private registerCreateAdCreative(): void {
    const successDataSchema = z.object({
      adCreativeId: z.string(),
      name: z.string(),
    });

    createMcpTool(
      this.server,
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
            .refine(
              (spec) => (spec.linkData && !spec.videoData) || (!spec.linkData && spec.videoData),
              {
                message: 'objectStorySpec must contain either linkData or videoData, but not both.',
              }
            )
            .describe(
              'The specification for the creative content. Must include either linkData for link ads or videoData for video ads.'
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAdCreative(authPayload, params),
      'Successfully created ad creative.'
    );
  }

  private registerUpdateAdCreative(): void {
    const successDataSchema = z.object({
      adCreativeId: z.string(),
      updatedFields: z.array(z.string()),
    });

    createMcpTool(
      this.server,
      'update_ad_creative',
      {
        title: 'Update Ad Creative',
        description: 'Updates an existing ad creative.',
        inputSchema: {
          adCreativeId: z.string().describe('The ID of the ad creative to update.'),
          name: z.string().describe('New name for the ad creative.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAdCreative(authPayload, params),
      'Successfully updated ad creative.'
    );
  }

  private registerDeleteAdCreative(): void {
    const successDataSchema = z.object({
      adCreativeId: z.string(),
    });

    createMcpTool(
      this.server,
      'delete_ad_creative',
      {
        title: 'Delete Ad Creative',
        description:
          'Permanently deletes an ad creative. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: {
          adCreativeId: z.string().describe('The ID of the ad creative to delete.'),
          confirmPermanentDelete: DeletionConfirmationSchema.describe(
            'Must be set to true to confirm permanent deletion.'
          ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAdCreative(authPayload, params),
      'Successfully deleted ad creative.'
    );
  }

  private registerInitiateAssetUpload(): void {
    const successDataSchema = z.object({
      uploadId: z.string().describe('The unique ID for this upload operation.'),
      uploadUrl: z
        .string()
        .url()
        .describe('The URL for the user to upload the creative asset file via web interface.'),
    });

    createMcpTool(
      this.server,
      'initiate_asset_upload',
      {
        title: 'Initiate Asset Upload',
        description:
          'Initiates a file upload process for an ad asset (image or video). Returns a unique upload ID and a secure URL for the user to upload the file. This is the first step in the two-step asset upload workflow.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.initiateAssetUpload(authPayload, params),
      'Successfully initiated asset upload.'
    );
  }

  private registerGetAssetUploadStatus(): void {
    const successDataSchema = z.object({
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
    });

    createMcpTool(
      this.server,
      'get_asset_upload_status',
      {
        title: 'Get Asset Upload Status',
        description:
          'Checks the status of a file upload initiated by `initiate_asset_upload`. If completed, it returns the `metaAssetId` required to create an ad creative.',
        inputSchema: {
          uploadId: z.string().describe('The unique ID returned by `initiate_asset_upload`.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAssetUploadStatus(authPayload, params),
      'Successfully retrieved asset upload status.'
    );
  }
}
