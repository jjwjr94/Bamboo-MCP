import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CustomAudienceCustomerFileSourceSchema,
  MetaCustomAudienceResponseSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

export class CustomAudienceToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

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

  public register() {
    logger.info('Registering Custom Audience MCP tools');

    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }

    logger.info('Custom Audience MCP tools registered', { count: this.getToolCount() });
  }

  private registerGetCustomAudiences() {
    const successDataSchema = z.object({
      customAudiences: z
        .array(MetaCustomAudienceResponseSchema)
        .describe('A list of custom audiences with all available Meta API fields.'),
    });

    createMcpTool(
      this.server,
      'get_custom_audiences',
      {
        title: 'Get Custom Audiences',
        description: 'Retrieves all custom audiences for the selected or specified ad account.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe(
              "The ad account ID (e.g., 'act_12345'). If not provided, the selected account will be used."
            ),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getCustomAudiences(authPayload, params),
      'Successfully retrieved custom audiences.'
    );
  }

  private registerCreateCustomAudience() {
    const successDataSchema = z.object({
      id: z.string().describe('The ID of the newly created custom audience.'),
    });

    createMcpTool(
      this.server,
      'create_custom_audience',
      {
        title: 'Create Custom Audience',
        description: 'Creates a new custom audience for list-based retargeting.',
        inputSchema: {
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
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createCustomAudience(authPayload, params),
      'Successfully created custom audience.'
    );
  }

  private registerDeleteCustomAudience() {
    const successDataSchema = z.object({
      success: z.boolean(),
    });

    createMcpTool(
      this.server,
      'delete_custom_audience',
      {
        title: 'Delete Custom Audience',
        description:
          'Permanently deletes a custom audience by its ID. This action cannot be undone.',
        inputSchema: {
          customAudienceId: z.string().describe('The ID of the custom audience to delete.'),
          confirmPermanentDelete: z
            .boolean()
            .describe('Must be set to true to confirm permanent deletion of the custom audience.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.deleteCustomAudience(authPayload, params),
      'Successfully deleted custom audience.'
    );
  }
}
