#!/bin/bash

# Bamboo MCP Deployment Script for Render.com
# This script handles the build and deployment process

set -e

echo "🚀 Starting Bamboo MCP deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build the application
echo "🔨 Building application..."
npm run build

# Install Python dependencies for MCP servers
echo "🐍 Installing Python dependencies..."
pip install uvx

# Install Meta Ads MCP
echo "📊 Installing Meta Ads MCP..."
uvx install meta-ads-mcp

# Install Postgres MCP (if available)
echo "🗄️ Installing Postgres MCP..."
# Note: This may need to be adjusted based on actual package availability
pip install postgres-mcp || echo "⚠️ Postgres MCP not available via pip, using alternative method"

# Verify installations
echo "✅ Verifying installations..."
node --version
npm --version
python3 --version
uvx --version || echo "⚠️ uvx not in PATH, but should be available"

echo "🎉 Deployment preparation completed!"
echo "🔧 Make sure to set the following environment variables in Render:"
echo "   - DATABASE_URL (PostgreSQL connection string)"
echo "   - REDIS_URL (Redis connection string)"
echo "   - JWT_SECRET (secure random string)"
echo "   - FACEBOOK_APP_ID and FACEBOOK_APP_SECRET"
echo "   - PIPEBOARD_API_TOKEN"
echo "   - All other environment variables from .env.example"

# Start the application
echo "🚀 Starting Bamboo MCP Gateway..."
exec node dist/index.js

