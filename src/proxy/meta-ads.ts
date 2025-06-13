import { spawn, ChildProcess } from 'child_process';
import { MCPTool, MCPToolCall, MCPToolResult, MCPMessage } from '../types';
import { Logger } from '../core/logger';
import { AuthService } from '../auth/service';

export class MetaAdsProxy {
  private logger: Logger;
  private authService: AuthService;
  private mcpProcess: ChildProcess | null = null;
  private isConnected: boolean = false;
  private messageQueue: Array<{ message: MCPMessage; resolve: Function; reject: Function }> = [];
  private pendingRequests: Map<string | number, { resolve: Function; reject: Function }> = new Map();

  constructor(authService: AuthService) {
    this.logger = new Logger('MetaAdsProxy');
    this.authService = authService;
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Meta Ads MCP connection');
      
      // Spawn the Meta Ads MCP process
      this.mcpProcess = spawn('uvx', ['meta-ads-mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PIPEBOARD_API_TOKEN: process.env.PIPEBOARD_API_TOKEN || ''
        }
      });

      if (!this.mcpProcess.stdout || !this.mcpProcess.stdin || !this.mcpProcess.stderr) {
        throw new Error('Failed to create MCP process streams');
      }

      // Handle process output
      this.mcpProcess.stdout.on('data', (data) => {
        this.handleMCPResponse(data.toString());
      });

      this.mcpProcess.stderr.on('data', (data) => {
        this.logger.warn('Meta Ads MCP stderr:', data.toString());
      });

      this.mcpProcess.on('close', (code) => {
        this.logger.warn(`Meta Ads MCP process closed with code ${code}`);
        this.isConnected = false;
        this.mcpProcess = null;
      });

      this.mcpProcess.on('error', (error) => {
        this.logger.error('Meta Ads MCP process error:', error);
        this.isConnected = false;
      });

      // Wait for connection
      await this.waitForConnection();
      this.isConnected = true;
      this.logger.info('Meta Ads MCP connection established');

      // Process queued messages
      this.processMessageQueue();

    } catch (error) {
      this.logger.error('Failed to initialize Meta Ads MCP:', error);
      throw error;
    }
  }

  public async getTools(): Promise<MCPTool[]> {
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/list',
        params: {}
      });

      if (response.error) {
        throw new Error(`Failed to get tools: ${response.error.message}`);
      }

      // Add "ads." prefix to all tool names
      const tools = response.result?.tools || [];
      return tools.map((tool: MCPTool) => ({
        ...tool,
        name: `ads.${tool.name}`
      }));
    } catch (error) {
      this.logger.error('Error getting Meta Ads tools:', error);
      return [];
    }
  }

  public async callTool(toolCall: MCPToolCall, userId: string): Promise<MCPToolResult> {
    try {
      // Remove "ads." prefix for the actual MCP call
      const actualToolName = toolCall.name.replace(/^ads\\./, '');
      
      // Get user's Meta Ads token
      const accessToken = await this.authService.getMetaAdsToken(userId);
      if (!accessToken) {
        return {
          content: [{
            type: 'text',
            text: 'Meta Ads authentication required. Please authenticate first.'
          }],
          isError: true
        };
      }

      // Add access token to tool arguments if not present
      const toolArguments = {
        ...toolCall.arguments,
        access_token: toolCall.arguments.access_token || accessToken
      };

      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/call',
        params: {
          name: actualToolName,
          arguments: toolArguments
        }
      });

      if (response.error) {
        return {
          content: [{
            type: 'text',
            text: `Meta Ads API error: ${response.error.message}`
          }],
          isError: true
        };
      }

      return response.result || {
        content: [{
          type: 'text',
          text: 'No result from Meta Ads API'
        }]
      };
    } catch (error) {
      this.logger.error('Error calling Meta Ads tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error calling Meta Ads tool: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async sendMCPMessage(message: MCPMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.mcpProcess?.stdin) {
        // Queue the message if not connected
        this.messageQueue.push({ message, resolve, reject });
        return;
      }

      // Store the request for response matching
      if (message.id) {
        this.pendingRequests.set(message.id, { resolve, reject });
      }

      // Send the message
      const messageStr = JSON.stringify(message) + '\\n';
      this.mcpProcess.stdin.write(messageStr);

      // Set timeout for the request
      setTimeout(() => {
        if (message.id && this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  private handleMCPResponse(data: string): void {
    try {
      const lines = data.trim().split('\\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response = JSON.parse(line);
          
          if (response.id && this.pendingRequests.has(response.id)) {
            const { resolve } = this.pendingRequests.get(response.id)!;
            this.pendingRequests.delete(response.id);
            resolve(response);
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse MCP response line:', line);
        }
      }
    } catch (error) {
      this.logger.error('Error handling MCP response:', error);
    }
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      // Send a ping to test connection
      const pingMessage = {
        jsonrpc: '2.0',
        id: 'ping',
        method: 'ping',
        params: {}
      };

      this.pendingRequests.set('ping', {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      if (this.mcpProcess?.stdin) {
        this.mcpProcess.stdin.write(JSON.stringify(pingMessage) + '\\n');
      }
    });
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const { message, resolve, reject } = this.messageQueue.shift()!;
      this.sendMCPMessage(message)
        .then((result) => resolve(result))
        .catch((error) => reject(error));
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down Meta Ads MCP connection');
      
      if (this.mcpProcess) {
        this.mcpProcess.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (this.mcpProcess) {
              this.mcpProcess.kill('SIGKILL');
            }
            resolve(undefined);
          }, 5000);

          this.mcpProcess!.on('close', () => {
            clearTimeout(timeout);
            resolve(undefined);
          });
        });
      }

      this.isConnected = false;
      this.mcpProcess = null;
      this.pendingRequests.clear();
      this.messageQueue.length = 0;
    } catch (error) {
      this.logger.error('Error shutting down Meta Ads MCP:', error);
    }
  }
}

