// Main entry point for Bamboo MCP Gateway
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8443;

app.get('/', (req, res) => {
  res.send('Bamboo MCP Gateway is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Core MCP types and interfaces for Bamboo MCP Gateway

export interface MCPManifest {
  version: string;
  name: string;
  description: string;
  author?: {
    name: string;
    email?: string;
  };
  license?: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// Gateway-specific types
export interface UpstreamServer {
  name: string;
  type: "meta-ads" | "postgres";
  prefix: string; // "ads." or "pg."
  endpoint?: string; // For HTTP transport
  process?: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

export interface GatewayConfig {
  port: number;
  upstreams: UpstreamServer[];
  auth: {
    jwt: {
      secret: string;
      expiresIn: string;
    };
    facebook: {
      appId: string;
      appSecret: string;
      callbackUrl: string;
    };
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export interface CompanyProfile {
  companyId: string;
  jsonData: Record<string, any>;
  updatedAt: Date;
}

export interface ConversationState {
  conversationId: string;
  seeded: boolean;
  lastActivity: Date;
}

export interface AuthToken {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  provider: "facebook" | "pipeboard";
}

// Prompt seeding types
export interface PromptPointer {
  type: "mcp_resource";
  uri: string;
  description: string;
}

export interface PromptSeed {
  pointer: PromptPointer;
  content: string;
  tokens: number;
}

