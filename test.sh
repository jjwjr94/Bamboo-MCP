#!/bin/bash

# Test script for Bamboo MCP Gateway (Fixed)

echo "🧪 Testing Bamboo MCP Gateway (Fixed)"
echo "======================================"

# Check if server is running
echo "1. Testing health endpoint..."
curl -s http://localhost:8443/health | jq '.' || echo "❌ Server not running or jq not installed"

echo ""
echo "2. Testing root endpoint..."
curl -s http://localhost:8443/ | jq '.' || echo "❌ Root endpoint failed"

echo ""
echo "3. Testing manifest endpoint..."
curl -s http://localhost:8443/manifest | jq '.' || echo "❌ Manifest endpoint failed"

echo ""
echo "4. Testing MCP endpoint without auth (should fail)..."
curl -s -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.' || echo "❌ MCP endpoint test failed"

echo ""
echo "5. Testing MCP endpoint with dummy token (should fail with proper error)..."
curl -s -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy_token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.' || echo "❌ MCP auth test failed"

echo ""
echo "📝 To test with real Meta token:"
echo "   export META_TOKEN='your_meta_access_token'"
echo "   curl -X POST http://localhost:8443/mcp \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Authorization: Bearer \$META_TOKEN' \\"
echo "     -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'"

echo ""
echo "🎯 n8n Configuration:"
echo "   Endpoint: http://localhost:8443/mcp"
echo "   Authentication: Bearer"
echo "   Token: [Your Meta access token]"

echo ""
echo "✅ Test completed!"

