import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { CoreServices } from '../mcp/coreServices.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import type { MetaServerAuthProvider } from './MetaServerAuthProvider.js';

export function createMCPOAuthProvider(): MetaServerAuthProvider {
  // Get the provider from CoreServices to ensure we use the same instance
  const coreServices = CoreServices.getInstance();
  return coreServices.authProvider;
}

export function createMCPAuthRouter() {
  const provider = createMCPOAuthProvider();

  logger.info('Creating MCP Auth Router with MetaServerAuthProvider from CoreServices');

  return mcpAuthRouter({
    provider,
    issuerUrl: new URL(env.BASE_URL),
    baseUrl: new URL(env.BASE_URL),
    serviceDocumentationUrl: new URL('https://docs.meta.com/'),
    scopesSupported: env.FACEBOOK_OAUTH_SCOPES.split(','),
    resourceName: 'Bamboo MCP Server',
  });
}
