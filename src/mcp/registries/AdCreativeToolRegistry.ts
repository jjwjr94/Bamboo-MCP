import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AdCreativeCallToActionTypeSchema,
  MetaAdCreativeResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// CreateAdCreative schema - single source of truth for ad creative creation
export const CreateAdCreativeSchema = z.object({
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
              type: AdCreativeCallToActionTypeSchema.describe('The type of call-to-action button.'),
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
              type: AdCreativeCallToActionTypeSchema.describe('The type of call-to-action button.'),
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
    .refine((spec) => (spec.linkData && !spec.videoData) || (!spec.linkData && spec.videoData), {
      message: 'objectStorySpec must contain either linkData or videoData, but not both.',
    })
    .describe(
      'The specification for the creative content. Must include either linkData for link ads or videoData for video ads.'
    ),
});

// UpdateAdCreative schema - single source of truth for ad creative updates
export const UpdateAdCreativeSchema = z.object({
  adCreativeId: z.string().describe('The ID of the ad creative to update.'),
  name: z.string().describe('New name for the ad creative.'),
});

// GetAdCreatives schema - single source of truth for ad creative retrieval
export const GetAdCreativesInputSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe(
      "The ad account ID (e.g., 'act_12345'). If not provided, the selected account will be used."
    ),
});

// DeleteAdCreative schema - single source of truth for ad creative deletion
export const DeleteAdCreativeInputSchema = z.object({
  adCreativeId: z.string().describe('The ID of the ad creative to delete.'),
  confirmPermanentDelete: DeletionConfirmationSchema.describe(
    'Must be set to true to confirm permanent deletion.'
  ),
});

// InitiateAssetUpload schema - single source of truth for asset upload initiation
export const InitiateAssetUploadInputSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe('The ad account ID. Optional if one is already selected.'),
});

// GetAssetUploadStatus schema - single source of truth
export const GetAssetUploadStatusInputSchema = z.object({
  uploadId: z.string().describe('The upload ID returned from initiate_asset_upload.'),
});

// GetAssetUploadStatus success schema - single source of truth
const GetAssetUploadStatusSuccessSchema = z.object({
  status: z
    .string()
    .describe('Current status of the upload (pending, uploading, completed, failed).'),
  metaAssetId: z.string().optional().describe('The Meta asset ID (available when completed).'),
  errorMessage: z.string().optional().describe('Error message if upload failed.'),
});

// Export inferred types - single source of truth for TypeScript types
export type CreateAdCreativeRequest = z.infer<typeof CreateAdCreativeSchema>;
export type UpdateAdCreativeRequest = z.infer<typeof UpdateAdCreativeSchema>;
export type GetAdCreativesRequest = z.infer<typeof GetAdCreativesInputSchema>;
export type DeleteAdCreativeRequest = z.infer<typeof DeleteAdCreativeInputSchema>;
export type InitiateAssetUploadRequest = z.infer<typeof InitiateAssetUploadInputSchema>;
export type GetAssetUploadStatusRequest = z.infer<typeof GetAssetUploadStatusInputSchema>;

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
  private readonly registrationMethods: (() => string)[];

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

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetAdCreatives(): string {
    const successDataSchema = z.object({
      adCreatives: z
        .array(MetaAdCreativeResponseSchema)
        .describe('A list of ad creatives with all available Meta API fields.'),
    });

    return createMcpTool(
      this.server,
      'get_ad_creatives',
      {
        title: 'Get Ad Creatives',
        description:
          'Retrieves all ad creatives for the selected or specified ad account. Ad creatives define the visual and textual content of ads.',
        inputSchema: GetAdCreativesInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getAdCreatives(authPayload, params),
      'Successfully retrieved ad creatives.'
    );
  }

  private registerCreateAdCreative(): string {
    const successDataSchema = z.object({
      adCreativeId: z.string().describe('The ID of the newly created ad creative.'),
      name: z.string().describe('The name of the newly created ad creative.'),
    });

    return createMcpTool(
      this.server,
      'create_ad_creative',
      {
        title: 'Create Ad Creative',
        description:
          'Creates a new ad creative. Ad creatives define the visual and textual content that will be displayed in ads.',
        inputSchema: CreateAdCreativeSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createAdCreative(authPayload, params),
      'Successfully created ad creative.'
    );
  }

  private registerUpdateAdCreative(): string {
    const successDataSchema = z.object({
      adCreativeId: z.string().describe('The ID of the updated ad creative.'),
      updatedFields: z.array(z.string()).describe('A list of the fields that were updated.'),
    });

    return createMcpTool(
      this.server,
      'update_ad_creative',
      {
        title: 'Update Ad Creative',
        description: 'Updates an existing ad creative.',
        inputSchema: UpdateAdCreativeSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.updateAdCreative(authPayload, params),
      'Successfully updated ad creative.'
    );
  }

  private registerDeleteAdCreative(): string {
    const successDataSchema = z.object({
      adCreativeId: z.string().describe('The ID of the deleted ad creative.'),
    });

    return createMcpTool(
      this.server,
      'delete_ad_creative',
      {
        title: 'Delete Ad Creative',
        description:
          'Permanently deletes an ad creative by its ID. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: DeleteAdCreativeInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteAdCreative(authPayload, params),
      'Successfully deleted ad creative.'
    );
  }

  private registerInitiateAssetUpload(): string {
    const successDataSchema = z.object({
      uploadId: z.string().describe('The upload ID to use for the file upload.'),
      uploadUrl: z.string().describe('The presigned URL to upload the file to.'),
    });

    return createMcpTool(
      this.server,
      'initiate_asset_upload',
      {
        title: 'Initiate Asset Upload',
        description:
          'Prepares for uploading creative assets (images, videos) by generating a presigned upload URL and form data. Use this before uploading assets via file upload.',
        inputSchema: InitiateAssetUploadInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.initiateAssetUpload(authPayload, params),
      'Successfully initiated asset upload.'
    );
  }

  private registerGetAssetUploadStatus(): string {
    return createMcpTool(
      this.server,
      'get_asset_upload_status',
      {
        title: 'Get Asset Upload Status',
        description: 'Checks the status of a previously initiated asset upload.',
        inputSchema: GetAssetUploadStatusInputSchema,
        successDataSchema: GetAssetUploadStatusSuccessSchema,
      },
      (authPayload, params) => this.toolsHandler.getAssetUploadStatus(authPayload, params),
      'Successfully retrieved asset upload status.'
    );
  }
}
