CREATE ROLE "app_user";--> statement-breakpoint
ALTER TABLE "ad_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ad_accounts_select_own" ON "ad_accounts" AS PERMISSIVE FOR SELECT TO "app_user" USING ("ad_accounts"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "ad_accounts_insert_own" ON "ad_accounts" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("ad_accounts"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "ad_accounts_update_own" ON "ad_accounts" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("ad_accounts"."user_id" = current_setting('app.current_user_id')::uuid) WITH CHECK ("ad_accounts"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "ad_accounts_delete_own" ON "ad_accounts" AS PERMISSIVE FOR DELETE TO "app_user" USING ("ad_accounts"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "tokens_select_own" ON "oauth_tokens" AS PERMISSIVE FOR SELECT TO "app_user" USING ("oauth_tokens"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "tokens_insert_own" ON "oauth_tokens" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("oauth_tokens"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "tokens_update_own" ON "oauth_tokens" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("oauth_tokens"."user_id" = current_setting('app.current_user_id')::uuid) WITH CHECK ("oauth_tokens"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "tokens_delete_own" ON "oauth_tokens" AS PERMISSIVE FOR DELETE TO "app_user" USING ("oauth_tokens"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "users_select_own" ON "users" AS PERMISSIVE FOR SELECT TO "app_user" USING ("users"."id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("users"."id" = current_setting('app.current_user_id')::uuid) WITH CHECK ("users"."id" = current_setting('app.current_user_id')::uuid);