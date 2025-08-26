import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { CoreServices } from '../mcp/coreServices.js';
import { env, getRequiredBaseUrl } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import type { MetaServerAuthProvider } from './MetaServerAuthProvider.js';

export function createMCPOAuthProvider(): MetaServerAuthProvider {
  // Get the provider from CoreServices to ensure we use the same instance
  const coreServices = CoreServices.getInstance();
  return coreServices.authProvider;
}

export function createMCPAuthRouter() {
  // Check if OAuth is configured
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET || !env.FACEBOOK_CALLBACK_URL) {
    logger.warn('OAuth not configured, skipping MCP Auth Router creation');
    return null;
  }

  // Since we're not using OAuth in the current setup, return null
  logger.warn('OAuth functionality disabled for current deployment');
  return null;
}
