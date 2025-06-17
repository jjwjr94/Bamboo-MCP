import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { MetaServerAuthProvider } from './MetaServerAuthProvider.js';

export function createMCPOAuthProvider(): MetaServerAuthProvider {
  return MetaServerAuthProvider.getInstance();
}

export function createMCPAuthRouter() {
  const provider = createMCPOAuthProvider();

  logger.info('Creating MCP Auth Router with MetaServerAuthProvider singleton');

  return mcpAuthRouter({
    provider,
    issuerUrl: new URL(env.BASE_URL),
    baseUrl: new URL(env.BASE_URL),
    serviceDocumentationUrl: new URL('https://docs.meta.com/'),
    scopesSupported: env.FACEBOOK_OAUTH_SCOPES.split(','),
    resourceName: 'Bamboo MCP Server',
  });
}
