import 'dotenv/config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { MetaToolsHandler } from '../../tools/meta/toolsHandler.js';
import type { IToolRegistry } from '../types.js';
import { createMcpTool } from './registryHelper.js';

export class PagesToolRegistry implements IToolRegistry {
  private server: McpServer;
  private toolsHandler: MetaToolsHandler;
  private readonly registrationMethods: (() => void)[];

  constructor(server: McpServer, toolsHandler: MetaToolsHandler) {
    this.server = server;
    this.toolsHandler = toolsHandler;
    this.registrationMethods = [
      this.registerGetPages.bind(this),
      this.registerGetPagePosts.bind(this),
      this.registerCreatePagePostAd.bind(this),
    ];
  }

  public getToolCount(): number {
    return this.registrationMethods.length;
  }

  public getRegistryName(): string {
    return 'Pages';
  }

  public register() {
    for (const registerMethod of this.registrationMethods) {
      registerMethod();
    }
  }

  private registerGetPages() {
    // Define the schema for the success data payload
    const successDataSchema = z.object({
      pages: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            category: z.string().optional().nullable(),
            link: z.string().optional().nullable(),
            about: z.string().optional().nullable(),
          })
        )
        .describe('A list of Facebook pages.'),
    });

    createMcpTool(
      this.server,
      'get_pages',
      {
        title: 'Get Facebook Pages',
        description: 'Retrieves a list of Facebook Pages the user has access to.',
        inputSchema: {},
        successDataSchema,
      },
      (authPayload) => this.toolsHandler.getPages(authPayload),
      'Successfully retrieved Facebook Pages.'
    );
  }

  private registerGetPagePosts() {
    // Define the schema for the success data payload
    const successDataSchema = z.object({
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
    });

    createMcpTool(
      this.server,
      'get_page_posts',
      {
        title: 'Get Page Posts',
        description: 'Retrieves recent posts for a specific Facebook Page.',
        inputSchema: {
          pageId: z.string().describe('The ID of the Facebook Page.'),
        },
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.getPagePosts(authPayload, params),
      'Successfully retrieved page posts.'
    );
  }

  private registerCreatePagePostAd() {
    // Define the schema for the success data payload
    const successDataSchema = z.object({
      adId: z.string(),
      adCreativeId: z.string(),
    });

    createMcpTool(
      this.server,
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
        successDataSchema,
      },
      (authPayload, params) => this.toolsHandler.createPagePostAd(authPayload, params),
      'Successfully created page post ad.'
    );
  }
}
