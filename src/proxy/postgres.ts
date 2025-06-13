import { spawn, ChildProcess } from 'child_process';
import { Pool } from 'pg';
import { MCPTool, MCPToolCall, MCPToolResult, MCPMessage, CompanyProfile } from '../types';
import { Logger } from '../core/logger';
import { ConfigService } from '../core/config';

export class PostgresProxy {
  private logger: Logger;
  private config: ConfigService;
  private mcpProcess: ChildProcess | null = null;
  private isConnected: boolean = false;
  private messageQueue: Array<{ message: MCPMessage; resolve: Function; reject: Function }> = [];
  private pendingRequests: Map<string | number, { resolve: Function; reject: Function }> = new Map();
  private dbPool: Pool;

  constructor() {
    this.logger = new Logger('PostgresProxy');
    this.config = ConfigService.getInstance();
    
    // Initialize database connection pool
    this.dbPool = new Pool({
      connectionString: this.config.get('DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing PostgreSQL MCP connection');
      
      // Test database connection
      await this.testDatabaseConnection();
      
      // Create company profiles table if it doesn't exist
      await this.createCompanyProfilesTable();
      
      // Spawn the Postgres MCP process
      this.mcpProcess = spawn('postgres-mcp', ['--access-mode=unrestricted'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DATABASE_URI: this.config.get('DATABASE_URL')
        }
      });

      if (!this.mcpProcess.stdout || !this.mcpProcess.stdin || !this.mcpProcess.stderr) {
        throw new Error('Failed to create Postgres MCP process streams');
      }

      // Handle process output
      this.mcpProcess.stdout.on('data', (data) => {
        this.handleMCPResponse(data.toString());
      });

      this.mcpProcess.stderr.on('data', (data) => {
        this.logger.warn('Postgres MCP stderr:', data.toString());
      });

      this.mcpProcess.on('close', (code) => {
        this.logger.warn(`Postgres MCP process closed with code ${code}`);
        this.isConnected = false;
        this.mcpProcess = null;
      });

      this.mcpProcess.on('error', (error) => {
        this.logger.error('Postgres MCP process error:', error);
        this.isConnected = false;
      });

      // Wait for connection
      await this.waitForConnection();
      this.isConnected = true;
      this.logger.info('PostgreSQL MCP connection established');

      // Process queued messages
      this.processMessageQueue();

    } catch (error) {
      this.logger.error('Failed to initialize PostgreSQL MCP:', error);
      throw error;
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    try {
      const client = await this.dbPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.logger.info('Database connection test successful');
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      throw new Error('Failed to connect to database');
    }
  }

  private async createCompanyProfilesTable(): Promise<void> {
    try {
      const client = await this.dbPool.connect();
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS company_profiles (
          company_id UUID PRIMARY KEY,
          json_data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_company_profiles_updated_at 
        ON company_profiles(updated_at);
      `);
      
      client.release();
      this.logger.info('Company profiles table ready');
    } catch (error) {
      this.logger.error('Failed to create company profiles table:', error);
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

      // Add "pg." prefix to all tool names
      const tools = response.result?.tools || [];
      return tools.map((tool: MCPTool) => ({
        ...tool,
        name: `pg.${tool.name}`
      }));
    } catch (error) {
      this.logger.error('Error getting PostgreSQL tools:', error);
      return [];
    }
  }

  public async callTool(toolCall: MCPToolCall, userId: string): Promise<MCPToolResult> {
    try {
      // Remove "pg." prefix for the actual MCP call
      const actualToolName = toolCall.name.replace(/^pg\\./, '');
      
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/call',
        params: {
          name: actualToolName,
          arguments: toolCall.arguments
        }
      });

      if (response.error) {
        return {
          content: [{
            type: 'text',
            text: `PostgreSQL error: ${response.error.message}`
          }],
          isError: true
        };
      }

      return response.result || {
        content: [{
          type: 'text',
          text: 'No result from PostgreSQL'
        }]
      };
    } catch (error) {
      this.logger.error('Error calling PostgreSQL tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error calling PostgreSQL tool: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  // Company profile management methods
  public async getCompanyProfile(companyId: string): Promise<CompanyProfile | null> {
    try {
      const client = await this.dbPool.connect();
      
      const result = await client.query(
        'SELECT company_id, json_data, updated_at FROM company_profiles WHERE company_id = $1',
        [companyId]
      );
      
      client.release();
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        companyId: row.company_id,
        jsonData: row.json_data,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error('Error getting company profile from database:', error);
      throw error;
    }
  }

  public async saveCompanyProfile(profile: CompanyProfile): Promise<void> {
    try {
      const client = await this.dbPool.connect();
      
      await client.query(
        `INSERT INTO company_profiles (company_id, json_data, updated_at) 
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id) 
         DO UPDATE SET json_data = $2, updated_at = $3`,
        [profile.companyId, JSON.stringify(profile.jsonData), new Date()]
      );
      
      client.release();
      this.logger.info(`Saved company profile for: ${profile.companyId}`);
    } catch (error) {
      this.logger.error('Error saving company profile to database:', error);
      throw error;
    }
  }

  public async deleteCompanyProfile(companyId: string): Promise<boolean> {
    try {
      const client = await this.dbPool.connect();
      
      const result = await client.query(
        'DELETE FROM company_profiles WHERE company_id = $1',
        [companyId]
      );
      
      client.release();
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      this.logger.error('Error deleting company profile from database:', error);
      throw error;
    }
  }

  public async listCompanyProfiles(limit: number = 50, offset: number = 0): Promise<CompanyProfile[]> {
    try {
      const client = await this.dbPool.connect();
      
      const result = await client.query(
        `SELECT company_id, json_data, updated_at 
         FROM company_profiles 
         ORDER BY updated_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      client.release();
      
      return result.rows.map(row => ({
        companyId: row.company_id,
        jsonData: row.json_data,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      this.logger.error('Error listing company profiles from database:', error);
      throw error;
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
          this.logger.warn('Failed to parse PostgreSQL MCP response line:', line);
        }
      }
    } catch (error) {
      this.logger.error('Error handling PostgreSQL MCP response:', error);
    }
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PostgreSQL MCP connection timeout'));
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
      this.logger.info('Shutting down PostgreSQL MCP connection');
      
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

      // Close database pool
      await this.dbPool.end();

      this.isConnected = false;
      this.mcpProcess = null;
      this.pendingRequests.clear();
      this.messageQueue.length = 0;
    } catch (error) {
      this.logger.error('Error shutting down PostgreSQL MCP:', error);
    }
  }
}

