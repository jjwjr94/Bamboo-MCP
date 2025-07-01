import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { JWTPayload } from '../../src/types/auth.js';

/**
 * The configuration object for a tool, aligning with the MCP SDK's `registerTool` method.
 */
interface ToolConfig {
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  outputSchema: ZodRawShape;
}

/**
 * The context passed to a tool implementation, containing auth info.
 */
type McpExtraContext = { authInfo?: { extra?: { authPayload?: JWTPayload } } };

/**
 * A tool's implementation function signature.
 */
type ToolImplementation = (params: unknown, extra: McpExtraContext) => Promise<CallToolResult>;

// This map will store the actual implementation functions registered with the mock server.
const toolImplementations = new Map<string, ToolImplementation>();

/**
 * A mock MCP server that captures tool implementations instead of starting a real server.
 * This allows us to test the registration logic and tool functions in isolation.
 */
export const mockMcpServer: McpServer = {
  registerTool: (toolName: string, _config: ToolConfig, implementation: ToolImplementation) => {
    toolImplementations.set(toolName, implementation);
  },
  // Add other McpServer methods if they are ever needed for testing, otherwise leave them undefined.
} as McpServer;

/**
 * Invokes a registered tool by name, simulating an MCP protocol call from a client.
 *
 * @param toolName The name of the tool to invoke (e.g., 'get_campaigns').
 * @param params The parameters to pass to the tool.
 * @param authPayload The mock JWT payload representing the authenticated user.
 * @returns The result from the tool's implementation function.
 */
export const invokeTool = (toolName: string, params: unknown, authPayload: JWTPayload) => {
  const implementation = toolImplementations.get(toolName);
  if (!implementation) {
    throw new Error(`Test Harness Error: Tool "${toolName}" was not registered or found.`);
  }

  // Simulate the 'extra' object passed by the real MCP server with the correct auth format.
  const mockExtra: McpExtraContext = {
    authInfo: {
      extra: {
        authPayload,
      },
    },
  };

  return implementation(params, mockExtra);
};

/**
 * Clears all registered tools. Should be called in an `afterEach`
 * block to ensure test isolation if multiple registries are used across tests.
 */
export function clearRegisteredTools() {
  toolImplementations.clear();
}
