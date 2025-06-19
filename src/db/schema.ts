import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SessionData, TempAuthCodeData } from '../types/auth.js';

// Define application role for authenticated users
export const appUser = pgRole('app_user').existing();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facebookUserId: text('facebook_user_id').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    sessionState: jsonb('session_state').$type<Record<string, unknown>>(),
    accountContext: jsonb('account_context').$type<{
      selectedAccountId?: string;
      availableAccounts?: Array<{
        id: string;
        name: string;
        permissions: string[];
        status: string;
        currency?: string;
      }>;
    }>(),
  },
  (table) => [
    index('users_facebook_user_id_idx').on(table.facebookUserId),
    index('users_jsonb_gin_idx').using('gin', table.sessionState, table.accountContext),

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
  ]
);

export const oauthSessions = pgTable(
  'oauth_sessions',
  {
    state: text('state').primaryKey(),
    sessionData: jsonb('session_data').$type<SessionData>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('oauth_sessions_expires_at_idx').on(table.expiresAt)]
);

export const oauthTempAuthCodes = pgTable(
  'oauth_temp_auth_codes',
  {
    code: text('code').primaryKey(),
    data: jsonb('data').$type<TempAuthCodeData>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('oauth_temp_auth_codes_expires_at_idx').on(table.expiresAt)]
);

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    accessToken: text('access_token').notNull(),
    expiresAt: timestamp('expires_at'),
    scopes: text('scopes').array(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    // Index for efficient user lookups
    index('oauth_tokens_user_id_idx').on(table.userId),
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
  ]
);

export const adAccounts = pgTable(
  'ad_accounts',
  {
    id: text('id').notNull(), // Meta ad account ID (act_xxxx)
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    currency: text('currency'),
    timezone: text('timezone'),
    permissions: text('permissions').array(),
    businessId: text('business_id'), // Business Manager ID (null if not business-managed)
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    // Define a composite primary key to support multiple users per ad account
    primaryKey({ columns: [table.id, table.userId] }),

    // Index for efficient user lookups
    index('ad_accounts_user_id_idx').on(table.userId),

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
  ]
);

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'), // Optional for public clients
    clientName: text('client_name').notNull(),
    redirectUris: text('redirect_uris').array().notNull(),
    grantTypes: text('grant_types').array().notNull().default(['authorization_code']),
    responseTypes: text('response_types').array().notNull().default(['code']),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    // Index for efficient client_id lookups
    index('oauth_clients_client_id_idx').on(table.clientId),
  ]
);

export const oauthRefreshTokens = pgTable(
  'oauth_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(), // Hashed refresh token
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    clientId: text('client_id')
      .references(() => oauthClients.clientId, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'), // To mark token as used/revoked
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('oauth_refresh_tokens_user_id_idx').on(table.userId),
    index('oauth_refresh_tokens_token_idx').on(table.token),
    index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
  ]
);

// Export types for type-safe queries
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;

export type AdAccount = typeof adAccounts.$inferSelect;
export type NewAdAccount = typeof adAccounts.$inferInsert;

export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;

export type OAuthRefreshToken = typeof oauthRefreshTokens.$inferSelect;
export type NewOAuthRefreshToken = typeof oauthRefreshTokens.$inferInsert;

export type OAuthSession = typeof oauthSessions.$inferSelect;
export type NewOAuthSession = typeof oauthSessions.$inferInsert;

export type OAuthTempAuthCode = typeof oauthTempAuthCodes.$inferSelect;
export type NewOAuthTempAuthCode = typeof oauthTempAuthCodes.$inferInsert;

// JSONB field types for type safety
export type UserAccountContext = {
  selectedAccountId?: string;
  availableAccounts?: Array<{
    id: string;
    name: string;
    permissions: string[];
    status: string;
    currency?: string;
  }>;
};

export type UserSessionState = Record<string, unknown>;

// Note: RLS is automatically enabled when policies are defined
// Session variable 'app.current_user_id' is set per connection for user context
