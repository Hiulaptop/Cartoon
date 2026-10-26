CREATE TYPE "public"."algorithm_asset_status" AS ENUM('open', 'generating', 'pending_review', 'bound', 'dropped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."algorithm_run_status" AS ENUM('queued', 'running', 'waiting_review', 'succeeded', 'failed', 'stale');--> statement-breakpoint
CREATE TYPE "public"."algorithm_source" AS ENUM('human', 'llm');--> statement-breakpoint
CREATE TYPE "public"."algorithm_stage" AS ENUM('problem', 'solution', 'combo', 'script', 'assets', 'animation', 'render', 'done');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('proposed', 'approved', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."video_kind" AS ENUM('cartoon', 'algorithm');--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'algorithm_workflow';--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'algorithm_revision';--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'algorithm_output';--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'algorithm_generation_run';--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'playbook_lesson';--> statement-breakpoint
CREATE TABLE "algorithm_asset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"script_revision_id" uuid NOT NULL,
	"script_stage" "algorithm_stage" DEFAULT 'script' NOT NULL,
	"temporary_key" text NOT NULL,
	"brief" text NOT NULL,
	"status" "algorithm_asset_status" DEFAULT 'open' NOT NULL,
	"asset_id" uuid,
	"state" text,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_asset_requests_script_key" UNIQUE("script_revision_id","temporary_key"),
	CONSTRAINT "algorithm_asset_requests_script_stage" CHECK ("algorithm_asset_requests"."script_stage" = 'script'),
	CONSTRAINT "algorithm_asset_requests_binding" CHECK ("algorithm_asset_requests"."status" <> 'bound' OR ("algorithm_asset_requests"."asset_id" IS NOT NULL AND "algorithm_asset_requests"."state" IS NOT NULL)),
	CONSTRAINT "algorithm_asset_requests_drop_reason" CHECK ("algorithm_asset_requests"."status" <> 'dropped' OR length(trim("algorithm_asset_requests"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "algorithm_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"revision_id" uuid,
	"output_id" uuid,
	"decision" "review_decision" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"expected_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_decisions_revision" UNIQUE("revision_id"),
	CONSTRAINT "algorithm_decisions_output" UNIQUE("output_id"),
	CONSTRAINT "algorithm_decisions_target" CHECK (("algorithm_decisions"."revision_id" IS NOT NULL) <> ("algorithm_decisions"."output_id" IS NOT NULL)),
	CONSTRAINT "algorithm_decisions_reject_reason" CHECK ("algorithm_decisions"."decision" <> 'rejected' OR length(trim("algorithm_decisions"."reason")) > 0),
	CONSTRAINT "algorithm_decisions_fingerprint" CHECK ("algorithm_decisions"."expected_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "algorithm_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"stage" "algorithm_stage" NOT NULL,
	"thread_id" text NOT NULL,
	"request_key" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"status" "algorithm_run_status" DEFAULT 'queued' NOT NULL,
	"interrupt_id" text,
	"job_run_id" uuid,
	"model" text,
	"prompt_version" text,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_generation_runs_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "algorithm_generation_runs_video_id" UNIQUE("video_id","id"),
	CONSTRAINT "algorithm_generation_runs_fingerprint" CHECK ("algorithm_generation_runs"."input_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "algorithm_generation_runs_stage" CHECK ("algorithm_generation_runs"."stage" NOT IN ('problem', 'done'))
);
--> statement-breakpoint
CREATE TABLE "algorithm_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"animation_revision_id" uuid NOT NULL,
	"animation_stage" "algorithm_stage" DEFAULT 'animation' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"renderer_version" text NOT NULL,
	"asset_manifest" jsonb NOT NULL,
	"file_path" text,
	"duration_frames" integer NOT NULL,
	"status" "review_status" DEFAULT 'generating' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_outputs_file_path_unique" UNIQUE("file_path"),
	CONSTRAINT "algorithm_outputs_video_id" UNIQUE("video_id","id"),
	CONSTRAINT "algorithm_outputs_animation_stage" CHECK ("algorithm_outputs"."animation_stage" = 'animation'),
	CONSTRAINT "algorithm_outputs_frames" CHECK ("algorithm_outputs"."duration_frames" BETWEEN 1 AND 5400),
	CONSTRAINT "algorithm_outputs_fingerprint" CHECK ("algorithm_outputs"."input_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "algorithm_revision_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"input_revision_id" uuid NOT NULL,
	CONSTRAINT "algorithm_revision_inputs_edge" UNIQUE("revision_id","input_revision_id"),
	CONSTRAINT "algorithm_revision_inputs_not_self" CHECK ("algorithm_revision_inputs"."revision_id" <> "algorithm_revision_inputs"."input_revision_id")
);
--> statement-breakpoint
CREATE TABLE "algorithm_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"video_kind" "video_kind" DEFAULT 'algorithm' NOT NULL,
	"stage" "algorithm_stage" NOT NULL,
	"version" integer NOT NULL,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"source" "algorithm_source" NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"model" text,
	"prompt_version" text,
	"generation_run_id" uuid,
	"input_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_revisions_video_stage_version" UNIQUE("video_id","stage","version"),
	CONSTRAINT "algorithm_revisions_video_id" UNIQUE("video_id","id"),
	CONSTRAINT "algorithm_revisions_video_stage_id" UNIQUE("video_id","stage","id"),
	CONSTRAINT "algorithm_revisions_kind" CHECK ("algorithm_revisions"."video_kind" = 'algorithm'),
	CONSTRAINT "algorithm_revisions_stage" CHECK ("algorithm_revisions"."stage" NOT IN ('render', 'done')),
	CONSTRAINT "algorithm_revisions_versions" CHECK ("algorithm_revisions"."version" > 0 AND "algorithm_revisions"."contract_version" > 0),
	CONSTRAINT "algorithm_revisions_fingerprint" CHECK ("algorithm_revisions"."input_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "algorithm_workflows" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"video_kind" "video_kind" DEFAULT 'algorithm' NOT NULL,
	"stage" "algorithm_stage" DEFAULT 'problem' NOT NULL,
	"concurrency_version" integer DEFAULT 1 NOT NULL,
	"active_problem_id" uuid,
	"accepted_problem_id" uuid,
	"active_solution_id" uuid,
	"accepted_solution_id" uuid,
	"active_combo_id" uuid,
	"accepted_combo_id" uuid,
	"active_script_id" uuid,
	"accepted_script_id" uuid,
	"active_assets_id" uuid,
	"accepted_assets_id" uuid,
	"active_animation_id" uuid,
	"accepted_animation_id" uuid,
	"active_output_id" uuid,
	"accepted_output_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_workflows_kind" CHECK ("algorithm_workflows"."video_kind" = 'algorithm'),
	CONSTRAINT "algorithm_workflows_version" CHECK ("algorithm_workflows"."concurrency_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "generation_playbook_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_playbook_snapshots_run_lesson" UNIQUE("generation_run_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "playbook_lesson_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"revision_id" uuid,
	"decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_lesson_sources_target" CHECK ("playbook_lesson_sources"."revision_id" IS NOT NULL OR "playbook_lesson_sources"."decision_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "playbook_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"stage" "algorithm_stage" NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"series_id" uuid,
	"content" jsonb NOT NULL,
	"status" "lesson_status" DEFAULT 'proposed' NOT NULL,
	"review_reason" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_lessons_key_version" UNIQUE("lesson_key","version"),
	CONSTRAINT "playbook_lessons_version" CHECK ("playbook_lessons"."version" > 0),
	CONSTRAINT "playbook_lessons_stage" CHECK ("playbook_lessons"."stage" NOT IN ('problem', 'done')),
	CONSTRAINT "playbook_lessons_review" CHECK ("playbook_lessons"."status" = 'proposed' OR "playbook_lessons"."reviewed_at" IS NOT NULL),
	CONSTRAINT "playbook_lessons_reject_reason" CHECK ("playbook_lessons"."status" <> 'rejected' OR length(trim("playbook_lessons"."review_reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
-- DEFAULT backfills existing designs as cartoon; create the referenced key before child FKs.
ALTER TABLE "videos" ADD COLUMN "kind" "video_kind" DEFAULT 'cartoon' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_id_kind" UNIQUE("id","kind");--> statement-breakpoint
ALTER TABLE "algorithm_asset_requests" ADD CONSTRAINT "algorithm_asset_requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_asset_requests" ADD CONSTRAINT "algorithm_asset_requests_script_fk" FOREIGN KEY ("video_id","script_stage","script_revision_id") REFERENCES "public"."algorithm_revisions"("video_id","stage","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_asset_requests" ADD CONSTRAINT "algorithm_asset_requests_variant_fk" FOREIGN KEY ("asset_id","state") REFERENCES "public"."asset_variants"("asset_id","state") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_decisions" ADD CONSTRAINT "algorithm_decisions_video_id_algorithm_workflows_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."algorithm_workflows"("video_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_decisions" ADD CONSTRAINT "algorithm_decisions_revision_fk" FOREIGN KEY ("video_id","revision_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_decisions" ADD CONSTRAINT "algorithm_decisions_output_fk" FOREIGN KEY ("video_id","output_id") REFERENCES "public"."algorithm_outputs"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_generation_runs" ADD CONSTRAINT "algorithm_generation_runs_video_id_algorithm_workflows_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."algorithm_workflows"("video_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_generation_runs" ADD CONSTRAINT "algorithm_generation_runs_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_outputs" ADD CONSTRAINT "algorithm_outputs_animation_fk" FOREIGN KEY ("video_id","animation_stage","animation_revision_id") REFERENCES "public"."algorithm_revisions"("video_id","stage","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_revision_inputs" ADD CONSTRAINT "algorithm_revision_inputs_output_fk" FOREIGN KEY ("video_id","revision_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_revision_inputs" ADD CONSTRAINT "algorithm_revision_inputs_input_fk" FOREIGN KEY ("video_id","input_revision_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_revisions" ADD CONSTRAINT "algorithm_revisions_video_kind_fk" FOREIGN KEY ("video_id","video_kind") REFERENCES "public"."videos"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_revisions" ADD CONSTRAINT "algorithm_revisions_generation_fk" FOREIGN KEY ("video_id","generation_run_id") REFERENCES "public"."algorithm_generation_runs"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_video_kind_fk" FOREIGN KEY ("video_id","video_kind") REFERENCES "public"."videos"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_output_fk" FOREIGN KEY ("video_id","active_output_id") REFERENCES "public"."algorithm_outputs"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_output_fk" FOREIGN KEY ("video_id","accepted_output_id") REFERENCES "public"."algorithm_outputs"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_problem_fk" FOREIGN KEY ("video_id","active_problem_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_problem_fk" FOREIGN KEY ("video_id","accepted_problem_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_solution_fk" FOREIGN KEY ("video_id","active_solution_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_solution_fk" FOREIGN KEY ("video_id","accepted_solution_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_combo_fk" FOREIGN KEY ("video_id","active_combo_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_combo_fk" FOREIGN KEY ("video_id","accepted_combo_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_script_fk" FOREIGN KEY ("video_id","active_script_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_script_fk" FOREIGN KEY ("video_id","accepted_script_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_assets_fk" FOREIGN KEY ("video_id","active_assets_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_assets_fk" FOREIGN KEY ("video_id","accepted_assets_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_animation_fk" FOREIGN KEY ("video_id","active_animation_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_animation_fk" FOREIGN KEY ("video_id","accepted_animation_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_playbook_snapshots" ADD CONSTRAINT "generation_playbook_snapshots_generation_run_id_algorithm_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."algorithm_generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_playbook_snapshots" ADD CONSTRAINT "generation_playbook_snapshots_lesson_id_playbook_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."playbook_lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lesson_sources" ADD CONSTRAINT "playbook_lesson_sources_lesson_id_playbook_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."playbook_lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lesson_sources" ADD CONSTRAINT "playbook_lesson_sources_revision_id_algorithm_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."algorithm_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lesson_sources" ADD CONSTRAINT "playbook_lesson_sources_decision_id_algorithm_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."algorithm_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lessons" ADD CONSTRAINT "playbook_lessons_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "algorithm_generation_runs_status" ON "algorithm_generation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playbook_lessons_selection" ON "playbook_lessons" USING btree ("stage","status","series_id");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_kind_status" CHECK (("videos"."kind" = 'cartoon' AND "videos"."status" IS NOT NULL) OR ("videos"."kind" = 'algorithm' AND "videos"."status" IS NULL));