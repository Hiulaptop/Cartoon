CREATE TYPE "public"."proposal_decision" AS ENUM('open', 'approved', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."proposal_kind" AS ENUM('asset', 'variant');--> statement-breakpoint
ALTER TYPE "public"."video_status" ADD VALUE 'casting' BEFORE 'scripting';--> statement-breakpoint
CREATE TABLE "asset_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" "proposal_kind" NOT NULL,
	"asset_id" uuid NOT NULL,
	"state" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"decision" "proposal_decision" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_proposals_video_asset_state" UNIQUE("video_id","asset_id","state")
);
--> statement-breakpoint
ALTER TABLE "asset_proposals" ADD CONSTRAINT "asset_proposals_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;