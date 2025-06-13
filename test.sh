#!/bin/bash

# Bamboo MCP Gateway Test Script
# This script validates the implementation and configuration

set -e

echo "🧪 Bamboo MCP Gateway Test Suite"
echo "================================="

# Test 1: Build validation
echo "📦 Test 1: Build Validation"
echo "Building TypeScript application..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Test 2: Configuration validation
echo ""
echo "⚙️  Test 2: Configuration Validation"
echo "Checking configuration files..."

# Check if required files exist
required_files=(
    "package.json"
    "tsconfig.json"
    "Dockerfile"
    "docker-compose.yml"
    ".env.example"
    "README.md"
    "src/index.ts"
    "src/core/gateway.ts"
    "src/auth/service.ts"
    "src/proxy/upstream.ts"
    "src/proxy/meta-ads.ts"
    "src/proxy/postgres.ts"
    "src/resources/prompt-seeder.ts"
    "src/types/index.ts"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Test 3: TypeScript type checking
echo ""
echo "🔍 Test 3: TypeScript Type Checking"
echo "Running type checker..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo "✅ Type checking passed"
else
    echo "❌ Type checking failed"
    exit 1
fi

# Test 4: Environment configuration
echo ""
echo "🌍 Test 4: Environment Configuration"
echo "Validating environment templates..."

if [ -f "examples/.env.development" ] && [ -f "examples/.env.production" ]; then
    echo "✅ Environment templates exist"
else
    echo "❌ Environment templates missing"
    exit 1
fi

# Test 5: Documentation completeness
echo ""
echo "📚 Test 5: Documentation Completeness"
echo "Checking documentation files..."

doc_files=(
    "README.md"
    "examples/README.md"
    "examples/api-usage-examples.md"
    "examples/claude-desktop-config.json"
)

for file in "${doc_files[@]}"; do
    if [ -f "$file" ] && [ -s "$file" ]; then
        echo "✅ $file exists and has content"
    else
        echo "❌ $file missing or empty"
        exit 1
    fi
done

# Test 6: Package dependencies
echo ""
echo "📋 Test 6: Package Dependencies"
echo "Checking package.json dependencies..."

# Check if critical dependencies are present
node -e "
const pkg = require('./package.json');
const required = [
    'express', 'cors', 'helmet', 'morgan', 'jsonwebtoken',
    'passport', 'passport-facebook-token', 'bcryptjs',
    'pg', 'ioredis', 'express-rate-limit', 'dotenv', 'joi'
];

const missing = required.filter(dep => !pkg.dependencies[dep]);
if (missing.length > 0) {
    console.log('❌ Missing dependencies:', missing.join(', '));
    process.exit(1);
} else {
    console.log('✅ All required dependencies present');
}
"

# Test 7: Project structure validation
echo ""
echo "🏗️  Test 7: Project Structure Validation"
echo "Validating project structure..."

required_dirs=(
    "src/auth"
    "src/core"
    "src/proxy"
    "src/resources"
    "src/types"
    "examples"
    "scripts"
)

for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ Directory $dir exists"
    else
        echo "❌ Directory $dir missing"
        exit 1
    fi
done

# Test 8: Script permissions
echo ""
echo "🔐 Test 8: Script Permissions"
echo "Checking script permissions..."

if [ -x "scripts/deploy.sh" ]; then
    echo "✅ Deploy script is executable"
else
    echo "❌ Deploy script not executable"
    exit 1
fi

# Test 9: Configuration examples validation
echo ""
echo "📝 Test 9: Configuration Examples Validation"
echo "Validating configuration examples..."

# Check Claude Desktop config
node -e "
try {
    const config = require('./examples/claude-desktop-config.json');
    if (config.mcpServers && config.mcpServers['bamboo-mcp']) {
        console.log('✅ Claude Desktop configuration valid');
    } else {
        console.log('❌ Claude Desktop configuration invalid');
        process.exit(1);
    }
} catch (e) {
    console.log('❌ Claude Desktop configuration parse error:', e.message);
    process.exit(1);
}
"

# Test 10: Final summary
echo ""
echo "📊 Test Summary"
echo "==============="
echo "✅ All tests passed successfully!"
echo ""
echo "🎉 Bamboo MCP Gateway is ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env and configure your environment"
echo "2. Set up PostgreSQL and Redis services"
echo "3. Configure Facebook OAuth application"
echo "4. Deploy using Docker Compose or your preferred method"
echo "5. Configure Claude Desktop with the provided examples"
echo ""
echo "For detailed instructions, see README.md"

