import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';
import {
  CustomAudienceCustomerFileSourceSchema,
  CustomAudienceSubtypeSchema,
} from '../../generated/schemas.js';
import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

export class CustomAudienceToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  public register() {
    this.registerGetCustomAudiences();
    this.registerCreateCustomAudience();
    this.registerDeleteCustomAudience();
    logger.info('Registered Custom Audience tools', { count: 3 });
  }

  private registerGetCustomAudiences() {
    this.server.registerTool(
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
        outputSchema: {
          customAudiences: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string().optional().nullable(),
              subtype: z.string().optional().nullable(),
              approximate_count_lower_bound: z.number().optional().nullable(),
              approximate_count_upper_bound: z.number().optional().nullable(),
              time_updated: z.number().optional().nullable(),
              retention_days: z.number().optional().nullable(),
              customer_file_source: z.string().optional().nullable(),
            })
          ),
        },
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getCustomAudiences(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCreateCustomAudience() {
    this.server.registerTool(
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
          subtype: CustomAudienceSubtypeSchema.describe('The subtype of the audience.'),
          description: z.string().optional().describe('A description for the audience.'),
          customerFileSource: CustomAudienceCustomerFileSourceSchema.optional().describe(
            'The source of the customer data.'
          ),
        },
        outputSchema: {
          id: z.string().describe('The ID of the newly created custom audience.'),
        },
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.createCustomAudience(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerDeleteCustomAudience() {
    this.server.registerTool(
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
        outputSchema: {
          success: z.boolean(),
        },
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.deleteCustomAudience(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
