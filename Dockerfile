# Multi-stage build for Bamboo MCP Gateway
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install system dependencies for MCP servers
RUN apk add --no-cache \
    python3 \
    py3-pip \
    postgresql-client \
    curl \
    && pip3 install --break-system-packages --no-cache-dir uvx

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bamboo -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration files
COPY --chown=bamboo:nodejs .env.example ./.env.example

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R bamboo:nodejs /app

# Switch to non-root user
USER bamboo

# Expose port
EXPOSE 8443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8443/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]

