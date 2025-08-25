// Updated index.ts with fixed MCP server implementation
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { FixedMCPServer } from './mcp-server-fixed';

// Load environment variables
dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8443', 10);

// Initialize Fixed MCP Server
const mcpServer = new FixedMCPServer();

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedding for MCP clients
}));

app.use(cors({
  origin: '*', // Allow all origins for MCP (can be restricted in production)
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.3.0',
    service: 'Bamboo MCP Gateway (Fixed)',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    transport: 'streamable-http',
    authentication: 'meta-token-direct'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Bamboo MCP Gateway (Fixed)',
    version: '0.3.0',
    description: 'Simplified MCP Gateway for Meta Ads with direct token authentication',
    transport: 'streamable-http',
    endpoints: {
      mcp: '/mcp',
      manifest: '/manifest',
      health: '/health'
    },
    authentication: {
      type: 'bearer',
      description: 'Use your Meta access token as Bearer token',
      howToGetToken: 'Create a Meta app at developers.facebook.com and generate an access token'
    }
  });
});

// Main MCP endpoint (HTTP Streamable transport)
app.all('/mcp', async (req, res) => {
  await mcpServer.handleStreamableHTTP(req, res);
});

// MCP Manifest endpoint
app.get('/manifest', (req, res) => {
  res.json(mcpServer.getManifest());
});

// Legacy endpoints for backward compatibility (redirect to main endpoint)
app.all('/mcp/sse', (req, res) => {
  res.status(301).json({
    error: 'SSE transport deprecated',
    message: 'Please use /mcp endpoint with HTTP Streamable transport',
    newEndpoint: '/mcp'
  });
});

app.all('/mcp/jsonrpc', (req, res) => {
  res.status(301).json({
    error: 'JSON-RPC endpoint deprecated',
    message: 'Please use /mcp endpoint with HTTP Streamable transport',
    newEndpoint: '/mcp'
  });
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
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      mcp: '/mcp',
      manifest: '/manifest',
      health: '/health'
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Bamboo MCP Gateway (Fixed) is running on port ${port}`);
  console.log(`📡 MCP Streamable HTTP endpoint: http://localhost:${port}/mcp`);
  console.log(`📋 MCP Manifest: http://localhost:${port}/manifest`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log('');
  console.log('🔧 Configuration:');
  console.log('   - Transport: HTTP Streamable (MCP 2025-06-18)');
  console.log('   - Authentication: Meta access token (Bearer)');
  console.log('   - CORS: Enabled for all origins');
  console.log('');
  console.log('📖 How to use with n8n:');
  console.log('   1. Get Meta access token from developers.facebook.com');
  console.log('   2. In n8n MCP Client Tool:');
  console.log(`      - Endpoint: http://localhost:${port}/mcp`);
  console.log('      - Authentication: Bearer');
  console.log('      - Token: [Your Meta access token]');
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

