CREATE TABLE "oauth_sessions" (
	"state" text PRIMARY KEY NOT NULL,
	"session_data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_temp_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_state" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_context" jsonb;--> statement-breakpoint
CREATE INDEX "oauth_sessions_expires_at_idx" ON "oauth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_temp_auth_codes_expires_at_idx" ON "oauth_temp_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_jsonb_gin_idx" ON "users" USING gin ("session_state","account_context");