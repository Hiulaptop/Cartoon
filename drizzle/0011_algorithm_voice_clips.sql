CREATE TYPE "public"."algorithm_voice_clip_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "algorithm_voice_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"voice_revision_id" uuid NOT NULL,
	"cue_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "algorithm_voice_clip_status" DEFAULT 'generating' NOT NULL,
	"file_path" text,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "algorithm_voice_clips_revision_cue" UNIQUE("voice_revision_id","cue_id"),
	CONSTRAINT "algorithm_voice_clips_fingerprint" CHECK ("algorithm_voice_clips"."fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "algorithm_voice_clips_ready" CHECK ("algorithm_voice_clips"."status" <> 'ready' OR ("algorithm_voice_clips"."file_path" IS NOT NULL AND "algorithm_voice_clips"."duration_ms" IS NOT NULL AND "algorithm_voice_clips"."duration_ms" > 0))
);
--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD COLUMN "active_voice_id" uuid;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD COLUMN "accepted_voice_id" uuid;--> statement-breakpoint
ALTER TABLE "algorithm_voice_clips" ADD CONSTRAINT "algorithm_voice_clips_revision_fk" FOREIGN KEY ("video_id","voice_revision_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "algorithm_voice_clips_fingerprint" ON "algorithm_voice_clips" USING btree ("video_id","fingerprint");--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_active_voice_fk" FOREIGN KEY ("video_id","active_voice_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_workflows" ADD CONSTRAINT "algorithm_workflows_accepted_voice_fk" FOREIGN KEY ("video_id","accepted_voice_id") REFERENCES "public"."algorithm_revisions"("video_id","id") ON DELETE restrict ON UPDATE no action;