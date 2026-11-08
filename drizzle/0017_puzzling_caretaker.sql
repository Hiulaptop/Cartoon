CREATE TABLE "comfy_image_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_run_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"prompt_id" text,
	"raw_artifact" jsonb,
	"processed_artifact" jsonb,
	"error" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "comfy_image_runs_job_run_id_unique" UNIQUE("job_run_id"),
	CONSTRAINT "comfy_image_run_state" CHECK ("comfy_image_runs"."state" IN ('prepared','submitting','submitted','succeeded','failed','uncertain','abandoned','stale'))
);
--> statement-breakpoint
ALTER TABLE "comfy_image_runs" ADD CONSTRAINT "comfy_image_runs_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comfy_image_runs" ADD CONSTRAINT "comfy_image_runs_variant_id_asset_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."asset_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comfy_image_run_variant_created" ON "comfy_image_runs" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comfy_image_run_active_variant" ON "comfy_image_runs" USING btree ("variant_id") WHERE "comfy_image_runs"."state" IN ('prepared','submitting','submitted','uncertain');