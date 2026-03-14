CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"agent_name" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"system_prompt" text,
	"release_notes" text,
	"is_active" integer DEFAULT 0 NOT NULL,
	"knowledge_files" text,
	"created_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"agent_name" text NOT NULL,
	"question" text NOT NULL,
	"expected_topics" text,
	"expected_not_topics" text,
	"reference_answer" text,
	"category" text,
	"tags" text,
	"chat_history" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"eval_run_id" text NOT NULL,
	"eval_case_id" text NOT NULL,
	"agent_response" text,
	"topic_score" real,
	"safety_score" real,
	"llm_judge_score" real,
	"latency_ms" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"human_score" real,
	"human_notes" text,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"agent_name" text NOT NULL,
	"version_number" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"completed_cases" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"filters" text,
	"created_at" text NOT NULL,
	"started_at" text,
	"completed_at" text
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "active_version_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_versions_unique" ON "agent_versions" USING btree ("tenant_id","agent_name","version_number");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_active" ON "agent_versions" USING btree ("tenant_id","agent_name","is_active");--> statement-breakpoint
CREATE INDEX "idx_eval_cases_agent" ON "eval_cases" USING btree ("tenant_id","agent_name");--> statement-breakpoint
CREATE INDEX "idx_eval_cases_category" ON "eval_cases" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_eval_results_run" ON "eval_results" USING btree ("eval_run_id");--> statement-breakpoint
CREATE INDEX "idx_eval_results_case" ON "eval_results" USING btree ("eval_case_id");--> statement-breakpoint
CREATE INDEX "idx_eval_runs_agent" ON "eval_runs" USING btree ("tenant_id","agent_name");--> statement-breakpoint
CREATE INDEX "idx_eval_runs_status" ON "eval_runs" USING btree ("status");