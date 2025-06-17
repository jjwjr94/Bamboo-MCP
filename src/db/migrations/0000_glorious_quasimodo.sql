CREATE TABLE "ad_accounts" (
	"id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"currency" text,
	"timezone" text,
	"permissions" text[],
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ad_accounts_id_user_id_pk" PRIMARY KEY("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"scopes" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_tokens_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_accounts_user_id_idx" ON "ad_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_id_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
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