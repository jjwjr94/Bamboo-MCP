// MCP Server implementation for Bamboo-MCP Gateway
import { Request, Response } from 'express';
import { EventEmitter } from 'events';

// MCP Protocol types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// MCP Server class
export class MCPServer extends EventEmitter {
  private connections: Map<string, Response> = new Map();
  private tools: Map<string, any> = new Map();
  private resources: Map<string, any> = new Map();

  constructor() {
    super();
    this.initializeTools();
    this.initializeResources();
  }

  // Initialize available tools
  private initializeTools() {
    // Meta Ads tools
    this.tools.set('ads.get_campaigns', {
      name: 'ads.get_campaigns',
      description: 'Get Meta Ads campaigns',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'Ad account ID' },
          limit: { type: 'number', description: 'Number of campaigns to retrieve', default: 25 }
        },
        required: ['account_id']
      }
    });

    this.tools.set('ads.get_adsets', {
      name: 'ads.get_adsets',
      description: 'Get Meta Ads adsets',
      inputSchema: {
        type: 'object',
        properties: {
          campaign_id: { type: 'string', description: 'Campaign ID' },
          limit: { type: 'number', description: 'Number of adsets to retrieve', default: 25 }
        },
        required: ['campaign_id']
      }
    });

    this.tools.set('ads.get_ads', {
      name: 'ads.get_ads',
      description: 'Get Meta Ads ads',
      inputSchema: {
        type: 'object',
        properties: {
          adset_id: { type: 'string', description: 'Adset ID' },
          limit: { type: 'number', description: 'Number of ads to retrieve', default: 25 }
        },
        required: ['adset_id']
      }
    });

    // PostgreSQL tools
    this.tools.set('pg.query', {
      name: 'pg.query',
      description: 'Execute PostgreSQL query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL query to execute' },
          params: { type: 'array', description: 'Query parameters', items: { type: 'string' } }
        },
        required: ['query']
      }
    });

    this.tools.set('pg.get_tables', {
      name: 'pg.get_tables',
      description: 'Get list of database tables',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Schema name', default: 'public' }
        }
      }
    });
  }

  // Initialize available resources
  private initializeResources() {
    this.resources.set('company_context', {
      uri: 'bamboo://company/context',
      name: 'Company Context',
      description: 'Company-specific context and guidelines',
      mimeType: 'text/markdown'
    });

    this.resources.set('meta_ads_schema', {
      uri: 'bamboo://meta-ads/schema',
      name: 'Meta Ads API Schema',
      description: 'Meta Ads API schema and field definitions',
      mimeType: 'application/json'
    });

    this.resources.set('database_schema', {
      uri: 'bamboo://database/schema',
      name: 'Database Schema',
      description: 'PostgreSQL database schema and table definitions',
      mimeType: 'application/json'
    });
  }

  // Handle MCP Server-Sent Events connection
  handleSSE(req: Request, res: Response) {
    const connectionId = `${Date.now()}-${Math.random()}`;
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Store connection
    this.connections.set(connectionId, res);

    // Send initial connection message
    this.sendEvent(res, 'connected', { connectionId, timestamp: new Date().toISOString() });

    // Handle client disconnect
    req.on('close', () => {
      this.connections.delete(connectionId);
      console.log(`MCP client disconnected: ${connectionId}`);
    });

    req.on('error', (err) => {
      console.error(`MCP connection error: ${err.message}`);
      this.connections.delete(connectionId);
    });

    console.log(`MCP client connected: ${connectionId}`);
  }

  // Handle MCP JSON-RPC requests
  async handleRequest(req: Request, res: Response) {
    try {
      const mcpRequest: MCPRequest = req.body;
      
      if (!mcpRequest.jsonrpc || mcpRequest.jsonrpc !== '2.0') {
        return this.sendError(res, mcpRequest.id, -32600, 'Invalid Request');
      }

      let result: any;

      switch (mcpRequest.method) {
        case 'initialize':
          result = await this.handleInitialize(mcpRequest.params);
          break;
        
        case 'tools/list':
          result = await this.handleToolsList();
          break;
        
        case 'tools/call':
          result = await this.handleToolCall(mcpRequest.params);
          break;
        
        case 'resources/list':
          result = await this.handleResourcesList();
          break;
        
        case 'resources/read':
          result = await this.handleResourceRead(mcpRequest.params);
          break;
        
        default:
          return this.sendError(res, mcpRequest.id, -32601, 'Method not found');
      }

      this.sendResponse(res, mcpRequest.id, result);
    } catch (error) {
      console.error('MCP request error:', error);
      this.sendError(res, req.body?.id, -32603, 'Internal error');
    }
  }

  // Handle initialize request
  private async handleInitialize(params: any) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: 'Bamboo MCP Gateway',
        version: '0.2.0'
      }
    };
  }

  // Handle tools list request
  private async handleToolsList() {
    return {
      tools: Array.from(this.tools.values())
    };
  }

  // Handle tool call request
  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;
    
    if (!this.tools.has(name)) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Route to appropriate handler based on tool prefix
    if (name.startsWith('ads.')) {
      return await this.handleMetaAdsTool(name, args);
    } else if (name.startsWith('pg.')) {
      return await this.handlePostgresTool(name, args);
    } else {
      throw new Error(`Unknown tool category: ${name}`);
    }
  }

  // Handle Meta Ads tool calls
  private async handleMetaAdsTool(toolName: string, args: any) {
    // This would integrate with your existing Meta Ads proxy
    // For now, return a placeholder response
    return {
      content: [
        {
          type: 'text',
          text: `Meta Ads tool ${toolName} called with args: ${JSON.stringify(args, null, 2)}\n\nThis would integrate with your existing Meta Ads proxy implementation.`
        }
      ]
    };
  }

  // Handle PostgreSQL tool calls
  private async handlePostgresTool(toolName: string, args: any) {
    // This would integrate with your existing PostgreSQL proxy
    // For now, return a placeholder response
    return {
      content: [
        {
          type: 'text',
          text: `PostgreSQL tool ${toolName} called with args: ${JSON.stringify(args, null, 2)}\n\nThis would integrate with your existing PostgreSQL proxy implementation.`
        }
      ]
    };
  }

  // Handle resources list request
  private async handleResourcesList() {
    return {
      resources: Array.from(this.resources.values())
    };
  }

  // Handle resource read request
  private async handleResourceRead(params: any) {
    const { uri } = params;
    
    // This would integrate with your existing resource handlers
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Resource content for ${uri}\n\nThis would integrate with your existing resource implementation.`
        }
      ]
    };
  }

  // Send SSE event
  private sendEvent(res: Response, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Send JSON-RPC response
  private sendResponse(res: Response, id: string | number, result: any) {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      result
    };
    res.json(response);
  }

  // Send JSON-RPC error
  private sendError(res: Response, id: string | number, code: number, message: string, data?: any) {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    };
    res.json(response);
  }

  // Get server manifest
  getManifest() {
    return {
      version: '0.2.0',
      name: 'Bamboo MCP Gateway',
      description: 'All-in-One MCP Gateway combining Meta Ads and PostgreSQL functionality',
      author: {
        name: 'Jay Wong',
        email: 'jay@example.com'
      },
      license: 'MIT',
      homepage: 'https://github.com/jjwjr94/Bamboo-MCP',
      capabilities: {
        tools: Array.from(this.tools.keys()),
        resources: Array.from(this.resources.keys())
      },
      endpoints: {
        sse: '/mcp/sse',
        jsonrpc: '/mcp/jsonrpc',
        manifest: '/mcp/manifest'
      }
    };
  }
}

