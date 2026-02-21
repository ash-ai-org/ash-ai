CREATE TABLE `runners` (
	`id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`max_sandboxes` integer DEFAULT 100 NOT NULL,
	`active_count` integer DEFAULT 0 NOT NULL,
	`warming_count` integer DEFAULT 0 NOT NULL,
	`last_heartbeat_at` text NOT NULL,
	`registered_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_runners_heartbeat` ON `runners` (`last_heartbeat_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_runner` ON `sessions` (`runner_id`);