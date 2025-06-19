# Code Examples

## Environment Validation (`src/utils/env.ts`)

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().transform(Number).default(3000),
  
  // Database (Direct PostgreSQL connection)
  DATABASE_URL: z.string().url(),
  
  // Facebook OAuth
  FACEBOOK_APP_ID: z.string(),
  FACEBOOK_APP_SECRET: z.string(),
  FACEBOOK_CALLBACK_URL: z.string().url(),
  
  // OAuth Scopes (comprehensive Meta API access)
  FACEBOOK_OAUTH_SCOPES: z.string().default(
    'ads_management,ads_read,business_management,pages_manage_ads,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_cta,pages_messaging,attribution_read'
  ),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // Server
  BASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

## Drizzle Configuration (`drizzle.config.ts`)

```typescript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  // Enable role management for RLS policies
  entities: {
    roles: true, // Manage custom application roles
  },
});
```

## Database Client Configuration (`src/db/client.ts`)

```typescript
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../utils/env.js';

// Direct PostgreSQL connection with Drizzle ORM
// prepare: false is required for Supabase connection pooling
const client = postgres(env.DATABASE_URL, { 
  prepare: false,
  max: 10, // Connection pool size
});

export const db = drizzle(client);

// Helper function to create user-scoped database connection
export const createUserScopedDb = (userId: string) => {
  const userClient = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    // Set session variable for RLS
    onconnect: async (connection) => {
      await connection.query(`SET app.current_user_id = '${userId}'`);
    },
  });
  
  return drizzle(userClient);
};
```

## Database Schema with Standard PostgreSQL RLS (`src/db/schema.ts`)

```typescript
import { pgTable, uuid, text, timestamp, boolean, bigint, jsonb, pgPolicy, pgRole } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Define application role for authenticated users
export const appUser = pgRole('app_user');

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  facebookUserId: text('facebook_user_id').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  // Users can only access their own data using session variable
  pgPolicy('users_select_own', {
    for: 'select',
    to: appUser,
    using: sql`${table.id} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('users_update_own', {
    for: 'update',
    to: appUser,
    using: sql`${table.id} = current_setting('app.current_user_id')::uuid`,
    withCheck: sql`${table.id} = current_setting('app.current_user_id')::uuid`,
  }),
]);

export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  accessToken: text('access_token').notNull(),
  expiresAt: timestamp('expires_at'),
  scopes: text('scopes').array(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  // Users can only access their own tokens
  pgPolicy('tokens_select_own', {
    for: 'select',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('tokens_insert_own', {
    for: 'insert',
    to: appUser,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('tokens_update_own', {
    for: 'update',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('tokens_delete_own', {
    for: 'delete',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
]);

export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(), // SHA-256 hashed refresh token
  userId: uuid('user_id').references(() => users.id).notNull(),
  clientId: text('client_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  // Users can only access their own refresh tokens
  pgPolicy('refresh_tokens_select_own', {
    for: 'select',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('refresh_tokens_insert_own', {
    for: 'insert',
    to: appUser,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('refresh_tokens_update_own', {
    for: 'update',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('refresh_tokens_delete_own', {
    for: 'delete',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
]);

export const adAccounts = pgTable('ad_accounts', {
  id: text('id').primaryKey(), // Meta ad account ID
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  currency: text('currency'),
  timezone: text('timezone'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  // Users can only access their own ad accounts
  pgPolicy('ad_accounts_select_own', {
    for: 'select',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('ad_accounts_insert_own', {
    for: 'insert',
    to: appUser,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('ad_accounts_update_own', {
    for: 'update',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
    withCheck: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
  pgPolicy('ad_accounts_delete_own', {
    for: 'delete',
    to: appUser,
    using: sql`${table.userId} = current_setting('app.current_user_id')::uuid`,
  }),
]);

// Note: RLS is automatically enabled when policies are defined
// Session variable 'app.current_user_id' is set per connection for user context
```

## OAuth with PKCE Implementation (Using Helper Library)

```typescript
import { generateChallenge, verifyChallenge } from 'pkce-challenge';
import { FastifyReply, FastifyRequest } from 'fastify';

// Generate PKCE challenge pair for client
export async function generatePKCEChallenge() {
  const challenge = await generateChallenge();
  return {
    codeVerifier: challenge.code_verifier,
    codeChallenge: challenge.code_challenge
  };
}

// Authorization endpoint with PKCE
async function authorize(request: FastifyRequest, reply: FastifyReply) {
  const { 
    client_id, 
    redirect_uri, 
    state, 
    code_challenge, 
    code_challenge_method,
    scope = 'ads_management,business_management'
  } = request.query as any;

  // Validate PKCE parameters (mandatory in 2025)
  if (!code_challenge || code_challenge_method !== 'S256') {
    return reply.status(400).send({ error: 'PKCE required' });
  }

  // Store PKCE challenge for later verification
  const sessionState = Buffer.from(JSON.stringify({
    code_challenge,
    redirect_uri,
    state
  })).toString('base64');

  const facebookAuthUrl = new URL('https://www.facebook.com/v22.0/dialog/oauth');
  facebookAuthUrl.search = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: env.FACEBOOK_CALLBACK_URL,
    state: sessionState,
    scope: scope || env.FACEBOOK_OAUTH_SCOPES,
    response_type: 'code',
  }).toString();

  return reply.redirect(facebookAuthUrl.toString());
}

// Verify PKCE in callback
export async function verifyPKCEChallenge(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  try {
    return await verifyChallenge(codeVerifier, codeChallenge);
  } catch (error) {
    return false;
  }
}
```

## Testing Examples

### MCP Server Test (`test/mcp.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import BambooMCPServer from '../src/mcp/server.js';

describe('Bamboo MCP Server', () => {
  let server: BambooMCPServer;

  beforeAll(async () => {
    server = new BambooMCPServer();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should initialize server with correct capabilities', () => {
    expect(server).toBeDefined();
  });

  it('should list available tools', async () => {
    // Test tool listing functionality
    const tools = await server.listTools();
    expect(tools).toContain('get_ad_accounts');
    expect(tools).toContain('create_campaign');
  });
});
```

### OAuth Flow Test (`test/auth.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { generatePKCEChallenge, verifyPKCEChallenge } from '../src/auth/oauth.js';

describe('OAuth PKCE Flow', () => {
  it('should generate valid PKCE challenge', async () => {
    const challenge = await generatePKCEChallenge();
    
    expect(challenge.codeVerifier).toBeDefined();
    expect(challenge.codeChallenge).toBeDefined();
    expect(challenge.codeVerifier.length).toBeGreaterThan(40);
  });

  it('should verify PKCE challenge correctly', async () => {
    const challenge = await generatePKCEChallenge();
    const isValid = await verifyPKCEChallenge(
      challenge.codeVerifier, 
      challenge.codeChallenge
    );
    
    expect(isValid).toBe(true);
  });

  it('should reject invalid PKCE verification', async () => {
    const challenge = await generatePKCEChallenge();
    const isValid = await verifyPKCEChallenge(
      'invalid-verifier', 
      challenge.codeChallenge
    );
    
    expect(isValid).toBe(false);
  });
});
```

### Fastify Server Test (`test/server.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('Fastify Server', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = build({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should respond to health check', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({
      status: 'healthy'
    });
  });

  it('should handle SSE endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/sse',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
  });
});
```

## MCP Server Implementation (`src/mcp/server.ts`)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { metaTools } from '../tools/metaTools.js';
import { verifyJWT } from '../auth/jwt.js';

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.enum([
    'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 
    'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS'
  ]),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
  adAccountId: z.string(),
  dailyBudget: z.number().min(100).optional(), // cents
});

class BambooMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'Bamboo MCP',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_ad_accounts',
            description: 'Get all ad accounts for the authenticated user',
            inputSchema: z.object({}).passthrough(),
          },
          {
            name: 'create_campaign',
            description: 'Create a new advertising campaign',
            inputSchema: CreateCampaignSchema,
          },
          // ... other tools
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Extract and verify JWT token
      const authHeader = request.meta?.['Authorization'] || request.meta?.['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('Authorization required');
      }
      
      const token = authHeader.slice(7);
      const decoded = verifyJWT(token);
      const userId = decoded.userId;

      try {
        let result;
        
        switch (name) {
          case 'get_ad_accounts':
            result = await metaTools.getAdAccounts(userId, args);
            break;
          case 'create_campaign':
            result = await metaTools.createCampaign(userId, args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupResourceHandlers() {
    // Resource handlers for prompts
    // Implementation details...
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Bamboo MCP Server running on stdio...');
  }

  getServer() {
    return this.server;
  }
}

export default BambooMCPServer;
```

## Comprehensive MCP Tool Implementations

### Multi-Account Context Management (`src/utils/accountManager.ts`)

```typescript
interface AccountContext {
  selectedAccountId?: string;
  availableAccounts: Array<{
    id: string;
    name: string;
    permissions: string[];
  }>;
}

export class AccountManager {
  private contexts = new Map<string, AccountContext>();

  async getAccountContext(userId: string): Promise<AccountContext> {
    if (!this.contexts.has(userId)) {
      const accounts = await this.fetchUserAccounts(userId);
      this.contexts.set(userId, { availableAccounts: accounts });
    }
    return this.contexts.get(userId)!;
  }

  async selectAccount(userId: string, accountId: string): Promise<void> {
    const context = await this.getAccountContext(userId);
    const account = context.availableAccounts.find(acc => acc.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found or not accessible`);
    }
    context.selectedAccountId = accountId;
  }

  async requireAccountSelection(userId: string, providedAccountId?: string): Promise<string> {
    const context = await this.getAccountContext(userId);
    
    if (providedAccountId) {
      await this.selectAccount(userId, providedAccountId);
      return providedAccountId;
    }

    if (context.selectedAccountId) {
      return context.selectedAccountId;
    }

    if (context.availableAccounts.length === 1) {
      context.selectedAccountId = context.availableAccounts[0].id;
      return context.selectedAccountId;
    }

    // Multiple accounts available - return structured error for Claude to handle
    throw new Error(
      `Multiple ad accounts available. Please specify which account to use:\n` +
      context.availableAccounts.map(acc => `- ${acc.id}: ${acc.name}`).join('\n')
    );
  }

  // New method for structured account selection responses
  async getAccountSelectionResponse(userId: string, providedAccountId?: string): Promise<{
    success: boolean;
    accountId?: string;
    requiresSelection?: boolean;
    accounts?: Array<{ id: string; name: string; permissions: string[] }>;
    message?: string;
  }> {
    const context = await this.getAccountContext(userId);
    
    if (providedAccountId) {
      try {
        await this.selectAccount(userId, providedAccountId);
        return {
          success: true,
          accountId: providedAccountId
        };
      } catch (error) {
        return {
          success: false,
          message: error.message
        };
      }
    }

    if (context.selectedAccountId) {
      return {
        success: true,
        accountId: context.selectedAccountId
      };
    }

    if (context.availableAccounts.length === 1) {
      context.selectedAccountId = context.availableAccounts[0].id;
      return {
        success: true,
        accountId: context.selectedAccountId
      };
    }

    // Multiple accounts available - return selection options
    return {
      success: false,
      requiresSelection: true,
      accounts: context.availableAccounts,
      message: 'Multiple ad accounts available. Please select one to continue:'
    };
  }

  private async fetchUserAccounts(userId: string) {
    // Implementation to fetch user's ad accounts from Meta API
    // This would be called during initial authentication
    return [];
  }
}
```

### Complete Tool Definitions (`src/tools/toolDefinitions.ts`)

```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Account Management Tools
export const accountManagementTools: Tool[] = [
  {
    name: 'get_ad_accounts',
    description: 'Retrieve all ad accounts for the authenticated user with permissions',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_business_accounts',
    description: 'Retrieve business accounts and their associated ad accounts',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'select_ad_account',
    description: 'Select an ad account for subsequent operations',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID to select' }
      },
      required: ['adAccountId']
    }
  }
];

// Campaign Management Tools
export const campaignManagementTools: Tool[] = [
  {
    name: 'get_campaigns',
    description: 'Retrieve campaigns for an ad account',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'] },
        fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to retrieve' }
      }
    }
  },
  {
    name: 'create_campaign',
    description: 'Create a new advertising campaign',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        name: { type: 'string', minLength: 1, maxLength: 400 },
        objective: { 
          type: 'string',
          enum: ['OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS']
        },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
        dailyBudget: { type: 'number', minimum: 100, description: 'Daily budget in cents' },
        lifetimeBudget: { type: 'number', minimum: 100, description: 'Lifetime budget in cents' },
        specialAdCategories: { type: 'array', items: { type: 'string' }, default: [] },
        bidStrategy: { type: 'string', enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'TARGET_COST'] }
      },
      required: ['name', 'objective']
    }
  },
  {
    name: 'update_campaign',
    description: 'Update an existing campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 400 },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        dailyBudget: { type: 'number', minimum: 100 },
        lifetimeBudget: { type: 'number', minimum: 100 }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'delete_campaign',
    description: 'Delete a campaign (sets status to DELETED)',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string' }
      },
      required: ['campaignId']
    }
  }
];

// Ad Set Management Tools
export const adSetManagementTools: Tool[] = [
  {
    name: 'get_adsets',
    description: 'Retrieve ad sets for a campaign or ad account',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'Campaign ID (optional)' },
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'] },
        fields: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'create_adset',
    description: 'Create a new ad set within a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 400 },
        dailyBudget: { type: 'number', minimum: 100 },
        lifetimeBudget: { type: 'number', minimum: 100 },
        targeting: {
          type: 'object',
          properties: {
            geoLocations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' } },
                regions: { type: 'array', items: { type: 'object' } },
                cities: { type: 'array', items: { type: 'object' } }
              }
            },
            ageMin: { type: 'number', minimum: 13, maximum: 65 },
            ageMax: { type: 'number', minimum: 13, maximum: 65 },
            genders: { type: 'array', items: { type: 'string', enum: ['1', '2'] } },
            interests: { type: 'array', items: { type: 'object' } },
            behaviors: { type: 'array', items: { type: 'object' } },
            customAudiences: { type: 'array', items: { type: 'string' } }
          }
        },
        billingEvent: { type: 'string', enum: ['IMPRESSIONS', 'LINK_CLICKS', 'POST_ENGAGEMENT'] },
        optimizationGoal: { type: 'string', enum: ['LINK_CLICKS', 'IMPRESSIONS', 'REACH', 'POST_ENGAGEMENT'] },
        bidAmount: { type: 'number', minimum: 1 },
        startTime: { type: 'string', format: 'date-time' },
        endTime: { type: 'string', format: 'date-time' }
      },
      required: ['campaignId', 'name', 'targeting']
    }
  }
];

// Creative Management Tools
export const creativeManagementTools: Tool[] = [
  {
    name: 'get_ad_creatives',
    description: 'Retrieve ad creatives for an ad account',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        limit: { type: 'number', default: 25 },
        fields: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'create_ad_creative',
    description: 'Create a new ad creative',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        name: { type: 'string' },
        objectStorySpec: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            linkData: {
              type: 'object',
              properties: {
                link: { type: 'string', format: 'uri' },
                message: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                imageHash: { type: 'string' },
                callToAction: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD'] }
                  }
                }
              }
            }
          }
        }
      },
      required: ['name', 'objectStorySpec']
    }
  }
];

// Audience Management Tools
export const audienceManagementTools: Tool[] = [
  {
    name: 'get_custom_audiences',
    description: 'Retrieve custom audiences for an ad account',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        limit: { type: 'number', default: 25 },
        fields: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'create_custom_audience',
    description: 'Create a new custom audience',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        name: { type: 'string' },
        subtype: { type: 'string', enum: ['CUSTOM', 'WEBSITE', 'APP', 'OFFLINE_CONVERSION', 'CLAIM', 'PARTNER'] },
        description: { type: 'string' },
        customerFileSource: { type: 'string', enum: ['USER_PROVIDED_ONLY', 'PARTNER_PROVIDED_ONLY', 'BOTH_USER_AND_PARTNER_PROVIDED'] }
      },
      required: ['name', 'subtype']
    }
  }
];

// Insights & Reporting Tools
export const insightsTools: Tool[] = [
  {
    name: 'get_account_insights',
    description: 'Retrieve insights for an ad account',
    inputSchema: {
      type: 'object',
      properties: {
        adAccountId: { type: 'string', description: 'Ad account ID (optional if previously selected)' },
        fields: { type: 'array', items: { type: 'string' } },
        timeRange: {
          type: 'object',
          properties: {
            since: { type: 'string', format: 'date' },
            until: { type: 'string', format: 'date' }
          }
        },
        level: { type: 'string', enum: ['account', 'campaign', 'adset', 'ad'] },
        breakdowns: { type: 'array', items: { type: 'string' } }
      }
    }
  }
];

// Page Management Tools
export const pageManagementTools: Tool[] = [
  {
    name: 'get_pages',
    description: 'Retrieve Facebook Pages the user manages',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 25 },
        fields: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'create_page_post',
    description: 'Create a post on a Facebook Page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        message: { type: 'string' },
        link: { type: 'string', format: 'uri' },
        published: { type: 'boolean', default: true },
        scheduledPublishTime: { type: 'number', description: 'Unix timestamp' }
      },
      required: ['pageId', 'message']
    }
  }
];

// Commerce & Catalog Tools
export const commerceTools: Tool[] = [
  {
    name: 'get_product_catalogs',
    description: 'Retrieve product catalogs for commerce',
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        limit: { type: 'number', default: 25 },
        fields: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'create_product_catalog',
    description: 'Create a new product catalog',
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        name: { type: 'string' },
        verticalType: { type: 'string', enum: ['commerce', 'destinations', 'flights', 'home_listings', 'hotels', 'jobs', 'local_service_businesses', 'offline_commerce', 'vehicles'] }
      },
      required: ['businessId', 'name']
    }
  }
];

// Export all tools
export const allTools: Tool[] = [
  ...accountManagementTools,
  ...campaignManagementTools,
  ...adSetManagementTools,
  ...creativeManagementTools,
  ...audienceManagementTools,
  ...insightsTools,
  ...pageManagementTools,
  ...commerceTools
];
```

### Complete Tool Handler Implementation (`src/tools/metaToolsHandler.ts`)

```typescript
import { AdAccount, Campaign, AdSet, Ad, AdCreative, CustomAudience, Business, Page } from 'facebook-nodejs-business-sdk';
import { AccountManager } from '../utils/accountManager.js';

export class MetaToolsHandler {
  constructor(private accountManager: AccountManager) {}

  async handleGetAdAccounts(args: {}, userId: string) {
    try {
      const fields = [
        AdAccount.Fields.id,
        AdAccount.Fields.name,
        AdAccount.Fields.account_status,
        AdAccount.Fields.currency,
        AdAccount.Fields.timezone_name,
        AdAccount.Fields.created_time,
        AdAccount.Fields.amount_spent,
        AdAccount.Fields.balance
      ];

      const adAccounts = await new AdAccount('me').getAdAccounts(fields);
      
      const accountsWithPermissions = await Promise.all(
        adAccounts.map(async (account) => {
          try {
            const users = await account.getUsers(['id', 'name', 'permissions', 'role']);
            const currentUser = users.find(user => user.id === userId);
            
            return {
              id: account.id,
              name: account.name,
              status: account.account_status,
              currency: account.currency,
              timezone: account.timezone_name,
              permissions: currentUser?.permissions || [],
              role: currentUser?.role || 'UNKNOWN',
              amountSpent: account.amount_spent,
              balance: account.balance,
              createdAt: account.created_time
            };
          } catch (error) {
            // If we can't get permissions, still return basic account info
            return {
              id: account.id,
              name: account.name,
              status: account.account_status,
              currency: account.currency,
              timezone: account.timezone_name,
              permissions: [],
              role: 'UNKNOWN',
              createdAt: account.created_time
            };
          }
        })
      );

      // Use structured response instead of throwing error for multi-account scenarios
      if (accountsWithPermissions.length > 1) {
        return {
          success: true,
          data: accountsWithPermissions,
          requiresSelection: true,
          message: 'Multiple ad accounts available. Please select one to continue:',
          selectionPrompt: accountsWithPermissions.map(acc => 
            `• **${acc.name}** (${acc.id}) - Role: ${acc.role} - Status: ${acc.status}`
          ).join('\n')
        };
      }

      return {
        success: true,
        data: accountsWithPermissions
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch ad accounts: ${error.message}`,
        code: 'AD_ACCOUNTS_FETCH_ERROR'
      };
    }
  }

  async handleGetUploadedAssets(args: {
    adAccountId?: string;
    limit?: number;
    type?: string;
  }, userId: string) {
    try {
      const accountId = await this.accountManager.requireAccountSelection(userId, args.adAccountId);
      
      const fields = [
        'id', 'filename', 'original_width', 'original_height', 
        'created_time', 'hash', 'url', 'url_128', 'permalink_url'
      ];

      const params: any = {
        limit: args.limit || 25
      };

      let assets;
      if (args.type === 'image') {
        assets = await new AdAccount(accountId).getAdImages(fields, params);
      } else if (args.type === 'video') {
        assets = await new AdAccount(accountId).getAdVideos(fields, params);
      } else {
        // Get both images and videos
        const [images, videos] = await Promise.all([
          new AdAccount(accountId).getAdImages(fields, params),
          new AdAccount(accountId).getAdVideos(fields, params)
        ]);
        assets = [...images, ...videos];
      }

      // Enhance assets with inline display data for Claude
      const enhancedAssets = await Promise.all(
        assets.map(async (asset) => {
          try {
            // Fetch the actual image data for inline display
            const imageResponse = await fetch(asset.url_128 || asset.url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Data = Buffer.from(imageBuffer).toString('base64');
            const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
            
            return {
              id: asset.id,
              filename: asset.filename,
              type: asset.original_width ? 'image' : 'video',
              dimensions: asset.original_width ? `${asset.original_width}x${asset.original_height}` : null,
              hash: asset.hash,
              url: asset.url,
              thumbnailUrl: asset.url_128,
              createdTime: asset.created_time,
              // Inline display data for Claude
              displayData: {
                dataUri: `data:${mimeType};base64,${base64Data}`,
                alt: `${asset.filename} - ${asset.original_width ? `${asset.original_width}x${asset.original_height}` : 'Video'}`
              }
            };
          } catch (error) {
            // If we can't fetch the image data, return without inline display
            return {
              id: asset.id,
              filename: asset.filename,
              type: asset.original_width ? 'image' : 'video',
              dimensions: asset.original_width ? `${asset.original_width}x${asset.original_height}` : null,
              hash: asset.hash,
              url: asset.url,
              thumbnailUrl: asset.url_128,
              createdTime: asset.created_time,
              displayData: null
            };
          }
        })
      );

      return {
        success: true,
        data: enhancedAssets,
        displayInstructions: 'Assets include inline display data. Images can be shown directly to users for selection.',
        totalCount: enhancedAssets.length
      };
    } catch (error) {
      if (error.message.includes('Multiple ad accounts available')) {
        return {
          success: false,
          requiresAccountSelection: true,
          error: error.message,
          code: 'ACCOUNT_SELECTION_REQUIRED'
        };
      }
      
      return {
        success: false,
        error: `Failed to fetch assets: ${error.message}`,
        code: 'ASSETS_FETCH_ERROR'
      };
    }
  }

  async handleSelectAdAccount(args: { adAccountId: string }, userId: string) {
    try {
      await this.accountManager.selectAccount(userId, args.adAccountId);
      
      return {
        success: true,
        data: { selectedAccountId: args.adAccountId },
        message: `Ad account ${args.adAccountId} selected for subsequent operations.`
      };
    } catch (error) {
      throw new Error(`Failed to select ad account: ${error.message}`);
    }
  }

  async handleGetCampaigns(args: {
    adAccountId?: string;
    limit?: number;
    status?: string;
    fields?: string[];
  }, userId: string) {
    try {
      const accountId = await this.accountManager.requireAccountSelection(userId, args.adAccountId);
      
      const fields = args.fields || [
        Campaign.Fields.id,
        Campaign.Fields.name,
        Campaign.Fields.status,
        Campaign.Fields.objective,
        Campaign.Fields.daily_budget,
        Campaign.Fields.lifetime_budget,
        Campaign.Fields.created_time,
        Campaign.Fields.updated_time,
        Campaign.Fields.start_time,
        Campaign.Fields.stop_time
      ];

      const params: any = {
        limit: args.limit || 25
      };

      if (args.status) {
        params.effective_status = [args.status];
      }

      const campaigns = await new AdAccount(accountId).getCampaigns(fields, params);
      
      return {
        success: true,
        data: campaigns.map(campaign => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          dailyBudget: campaign.daily_budget,
          lifetimeBudget: campaign.lifetime_budget,
          createdTime: campaign.created_time,
          updatedTime: campaign.updated_time,
          startTime: campaign.start_time,
          stopTime: campaign.stop_time
        }))
      };
    } catch (error) {
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }



  // Add handlers for all other tools...
  // (Implementation would continue with all the other tool handlers)
}
```

## Streamable HTTP Transport (`src/mcp/http.ts`)

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export function setupMCPHttpTransport(fastify: FastifyInstance, mcpServer: Server) {
  // Main MCP endpoint for Streamable HTTP transport
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Add session generator if needed
      });
      
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);

      request.raw.on('close', () => {
        console.log('MCP request closed');
        transport.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!reply.sent) {
        reply.status(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Reject non-POST methods for MCP endpoint
  fastify.get('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });

  fastify.delete('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });
}
```

## Fastify + Zod Integration (`src/index.ts`)

```typescript
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import cors from '@fastify/cors';
import { setupMCPHttpTransport } from './mcp/http.js';
import { setupOAuthRoutes } from './auth/oauth.js';
import BambooMCPServer from './mcp/server.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

export function build(opts = {}) {
  const fastify = Fastify({
    logger: true,
    ...opts,
  });

  // Register CORS
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Set up Zod validation
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Health check endpoint with Zod validation
  const HealthResponseSchema = z.object({
    status: z.literal('healthy'),
    timestamp: z.string(),
    version: z.string(),
    database: z.string(),
    mcp: z.string(),
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: HealthResponseSchema,
      },
    },
    handler: async (request, reply) => {
      return {
        status: 'healthy' as const,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        database: 'connected',
        mcp: 'ready',
      };
    },
  });

  // Set up OAuth routes
  setupOAuthRoutes(fastify);

  // Set up MCP server
  const mcpServer = new BambooMCPServer();
  setupMCPHttpTransport(fastify, mcpServer.getServer());

  return fastify;
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const fastify = build();
  
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    console.log(`🚀 Bamboo MCP Server running at ${address}`);
  });
}
```

## Production Configuration Files

### package.json
```json
{
  "name": "bamboo-mcp",
  "version": "0.1.0",
  "description": "MCP server for Meta Ads management via Fastify",
  "main": "dist/index.js",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "mcp:inspect": "npx @modelcontextprotocol/inspector",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.12.3",
    "fastify": "^5.1.0",
    "@fastify/cors": "^10.0.1",
    "fastify-type-provider-zod": "^4.0.1",
    "@supabase/supabase-js": "^2.45.4",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4",
    "facebook-nodejs-business-sdk": "22.0.3",
    "jsonwebtoken": "^9.0.2",
    "pkce-challenge": "^5.0.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "@types/node": "^22.5.4",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/facebook-nodejs-business-sdk": "22.0.0",
    "tsx": "^4.19.2",
    "drizzle-kit": "^0.24.0",
    "vitest": "^2.1.4",
    "@vitest/ui": "^2.1.4",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test/**/*"]
}
```

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
``` 