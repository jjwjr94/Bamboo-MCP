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

  const provider = createMCPOAuthProvider();

  logger.info('Creating MCP Auth Router with MetaServerAuthProvider from CoreServices');

  const baseUrl = getRequiredBaseUrl('OAuth configuration');

  return mcpAuthRouter({
    provider,
    issuerUrl: new URL(baseUrl),
    baseUrl: new URL(baseUrl),
    serviceDocumentationUrl: new URL('https://docs.meta.com/'),
    scopesSupported: env.FACEBOOK_OAUTH_SCOPES.split(','),
    resourceName: 'Bamboo MCP Server',
  });
}
