ALTER TABLE "usage_events" ALTER COLUMN "value" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN "retry_after" text;