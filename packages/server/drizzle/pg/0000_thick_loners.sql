CREATE TABLE IF NOT EXISTS "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"path" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sequence" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sandboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"session_id" text,
	"agent_name" text NOT NULL,
	"state" text DEFAULT 'warming' NOT NULL,
	"workspace_dir" text NOT NULL,
	"created_at" text NOT NULL,
	"last_used_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"data" text,
	"sequence" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"agent_name" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"runner_id" text,
	"created_at" text NOT NULL,
	"last_active_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_agents_tenant_name" ON "agents" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agents_tenant" ON "agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_tenant" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_messages_unique_seq" ON "messages" USING btree ("tenant_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_session" ON "messages" USING btree ("tenant_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sandboxes_state" ON "sandboxes" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sandboxes_session" ON "sandboxes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sandboxes_last_used" ON "sandboxes" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sandboxes_tenant" ON "sandboxes" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_session_events_unique_seq" ON "session_events" USING btree ("tenant_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_events_session" ON "session_events" USING btree ("tenant_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_events_type" ON "session_events" USING btree ("tenant_id","session_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_tenant" ON "sessions" USING btree ("tenant_id");