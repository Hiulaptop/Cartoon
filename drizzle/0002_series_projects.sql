-- Xóa dữ liệu thử (spec series-project-design §7, quyết định 5): các cột NOT NULL mới không có giá trị mặc định.
DO $$ BEGIN
  IF to_regclass('pgmq.q_jobs') IS NOT NULL THEN PERFORM pgmq.purge_queue('jobs'); END IF;
  IF to_regclass('langgraph.checkpoints') IS NOT NULL THEN
    TRUNCATE langgraph.checkpoint_writes, langgraph.checkpoint_blobs, langgraph.checkpoints;
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM "uploads";
--> statement-breakpoint
DELETE FROM "renders";
--> statement-breakpoint
DELETE FROM "scenes";
--> statement-breakpoint
DELETE FROM "scripts";
--> statement-breakpoint
DELETE FROM "validations";
--> statement-breakpoint
DELETE FROM "reviews";
--> statement-breakpoint
DELETE FROM "videos";
--> statement-breakpoint
DELETE FROM "asset_variants";
--> statement-breakpoint
DELETE FROM "assets";
--> statement-breakpoint
DELETE FROM "job_runs";
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_name_unique";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "series_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "series_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_sibling_name" ON "projects" USING btree ("parent_id","name") WHERE "projects"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_root_name" ON "projects" USING btree ("name") WHERE "projects"."parent_id" IS NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_series_name" UNIQUE("series_id","name");