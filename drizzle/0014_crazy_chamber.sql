ALTER TYPE "public"."target_type" ADD VALUE 'audio_take' BEFORE 'asset';--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'voiceover_timeline' BEFORE 'asset';--> statement-breakpoint
CREATE TABLE "audio_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"label" text NOT NULL,
	"speaker_ref" text,
	"text" text,
	"model_metadata" jsonb,
	"file_path" text,
	"sha256" text,
	"bytes" bigint,
	"duration_seconds" double precision,
	"sample_rate" integer,
	"channels" integer,
	"codec" text,
	"request_id" uuid NOT NULL,
	"synthesis_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_takes_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "audio_takes_source" CHECK ("audio_takes"."source" IN ('upload','tts')),
	CONSTRAINT "audio_takes_tts_input" CHECK ("audio_takes"."source" <> 'tts' OR ("audio_takes"."text" IS NOT NULL AND char_length("audio_takes"."text") BETWEEN 1 AND 5000 AND "audio_takes"."model_metadata" IS NOT NULL)),
	CONSTRAINT "audio_takes_ready" CHECK ("audio_takes"."status" NOT IN ('pending_review','approved') OR ("audio_takes"."file_path" IS NOT NULL AND "audio_takes"."sha256" ~ '^[a-f0-9]{64}$' AND "audio_takes"."bytes" > 0 AND "audio_takes"."bytes" <= 26214400 AND "audio_takes"."duration_seconds" > 0 AND "audio_takes"."duration_seconds" <= 600 AND "audio_takes"."sample_rate" > 0 AND "audio_takes"."channels" > 0 AND "audio_takes"."codec" IS NOT NULL AND "audio_takes"."sha256" IS NOT NULL AND "audio_takes"."bytes" IS NOT NULL AND "audio_takes"."duration_seconds" IS NOT NULL AND "audio_takes"."sample_rate" IS NOT NULL AND "audio_takes"."channels" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "voiceover_timelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"visual_fingerprint" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voiceover_timelines_video_version" UNIQUE("video_id","version"),
	CONSTRAINT "voiceover_timelines_version" CHECK ("voiceover_timelines"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "asset_variants" ADD COLUMN "source_width" integer;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD COLUMN "source_height" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "generation_size" text;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "voiceover_timeline_id" uuid;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "voiceover_snapshot_hash" text;--> statement-breakpoint
ALTER TABLE "audio_takes" ADD CONSTRAINT "audio_takes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voiceover_timelines" ADD CONSTRAINT "voiceover_timelines_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_takes_video" ON "audio_takes" USING btree ("video_id");--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_voiceover_timeline_id_voiceover_timelines_id_fk" FOREIGN KEY ("voiceover_timeline_id") REFERENCES "public"."voiceover_timelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_source_size_valid" CHECK (("asset_variants"."source_width" IS NULL AND "asset_variants"."source_height" IS NULL) OR ("asset_variants"."source_width" IS NOT NULL AND "asset_variants"."source_height" IS NOT NULL AND "asset_variants"."source_width" > 0 AND "asset_variants"."source_height" > 0));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_generation_size_allowed" CHECK ("assets"."generation_size" IS NULL OR "assets"."generation_size" IN ('1024x1024', '1920x1080', '1080x1920', '1536x1024', '1024x1536'));