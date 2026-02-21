CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text DEFAULT 'default' NOT NULL,
	`session_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`event_type` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_usage_session` ON `usage_events` (`tenant_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_agent` ON `usage_events` (`tenant_id`,`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_usage_type` ON `usage_events` (`event_type`);