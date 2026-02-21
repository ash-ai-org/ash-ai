CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"type" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"last_used_at" text
);
--> statement-breakpoint
CREATE INDEX "idx_credentials_tenant" ON "credentials" USING btree ("tenant_id");