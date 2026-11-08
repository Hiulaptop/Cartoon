ALTER TYPE "public"."target_type" ADD VALUE 'automation_video' BEFORE 'audio_take';--> statement-breakpoint
CREATE TABLE "automation_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"manifest" jsonb NOT NULL,
	"hash" text,
	"input_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_output_owner" UNIQUE("video_id","id"),
	CONSTRAINT "automation_output_kind" CHECK ("automation_outputs"."kind" IN ('preview','audio','render','package')),
	CONSTRAINT "automation_output_status" CHECK ("automation_outputs"."status" IN ('generating','ready','stale','failed'))
);
--> statement-breakpoint
CREATE TABLE "automation_profiles" (
	"key" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_profile_singleton" CHECK ("automation_profiles"."key" = 1)
);
--> statement-breakpoint
CREATE TABLE "automation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"gate" integer NOT NULL,
	"revision_id" uuid,
	"output_id" uuid,
	"subject_hash" text NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_review_subject" CHECK (("automation_reviews"."gate" IN (1,2) AND "automation_reviews"."revision_id" IS NOT NULL AND "automation_reviews"."output_id" IS NULL) OR ("automation_reviews"."gate" = 3 AND "automation_reviews"."output_id" IS NOT NULL AND "automation_reviews"."revision_id" IS NULL)),
	CONSTRAINT "automation_review_decision" CHECK ("automation_reviews"."decision" IN ('approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "automation_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"sequence" integer NOT NULL,
	"parent_id" uuid,
	"content" jsonb NOT NULL,
	"hash" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_revision_owner" UNIQUE("video_id","id"),
	CONSTRAINT "automation_revision_sequence" UNIQUE("video_id","kind","sequence"),
	CONSTRAINT "automation_revision_sequence_positive" CHECK ("automation_revisions"."sequence" > 0),
	CONSTRAINT "automation_revision_kind" CHECK ("automation_revisions"."kind" IN ('research','storyboard'))
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"job_run_id" uuid,
	"stage" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"request_key" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"operations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permit" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_run_stage" CHECK ("automation_runs"."stage" IN ('research','storyboard','preview','audio','render','package')),
	CONSTRAINT "automation_run_status" CHECK ("automation_runs"."status" IN ('queued','running','succeeded','stale','blocked','failed'))
);
--> statement-breakpoint
CREATE TABLE "automation_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"hash" text NOT NULL,
	"file_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief" jsonb NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"lock_version" integer DEFAULT 1 NOT NULL,
	"stage" text DEFAULT 'brief' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"research_id" uuid,
	"storyboard_id" uuid,
	"preview_id" uuid,
	"output_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"error" text,
	"work_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_video_stage" CHECK ("automation_videos"."stage" IN ('brief','research','storyboard','production','final','complete')),
	CONSTRAINT "automation_video_state" CHECK ("automation_videos"."state" IN ('draft','queued','running','waiting_review','blocked','failed','idle'))
);
--> statement-breakpoint
ALTER TABLE "automation_outputs" ADD CONSTRAINT "automation_outputs_video_id_automation_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."automation_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reviews" ADD CONSTRAINT "automation_reviews_video_id_automation_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."automation_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reviews" ADD CONSTRAINT "automation_reviews_video_id_revision_id_automation_revisions_video_id_id_fk" FOREIGN KEY ("video_id","revision_id") REFERENCES "public"."automation_revisions"("video_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reviews" ADD CONSTRAINT "automation_reviews_video_id_output_id_automation_outputs_video_id_id_fk" FOREIGN KEY ("video_id","output_id") REFERENCES "public"."automation_outputs"("video_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_revisions" ADD CONSTRAINT "automation_revisions_video_id_automation_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."automation_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_video_id_automation_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."automation_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_sources" ADD CONSTRAINT "automation_sources_video_id_automation_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."automation_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_active_request" ON "automation_runs" USING btree ("video_id","request_key") WHERE "automation_runs"."status" IN ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "automation_one_active_run" ON "automation_runs" USING btree ("video_id") WHERE "automation_runs"."status" IN ('queued','running');