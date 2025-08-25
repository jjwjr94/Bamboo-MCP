// Fixed MCP Server implementation with HTTP Streamable transport and simplified auth
import { Request, Response } from 'express';
import { SimpleAuthService, AuthUser } from './auth/simple-auth';
import { Logger } from './core/logger';

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

// Fixed MCP Server class
export class FixedMCPServer {
  private authService: SimpleAuthService;
  private logger: Logger;
  private tools: Map<string, any> = new Map();
  private resources: Map<string, any> = new Map();

  constructor() {
    this.authService = new SimpleAuthService();
    this.logger = new Logger('FixedMCPServer');
    this.initializeTools();
    this.initializeResources();
  }

  // Initialize available tools for Meta Ads
  private initializeTools() {
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

    this.tools.set('ads.get_insights', {
      name: 'ads.get_insights',
      description: 'Get Meta Ads insights/performance data',
      inputSchema: {
        type: 'object',
        properties: {
          object_id: { type: 'string', description: 'Campaign, adset, or ad ID' },
          level: { type: 'string', description: 'Level: campaign, adset, or ad', default: 'campaign' },
          date_preset: { type: 'string', description: 'Date preset like last_7_days', default: 'last_7_days' }
        },
        required: ['object_id']
      }
    });
  }

  // Initialize available resources
  private initializeResources() {
    this.resources.set('meta_ads_schema', {
      uri: 'bamboo://meta-ads/schema',
      name: 'Meta Ads API Schema',
      description: 'Meta Ads API schema and field definitions',
      mimeType: 'application/json'
    });

    this.resources.set('company_context', {
      uri: 'bamboo://company/context',
      name: 'Company Context',
      description: 'Company-specific context and guidelines',
      mimeType: 'text/markdown'
    });
  }

  // Handle HTTP Streamable transport requests
  public async handleStreamableHTTP(req: Request, res: Response): Promise<Response | void> {
    try {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        return res.status(200).end();
      }

      // Validate Origin header for security
      const origin = req.headers.origin;
      if (origin && !this.isValidOrigin(origin)) {
        return res.status(403).json({ error: 'Invalid origin' });
      }

      if (req.method === 'POST') {
        await this.handlePOST(req, res);
      } else if (req.method === 'GET') {
        await this.handleGET(req, res);
      } else {
        res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      this.logger.error('Error in streamable HTTP handler:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle POST requests (client-to-server messages)
  private async handlePOST(req: Request, res: Response): Promise<Response | void> {
    // Authenticate user
    const token = this.authService.extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Meta access token required' });
    }

    const user = await this.authService.verifyMetaToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid Meta access token' });
    }

    const mcpRequest: MCPRequest = req.body;
    
    if (!mcpRequest.jsonrpc || mcpRequest.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }

    // Check if client wants streaming response
    const acceptHeader = req.headers.accept || '';
    const wantsStream = acceptHeader.includes('text/event-stream');

    if (wantsStream) {
      // Start SSE stream for response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      try {
        const result = await this.processRequest(mcpRequest, user);
        
        // Send the response as SSE event
        res.write(`data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result
        })}\\n\\n`);
        
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          error: { code: -32603, message: 'Internal error' }
        })}\\n\\n`);
        res.end();
      }
    } else {
      // Regular JSON response
      try {
        const result = await this.processRequest(mcpRequest, user);
        res.json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result
        });
      } catch (error) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          error: { code: -32603, message: 'Internal error' }
        });
      }
    }
  }

  // Handle GET requests (optional server-to-client streaming)
  private async handleGET(req: Request, res: Response): Promise<Response | void> {
    const acceptHeader = req.headers.accept || '';
    
    if (!acceptHeader.includes('text/event-stream')) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Set up SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      status: 'connected',
      timestamp: new Date().toISOString()
    })}\\n\\n`);

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\\n\\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.logger.info('SSE client disconnected');
    });
  }

  // Process MCP requests
  private async processRequest(request: MCPRequest, user: AuthUser): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params);
      
      case 'tools/list':
        return this.handleToolsList();
      
      case 'tools/call':
        return this.handleToolCall(request.params, user);
      
      case 'resources/list':
        return this.handleResourcesList();
      
      case 'resources/read':
        return this.handleResourceRead(request.params);
      
      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }

  // Handle initialize request
  private async handleInitialize(params: any) {
    return {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: {},
        resources: {}
      },
      serverInfo: {
        name: 'Bamboo MCP Gateway (Fixed)',
        version: '0.3.0'
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
  private async handleToolCall(params: any, user: AuthUser) {
    const { name, arguments: args } = params;
    
    if (!this.tools.has(name)) {
      throw new Error(`Tool not found: ${name}`);
    }

    this.logger.info(`Calling tool: ${name}`, args);

    // All tools are Meta Ads tools, use the user's access token
    return await this.callMetaAdsTool(name, args, user.accessToken);
  }

  // Handle Meta Ads tool calls
  private async callMetaAdsTool(toolName: string, args: any, accessToken: string) {
    try {
      let apiUrl: string;
      
      switch (toolName) {
        case 'ads.get_campaigns':
          apiUrl = `https://graph.facebook.com/v18.0/act_${args.account_id}/campaigns?access_token=${accessToken}&limit=${args.limit || 25}`;
          break;
        
        case 'ads.get_adsets':
          apiUrl = `https://graph.facebook.com/v18.0/${args.campaign_id}/adsets?access_token=${accessToken}&limit=${args.limit || 25}`;
          break;
        
        case 'ads.get_ads':
          apiUrl = `https://graph.facebook.com/v18.0/${args.adset_id}/ads?access_token=${accessToken}&limit=${args.limit || 25}`;
          break;
        
        case 'ads.get_insights':
          const level = args.level || 'campaign';
          const datePreset = args.date_preset || 'last_7_days';
          apiUrl = `https://graph.facebook.com/v18.0/${args.object_id}/insights?access_token=${accessToken}&level=${level}&date_preset=${datePreset}`;
          break;
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        const errorData = await response.json() as any;
        throw new Error(`Meta API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: [
          {
            type: 'text',
            text: `Meta Ads API Response for ${toolName}:\\n\\n${JSON.stringify(data, null, 2)}`
          }
        ]
      };
    } catch (error) {
      this.logger.error(`Error calling Meta Ads tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error calling ${toolName}: ${(error as any).message}`
          }
        ]
      };
    }
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
    
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Resource content for ${uri}\\n\\nThis would contain the actual resource data.`
        }
      ]
    };
  }

  // Validate origin for security
  private isValidOrigin(origin: string): boolean {
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true;
    }
    
    // Add your allowed origins here
    const allowedOrigins = [
      'https://n8n.io',
      'https://app.n8n.cloud'
    ];
    
    return allowedOrigins.some(allowed => origin.includes(allowed));
  }

  // Get server manifest
  getManifest() {
    return {
      version: '0.3.0',
      name: 'Bamboo MCP Gateway (Fixed)',
      description: 'Simplified MCP Gateway for Meta Ads with direct token authentication',
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
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp'
      }
    };
  }
}

