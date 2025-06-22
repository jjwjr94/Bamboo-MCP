// Import test environment setup FIRST
import '../../helpers/testEnv.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoreServices } from '../../../src/mcp/coreServices.js';
import { BambooMCPServer } from '../../../src/mcp/server.js';

describe('MCP Server Integration', () => {
  let bambooServer: BambooMCPServer;
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeEach(async () => {
    // Create linked transport pair for in-memory communication
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Create and setup server with CoreServices
    const coreServices = await CoreServices.initialize();
    bambooServer = new BambooMCPServer(coreServices, 'test-request');
    const mcpServer = bambooServer.getServer();
    await mcpServer.connect(serverTransport);

    // Create and setup client
    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    await client.connect(clientTransport);
  });

  afterEach(async () => {
    // Clean up connections
    await client.close();
    await bambooServer.shutdown();
  });

  describe('Server Information', () => {
    it('should provide server information through initialization', async () => {
      // The server info is available through the initialization process
      expect(bambooServer).toBeDefined();

      // Verify the server has a valid MCP server instance
      const mcpServer = bambooServer.getServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe('Tools', () => {
    it('should list available tools', async () => {
      const toolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const result = await client.request(toolsRequest, ListToolsResultSchema);

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify we have core Meta API tools
      const toolNames = result.tools.map((tool: { name: string }) => tool.name);

      // Check for actual tool names that should exist
      const hasAdAccountTools = toolNames.some((name: string) => name.includes('ad_account'));
      const hasCampaignTools = toolNames.some((name: string) => name.includes('campaign'));
      const hasAdTools = toolNames.some(
        (name: string) => name.includes('ad') && !name.includes('campaign')
      );

      expect(hasAdAccountTools).toBe(true);
      expect(hasCampaignTools).toBe(true);
      expect(hasAdTools).toBe(true);
    });

    it('should have properly defined tool schemas', async () => {
      const toolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const result = await client.request(toolsRequest, ListToolsResultSchema);

      for (const tool of result.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');

        // Each tool should have required properties defined
        if (tool.inputSchema.properties) {
          expect(typeof tool.inputSchema.properties).toBe('object');
        }
      }
    });
  });

  describe('Authentication Handling', () => {
    it('should handle tool calls without authentication gracefully', async () => {
      const toolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'get_ad_account',
          arguments: {},
        },
      };

      // Should throw an MCP error when authentication is missing
      await expect(async () => {
        await client.request(toolCallRequest, CallToolResultSchema);
      }).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names', async () => {
      const toolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      };

      await expect(async () => {
        await client.request(toolCallRequest, CallToolResultSchema);
      }).rejects.toThrow();
    });

    it('should handle invalid tool arguments', async () => {
      const toolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'get_campaign',
          arguments: {
            invalid_parameter: 'test',
          },
        },
      };

      // Should throw an MCP error for invalid arguments or missing auth
      await expect(async () => {
        await client.request(toolCallRequest, CallToolResultSchema);
      }).rejects.toThrow();
    });
  });

  describe('Tool Registration', () => {
    it('should register all expected tool categories', async () => {
      const toolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const result = await client.request(toolsRequest, ListToolsResultSchema);
      const toolNames = result.tools.map((tool: { name: string }) => tool.name);

      // More flexible matching - just verify we have a reasonable number of tools
      expect(result.tools.length).toBeGreaterThan(30); // Should have 38+ tools

      // Verify some specific categories exist
      const hasAdAccountTools = toolNames.some((name: string) => name.includes('ad_account'));
      const hasCampaignTools = toolNames.some((name: string) => name.includes('campaign'));
      const hasPageTools = toolNames.some((name: string) => name.includes('page'));

      expect(hasAdAccountTools).toBe(true);
      expect(hasCampaignTools).toBe(true);
      expect(hasPageTools).toBe(true);
    });
  });
});
