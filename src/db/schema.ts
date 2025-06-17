import { pgTable, uuid, text, timestamp, index, pgPolicy, pgRole } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Define application role for authenticated users
export const appUser = pgRole('app_user');

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  // Index for efficient email lookups
  index('users_email_idx').on(table.email),
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
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  scopes: text('scopes').array(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
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
]);

export const adAccounts = pgTable('ad_accounts', {
  id: text('id').primaryKey(), // Meta ad account ID (act_xxxx)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  currency: text('currency'),
  timezone: text('timezone'),
  permissions: text('permissions').array(), // User's permissions on this account
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
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
]);

// Export types for type-safe queries
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;

export type AdAccount = typeof adAccounts.$inferSelect;
export type NewAdAccount = typeof adAccounts.$inferInsert;

// Note: RLS is automatically enabled when policies are defined
// Session variable 'app.current_user_id' is set per connection for user context 