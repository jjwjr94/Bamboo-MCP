import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractAuthPayload } from '../../auth/mcpAuthUtils.js';

import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import { logger } from '../../utils/logger.js';
import { createMcpErrorResult } from '../errorHandler.js';

export class PagesToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
  }

  public register() {
    this.registerGetPages();
    this.registerGetPagePosts();
    this.registerCreatePagePostAd();
    logger.info('Registered Pages tools', { count: 3 });
  }

  private registerGetPages() {
    this.server.registerTool(
      'get_pages',
      {
        title: 'Get Facebook Pages',
        description: 'Retrieves a list of Facebook Pages the user has access to.',
        inputSchema: {},
        outputSchema: {
          pages: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                access_token: z.string().optional().nullable(),
                category: z.string().optional().nullable(),
                link: z.string().optional().nullable(),
                about: z.string().optional().nullable(),
              })
            )
            .describe('A list of Facebook pages.'),
        },
      },
      async (_params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getPages(authPayload);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerGetPagePosts() {
    this.server.registerTool(
      'get_page_posts',
      {
        title: 'Get Page Posts',
        description: 'Retrieves recent posts for a specific Facebook Page.',
        inputSchema: {
          pageId: z.string().describe('The ID of the Facebook Page.'),
        },
        outputSchema: {
          posts: z
            .array(
              z.object({
                id: z.string(),
                message: z.string().optional().nullable(),
                created_time: z.string().optional().nullable(),
                permalink_url: z.string().optional().nullable(),
                full_picture: z.string().optional().nullable(),
                story: z.string().optional().nullable(),
                status_type: z.string().optional().nullable(),
              })
            )
            .describe('A list of posts from the page.'),
        },
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.getPagePosts(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }

  private registerCreatePagePostAd() {
    this.server.registerTool(
      'create_page_post_ad',
      {
        title: 'Create Ad From Page Post',
        description: 'Creates a new ad by promoting an existing Facebook Page post.',
        inputSchema: {
          adAccountId: z
            .string()
            .optional()
            .describe('The ad account ID. Optional if one is already selected.'),
          name: z.string().describe('The name for the new ad.'),
          adSetId: z.string().describe('The ID of the Ad Set for this ad.'),
          postId: z
            .string()
            .refine((val) => /^\d+_\d+$/.test(val), {
              message:
                "Invalid postId format. Must be in the format 'pageId_postId' (e.g., '12345_67890').",
            })
            .describe("The ID of the page post to promote (e.g., '12345_67890')."),
          status: z
            .enum(['ACTIVE', 'PAUSED'])
            .optional()
            .describe('Status for the ad (ACTIVE or PAUSED).'),
        },
        outputSchema: {
          success: z.boolean(),
          adId: z.string(),
          adCreativeId: z.string(),
          message: z.string(),
        },
      },
      async (params, extra) => {
        try {
          const authPayload = extractAuthPayload(extra);
          return await this.toolsHandler.createPagePostAd(authPayload, params);
        } catch (error) {
          return createMcpErrorResult(error);
        }
      }
    );
  }
}
