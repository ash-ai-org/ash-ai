CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text DEFAULT 'default' NOT NULL,
	`message_id` text NOT NULL,
	`session_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_path` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_session` ON `attachments` (`tenant_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_message` ON `attachments` (`message_id`);