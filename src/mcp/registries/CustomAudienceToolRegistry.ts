import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CustomAudienceCustomerFileSourceSchema } from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { DeletionConfirmationSchema, createMcpTool } from './registryHelper.js';

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

// Export inferred types - single source of truth for TypeScript types
export type CreateCustomAudienceRequest = z.infer<typeof CreateCustomAudienceSchema>;

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
    const successDataSchema = z.object({
      customAudiences: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            subtype: z.string().optional(),
            description: z.string().optional(),
            approximate_count_lower_bound: z.number().optional(),
            approximate_count_upper_bound: z.number().optional(),
            data_source: z
              .object({
                type: z.string().optional(),
                sub_type: z.string().optional(),
              })
              .optional(),
            delivery_status: z
              .object({
                code: z.number().optional(),
                description: z.string().optional(),
              })
              .optional(),
            operation_status: z
              .object({
                code: z.number().optional(),
                description: z.string().optional(),
              })
              .optional(),
            time_created: z.string().optional(),
            time_updated: z.string().optional(),
          })
        )
        .describe('A list of custom audiences.'),
    });

    return createMcpTool(
      this.server,
      'get_custom_audiences',
      {
        title: 'Get Custom Audiences',
        description: 'Retrieves custom audiences for an ad account.',
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
        inputSchema: CreateCustomAudienceSchema.shape,
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
        inputSchema: {
          customAudienceId: z.string().describe('The ID of the custom audience to delete.'),
          confirmPermanentDelete: DeletionConfirmationSchema.describe(
            'Must be set to true to confirm permanent deletion.'
          ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteCustomAudience(authPayload, params),
      'Successfully deleted custom audience.'
    );
  }
}
