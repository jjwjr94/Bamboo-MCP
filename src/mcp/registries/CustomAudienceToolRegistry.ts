import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CustomAudienceCustomerFileSourceSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

// GetCustomAudiences schema - single source of truth
export const GetCustomAudiencesInputSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe(
      "The ID of the ad account (e.g., 'act_12345'). Optional if account was previously selected."
    ),
});

// CreateCustomAudience schema - single source of truth for custom audience creation
export const CreateCustomAudienceSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe(
      "The ad account ID (e.g., 'act_12345'). If not provided, the selected account will be used."
    ),
  name: z.string().describe('The name of the custom audience.'),
  subtype: z
    .literal('CUSTOM')
    .describe("The audience subtype. Must be 'CUSTOM' for list-based audiences."),
  description: z.string().optional().describe('A description for the audience.'),
  customerFileSource: CustomAudienceCustomerFileSourceSchema.optional().describe(
    'The source of the customer data.'
  ),
});

// DeleteCustomAudience schema - single source of truth for custom audience deletion
export const DeleteCustomAudienceInputSchema = z.object({
  customAudienceId: z.string().describe('The ID of the custom audience to delete.'),
  confirmPermanentDelete: DeletionConfirmationSchema.describe(
    'Must be set to true to confirm permanent deletion.'
  ),
});

// Export inferred types - single source of truth for TypeScript types
export type GetCustomAudiencesRequest = z.infer<typeof GetCustomAudiencesInputSchema>;
export type CreateCustomAudienceRequest = z.infer<typeof CreateCustomAudienceSchema>;
export type DeleteCustomAudienceRequest = z.infer<typeof DeleteCustomAudienceInputSchema>;

export class CustomAudienceToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => string)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetCustomAudiences.bind(this),
      this.registerCreateCustomAudience.bind(this),
      this.registerDeleteCustomAudience.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Custom Audience';
  }

  public register(): string[] {
    const registeredToolNames: string[] = [];
    for (const registerMethod of this.registrationMethods) {
      registeredToolNames.push(registerMethod());
    }
    return registeredToolNames;
  }

  private registerGetCustomAudiences(): string {
    // GetCustomAudiences success schema - Updated to match Meta API v22+ actual response
    const successDataSchema = z.object({
      customAudiences: z
        .array(
          z.object({
            id: z.string(),
            account_id: z.string().optional().describe('Ad Account ID owning the custom audience'),
            name: z.string(),
            description: z.string().optional(),
            approximate_count: z
              .number()
              .optional()
              .describe('Average from upper and lower bounds'),
            approximate_count_lower_bound: z.number().optional(),
            approximate_count_upper_bound: z.number().optional(),
            customer_file_source: z.string().optional().describe('Source of customer information'),
            delivery_status: z
              .object({
                code: z.string().optional().describe('e.g., "ACTIVE"'),
              })
              .optional(),
            external_event_source: z.object({}).optional().describe('Details of external events'),
            is_value_based: z
              .string()
              .optional()
              .describe('Whether audience uses value-based segmentation'),
            lookalike_audience_ids: z
              .object({})
              .optional()
              .describe('Array of linked lookalike audience IDs'),
            lookalike_spec: z
              .object({})
              .optional()
              .describe('Specification about lookalike modeling'),
            operation_status: z
              .object({})
              .optional()
              .describe('Status about data ingestion/operations'),
            opt_out_link: z.string().optional().describe('URL for users to opt out'),
            pixel_id: z
              .string()
              .optional()
              .describe('Pixel ID associated with the custom audience'),
            retention_days: z.number().optional().describe('Retention period in days'),
            time_created: z.number().optional().describe('Timestamp of creation (UNIX)'),
            time_updated: z.number().optional().describe('Timestamp of last update (UNIX)'),
            data_source: z
              .object({
                type: z
                  .string()
                  .describe('e.g., "FILE_IMPORTED", "PIXEL", "APP", "OFFLINE_EVENT_SET"'),
                sub_type: z.string().optional().describe('Further categorizing the source'),
              })
              .optional(),
            permission_for_actions: z
              .object({})
              .optional()
              .describe('Permissions context for audience actions'),
            sharing_status: z.object({}).optional().describe('Status on audience sharing'),
            subtype: z
              .string()
              .optional()
              .describe('Type of audience (e.g., CUSTOM, LOOKALIKE, WEBSITE, ENGAGEMENT)'),
          })
        )
        .describe('List of custom audiences.'),
    });

    return createMcpTool(
      this.server,
      'get_custom_audiences',
      {
        title: 'Get Custom Audiences',
        description: 'Retrieves custom audiences for an ad account.',
        inputSchema: GetCustomAudiencesInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getCustomAudiences(authPayload, params),
      'Successfully retrieved custom audiences.'
    );
  }

  private registerCreateCustomAudience(): string {
    const successDataSchema = z.object({
      customAudienceId: z.string(),
      name: z.string(),
      subtype: z.string(),
    });

    return createMcpTool(
      this.server,
      'create_custom_audience',
      {
        title: 'Create Custom Audience',
        description: 'Creates a new custom audience for an ad account.',
        inputSchema: CreateCustomAudienceSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createCustomAudience(authPayload, params),
      'Successfully created custom audience.'
    );
  }

  private registerDeleteCustomAudience(): string {
    const successDataSchema = z.object({
      customAudienceId: z.string(),
    });

    return createMcpTool(
      this.server,
      'delete_custom_audience',
      {
        title: 'Delete Custom Audience',
        description:
          'Permanently deletes a custom audience. This action cannot be undone. The user must be prompted to confirm this permanent deletion before calling this tool.',
        inputSchema: DeleteCustomAudienceInputSchema,
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteCustomAudience(authPayload, params),
      'Successfully deleted custom audience.'
    );
  }
}
