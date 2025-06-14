// Updated index.ts with MCP server functionality
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { MCPServer } from './mcp-server';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8443;

// Initialize MCP Server
const mcpServer = new MCPServer();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    service: 'Bamboo MCP Gateway',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Bamboo MCP Gateway is running!');
});

// MCP Server-Sent Events endpoint
app.get('/mcp/sse', (req, res) => {
  mcpServer.handleSSE(req, res);
});

// MCP JSON-RPC endpoint
app.post('/mcp/jsonrpc', async (req, res) => {
  await mcpServer.handleRequest(req, res);
});

// MCP Manifest endpoint
app.get('/mcp/manifest', (req, res) => {
  res.json(mcpServer.getManifest());
});

// Legacy endpoints for backward compatibility
app.get('/manifest', (req, res) => {
  res.json(mcpServer.getManifest());
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Bamboo MCP Gateway is running on port ${port}`);
  console.log(`📡 MCP SSE endpoint: http://localhost:${port}/mcp/sse`);
  console.log(`🔗 MCP JSON-RPC endpoint: http://localhost:${port}/mcp/jsonrpc`);
  console.log(`📋 MCP Manifest: http://localhost:${port}/mcp/manifest`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;

