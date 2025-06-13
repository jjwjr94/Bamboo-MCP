import { Request, Response } from 'express';
import { MCPManifest, MCPMessage, MCPToolCall, MCPToolResult, UpstreamServer } from '../types';
import { AuthService } from '../auth/service';
import { ConfigService } from './config';
import { Logger } from './logger';
import { UpstreamProxy } from '../proxy/upstream';
import { PromptSeeder } from '../resources/prompt-seeder';

export class MCPGateway {
  private logger: Logger;
  private config: ConfigService;
  private authService: AuthService;
  private upstreamProxy: UpstreamProxy;
  private promptSeeder: PromptSeeder;
  private upstreams: UpstreamServer[];

  constructor(authService: AuthService) {
    this.logger = new Logger('MCPGateway');
    this.config = ConfigService.getInstance();
    this.authService = authService;
    this.upstreams = this.config.getGatewayConfig().upstreams;
    this.upstreamProxy = new UpstreamProxy(this.upstreams, authService);
    this.promptSeeder = new PromptSeeder();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing MCP Gateway');
      await this.upstreamProxy.initialize();
      this.logger.info('MCP Gateway initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize MCP Gateway:', error);
      throw error;
    }
  }

  public async getManifest(req: Request, res: Response): Promise<void> {
    try {
      const manifest: MCPManifest = {
        version: "0.2.0",
        name: "bamboo-mcp",
        description: "All-in-One MCP Gateway combining Meta Ads and PostgreSQL functionality",
        author: {
          name: "Jay Wong",
          email: "jay@example.com"
        },
        license: "MIT",
        homepage: "https://github.com/example/bamboo-mcp",
        repository: {
          type: "git",
          url: "https://github.com/example/bamboo-mcp.git"
        }
      };

      res.json(manifest);
    } catch (error) {
      this.logger.error('Error getting manifest:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  public async handleSSE(req: Request, res: Response): Promise<void> {
    try {
      // Verify authentication
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await this.authService.verifyToken(token);
      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({
        type: 'connection',
        status: 'connected',
        timestamp: new Date().toISOString()
      })}\\n\\n`);

      // Handle client disconnect
      req.on('close', () => {
        this.logger.info('SSE client disconnected');
        res.end();
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString()
        })}\\n\\n`);
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

    } catch (error) {
      this.logger.error('Error in SSE handler:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  public async handleStream(req: Request, res: Response): Promise<void> {
    try {
      // Verify authentication
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await this.authService.verifyToken(token);
      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      const message: MCPMessage = req.body;
      this.logger.debug('Received MCP message:', message);

      // Handle different MCP methods
      switch (message.method) {
        case 'tools/list':
          await this.handleToolsList(message, res, user.userId);
          break;
        case 'tools/call':
          await this.handleToolCall(message, res, user.userId);
          break;
        case 'resources/list':
          await this.handleResourcesList(message, res, user.userId);
          break;
        case 'resources/read':
          await this.handleResourceRead(message, res, user.userId);
          break;
        default:
          res.status(400).json({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          });
      }

    } catch (error) {
      this.logger.error('Error in stream handler:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      });
    }
  }

  private async handleToolsList(message: MCPMessage, res: Response, userId: string): Promise<void> {
    try {
      // Get tools from all upstream servers
      const allTools = await this.upstreamProxy.getAllTools();
      
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: allTools
        }
      });
    } catch (error) {
      this.logger.error('Error listing tools:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: 'Failed to list tools'
        }
      });
    }
  }

  private async handleToolCall(message: MCPMessage, res: Response, userId: string): Promise<void> {
    try {
      const toolCall: MCPToolCall = message.params;
      this.logger.info(`Tool call: ${toolCall.name}`, toolCall.arguments);

      // Check if this is the first tool call and inject prompt if needed
      await this.promptSeeder.checkAndInjectPrompt(toolCall, userId);

      // Route tool call to appropriate upstream
      const result = await this.upstreamProxy.callTool(toolCall, userId);

      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result
      });
    } catch (error) {
      this.logger.error('Error calling tool:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: 'Tool call failed'
        }
      });
    }
  }

  private async handleResourcesList(message: MCPMessage, res: Response, userId: string): Promise<void> {
    try {
      const resources = await this.promptSeeder.getAvailableResources();
      
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resources
        }
      });
    } catch (error) {
      this.logger.error('Error listing resources:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: 'Failed to list resources'
        }
      });
    }
  }

  private async handleResourceRead(message: MCPMessage, res: Response, userId: string): Promise<void> {
    try {
      const { uri } = message.params;
      const content = await this.promptSeeder.readResource(uri);
      
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          contents: [content]
        }
      });
    } catch (error) {
      this.logger.error('Error reading resource:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: 'Failed to read resource'
        }
      });
    }
  }
}

