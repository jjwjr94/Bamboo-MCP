# Bamboo MCP Gateway (Fixed Version)

**Fixed MCP Gateway for Meta Ads with simplified authentication and HTTP Streamable transport**

## 🔧 What's Fixed

### ✅ Authentication Simplified
- **Removed complex JWT layer** - No more Facebook/Pipeboard/JWT confusion
- **Direct Meta token usage** - Use your Meta access token directly as Bearer token
- **Clear token path** - Meta app → access token → n8n → MCP server → Meta API

### ✅ Transport Updated
- **HTTP Streamable transport** - Replaced deprecated SSE with MCP 2025-06-18 compliant transport
- **Single `/mcp` endpoint** - Works with n8n and other MCP clients
- **Proper CORS handling** - Configured for AI platform integration

### ✅ n8n Integration Ready
- **Standard Bearer authentication** - Just paste your Meta token
- **Clear endpoint** - Single URL for all MCP operations
- **Error handling** - Proper MCP protocol error responses

## 🚀 Quick Start

### 1. Get Meta Access Token
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Generate a long-lived access token with ads permissions
4. Copy the access token

### 2. Run the Fixed Server
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm run start:fixed
```

### 3. Configure n8n
1. Add **MCP Client Tool** node in n8n
2. Configure:
   - **Endpoint**: `http://your-server:8443/mcp`
   - **Authentication**: Bearer
   - **Token**: [Your Meta access token from step 1]

### 4. Test the Connection
The server will validate your Meta token and provide access to Meta Ads tools:
- `ads.get_campaigns` - Get campaigns for an ad account
- `ads.get_adsets` - Get adsets for a campaign
- `ads.get_ads` - Get ads for an adset
- `ads.get_insights` - Get performance insights

## 📡 API Endpoints

- **`/mcp`** - Main MCP endpoint (HTTP Streamable transport)
- **`/manifest`** - MCP server manifest
- **`/health`** - Health check and server info
- **`/`** - Server information and setup instructions

## 🔐 Authentication

### How It Works Now (Simple!)
```
Meta App → Access Token → n8n Bearer Auth → MCP Server → Meta API
```

### What You Need
- Meta access token with ads permissions
- That's it! No complex setup required.

## 🆚 Comparison with Original

| Feature | Original | Fixed |
|---------|----------|-------|
| Transport | SSE (deprecated) | HTTP Streamable |
| Authentication | JWT + Facebook/Pipeboard | Direct Meta token |
| n8n Integration | Broken | ✅ Works |
| Token Source | Complex multi-step | Single Meta token |
| Setup Complexity | High | Low |

## 🔧 Environment Variables

Create a `.env` file (optional - only needed for additional configuration):

```env
PORT=8443
NODE_ENV=production
```

The server no longer requires complex database or Redis configuration!

## 🐳 Docker Support

```bash
# Build Docker image
npm run docker:build

# Run container
npm run docker:run
```

## 📝 Example n8n Workflow

1. **Add MCP Client Tool**
2. **Configure**:
   ```
   Endpoint: http://localhost:8443/mcp
   Authentication: Bearer
   Token: EAABwzLixnjYBO... (your Meta token)
   ```
3. **Use in AI Agent**:
   ```
   Get campaigns for ad account 123456789
   ```

## 🔍 Troubleshooting

### Token Issues
- **Invalid token**: Check your Meta token has ads permissions
- **Expired token**: Generate a new long-lived token
- **Wrong format**: Use Bearer authentication, not other types

### Connection Issues
- **CORS errors**: Server allows all origins by default
- **404 errors**: Use `/mcp` endpoint, not `/mcp/sse`
- **Transport errors**: This version uses HTTP Streamable, not SSE

### Testing Your Setup
```bash
# Test health endpoint
curl http://localhost:8443/health

# Test MCP endpoint (replace TOKEN with your Meta token)
curl -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_META_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 🎯 Key Benefits

1. **Works with n8n** - No more authentication confusion
2. **Simple setup** - Just get Meta token and go
3. **Standard compliance** - Uses proper MCP transport
4. **Easy debugging** - Clear error messages
5. **Future-proof** - Uses latest MCP specification

## 📚 Migration from Original

If you're using the original Bamboo MCP:

1. **Stop the old server**
2. **Get your Meta access token** (from Meta Developer Console)
3. **Start this fixed server**
4. **Update n8n configuration** with new endpoint and token
5. **Remove complex authentication setup** - you don't need it anymore!

---

**This fixed version eliminates all the complexity and makes Bamboo MCP work just like Box MCP - simple and effective!**

