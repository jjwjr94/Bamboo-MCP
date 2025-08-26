CREATE TABLE "creative_asset_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"filename" text NOT NULL,
	"asset_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"meta_asset_id" text,
	"error_message" text,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_asset_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "creative_asset_uploads" ADD CONSTRAINT "creative_asset_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_asset_uploads_user_id_idx" ON "creative_asset_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creative_asset_uploads_status_idx" ON "creative_asset_uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creative_asset_uploads_created_at_idx" ON "creative_asset_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "uploads_select_own" ON "creative_asset_uploads" AS PERMISSIVE FOR SELECT TO "app_user" USING ("creative_asset_uploads"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "uploads_insert_own" ON "creative_asset_uploads" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("creative_asset_uploads"."user_id" = current_setting('app.current_user_id')::uuid);--> statement-breakpoint
CREATE POLICY "uploads_update_own" ON "creative_asset_uploads" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("creative_asset_uploads"."user_id" = current_setting('app.current_user_id')::uuid) WITH CHECK ("creative_asset_uploads"."user_id" = current_setting('app.current_user_id')::uuid);