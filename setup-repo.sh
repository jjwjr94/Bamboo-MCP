#!/bin/bash

# Bamboo MCP Gateway - Repository Setup Script
# This script initializes the git repository and prepares it for GitHub

set -e

echo "🚀 Bamboo MCP Gateway - Repository Setup"
echo "========================================"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the bamboo-mcp project root directory"
    exit 1
fi

echo "📁 Initializing git repository..."

# Initialize git if not already done
if [ ! -d ".git" ]; then
    git init
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi

# Set default branch to main
git branch -M main

# Configure git settings (optional)
echo ""
echo "⚙️  Configuring git settings..."
echo "Enter your name for git commits (or press Enter to skip):"
read -r git_name
if [ -n "$git_name" ]; then
    git config user.name "$git_name"
    echo "✅ Git user name set to: $git_name"
fi

echo "Enter your email for git commits (or press Enter to skip):"
read -r git_email
if [ -n "$git_email" ]; then
    git config user.email "$git_email"
    echo "✅ Git user email set to: $git_email"
fi

# Add all files
echo ""
echo "📦 Adding files to git..."
git add .

# Create initial commit
echo ""
echo "💾 Creating initial commit..."
if git diff --staged --quiet; then
    echo "⚠️  No changes to commit"
else
    git commit -m "Initial commit: Bamboo MCP Gateway

- Complete MCP gateway implementation
- Meta Ads and PostgreSQL integration
- Multi-provider authentication
- Docker containerization
- Comprehensive documentation
- Production-ready deployment configs"
    echo "✅ Initial commit created"
fi

echo ""
echo "🎉 Repository setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Create a new repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Repository name: bamboo-mcp"
echo "   - Description: All-in-One MCP Gateway combining Meta Ads and PostgreSQL functionality"
echo "   - Make it public or private (your choice)"
echo "   - Don't initialize with README, .gitignore, or license (we already have them)"
echo ""
echo "2. Connect your local repository to GitHub:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/bamboo-mcp.git"
echo ""
echo "3. Push your code to GitHub:"
echo "   git push -u origin main"
echo ""
echo "🏷️  Suggested repository tags:"
echo "   mcp, model-context-protocol, meta-ads, postgresql, typescript, nodejs, docker"
echo ""
echo "📝 Repository description:"
echo "   All-in-One Model Context Protocol (MCP) Gateway combining Meta Ads and PostgreSQL functionality with enterprise-grade authentication, prompt seeding, and company profile management."
echo ""
echo "🔗 After pushing, your repository will be available at:"
echo "   https://github.com/YOUR_USERNAME/bamboo-mcp"

