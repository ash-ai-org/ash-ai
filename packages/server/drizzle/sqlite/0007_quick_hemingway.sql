PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text DEFAULT 'default' NOT NULL,
	`session_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`event_type` text NOT NULL,
	`value` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_usage_events`("id", "tenant_id", "session_id", "agent_name", "event_type", "value", "created_at") SELECT "id", "tenant_id", "session_id", "agent_name", "event_type", "value", "created_at" FROM `usage_events`;--> statement-breakpoint
DROP TABLE `usage_events`;--> statement-breakpoint
ALTER TABLE `__new_usage_events` RENAME TO `usage_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_usage_session` ON `usage_events` (`tenant_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_agent` ON `usage_events` (`tenant_id`,`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_usage_type` ON `usage_events` (`event_type`);--> statement-breakpoint
ALTER TABLE `queue_items` ADD `retry_after` text;