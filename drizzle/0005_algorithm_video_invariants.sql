-- Drizzle does not model triggers. Keep these invariants alongside the generated schema.
CREATE FUNCTION algorithm_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_decisions_append_only BEFORE UPDATE OR DELETE ON algorithm_decisions
FOR EACH ROW EXECUTE FUNCTION algorithm_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER algorithm_revision_inputs_append_only BEFORE UPDATE OR DELETE ON algorithm_revision_inputs
FOR EACH ROW EXECUTE FUNCTION algorithm_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER generation_playbook_snapshots_append_only BEFORE UPDATE OR DELETE ON generation_playbook_snapshots
FOR EACH ROW EXECUTE FUNCTION algorithm_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER playbook_lesson_sources_append_only BEFORE UPDATE OR DELETE ON playbook_lesson_sources
FOR EACH ROW EXECUTE FUNCTION algorithm_reject_history_change();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'algorithm revisions cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.video_id IS DISTINCT FROM OLD.video_id
     OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.generation_run_id IS DISTINCT FROM OLD.generation_run_id
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.video_kind IS DISTINCT FROM OLD.video_kind THEN
    RAISE EXCEPTION 'revision identity and input snapshot are immutable';
  END IF;
  IF OLD.status <> 'generating' AND NEW.status = 'generating' THEN
    RAISE EXCEPTION 'published revisions cannot return to generating';
  END IF;
  IF OLD.status NOT IN ('generating', 'failed') AND
     (to_jsonb(NEW) - ARRAY['status', 'model', 'input_fingerprint']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'model', 'input_fingerprint']) THEN
    RAISE EXCEPTION 'published revision content is immutable; create a new revision';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_revisions_immutable BEFORE UPDATE OR DELETE ON algorithm_revisions
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_revision();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_design() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'create a new design to change its kind';
  END IF;
  IF OLD.kind = 'algorithm' AND NEW.series_id IS DISTINCT FROM OLD.series_id THEN
    RAISE EXCEPTION 'algorithm series is part of the revision input snapshot';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER videos_kind_immutable BEFORE UPDATE ON videos
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_design();
--> statement-breakpoint
-- The existing content tables remain cartoon-only, even for callers outside the UI.
CREATE FUNCTION algorithm_guard_cartoon_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM videos WHERE id = NEW.video_id AND kind = 'cartoon' FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% requires a cartoon design', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER scripts_cartoon_only BEFORE INSERT OR UPDATE ON scripts
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_cartoon_content();
--> statement-breakpoint
CREATE TRIGGER scenes_cartoon_only BEFORE INSERT OR UPDATE ON scenes
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_cartoon_content();
--> statement-breakpoint
CREATE TRIGGER renders_cartoon_only BEFORE INSERT OR UPDATE ON renders
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_cartoon_content();
--> statement-breakpoint
CREATE TRIGGER uploads_cartoon_only BEFORE INSERT OR UPDATE ON uploads
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_cartoon_content();
--> statement-breakpoint
CREATE TRIGGER asset_proposals_cartoon_only BEFORE INSERT OR UPDATE ON asset_proposals
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_cartoon_content();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_workflow_pointers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stage_name text;
  pointer_name text;
  selected_revision_id uuid;
  selected_output_id uuid;
BEGIN
  FOREACH stage_name IN ARRAY ARRAY['problem', 'solution', 'combo', 'script', 'assets', 'animation'] LOOP
    FOREACH pointer_name IN ARRAY ARRAY['active_' || stage_name || '_id', 'accepted_' || stage_name || '_id'] LOOP
      selected_revision_id := (to_jsonb(NEW) ->> pointer_name)::uuid;
      IF selected_revision_id IS NOT NULL THEN
        PERFORM 1 FROM algorithm_revisions r
          WHERE r.id = selected_revision_id AND r.video_id = NEW.video_id AND r.stage::text = stage_name;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'workflow pointer % has the wrong design or stage', pointer_name;
        END IF;
        IF pointer_name LIKE 'accepted_%' THEN
          PERFORM 1 FROM algorithm_decisions d WHERE d.video_id = NEW.video_id
            AND d.revision_id = selected_revision_id AND d.decision = 'approved';
          IF NOT FOUND THEN
            RAISE EXCEPTION 'accepted pointer % requires an approval decision', pointer_name;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  selected_output_id := NEW.accepted_output_id;
  IF selected_output_id IS NOT NULL THEN
    PERFORM 1 FROM algorithm_decisions d WHERE d.video_id = NEW.video_id
      AND d.output_id = selected_output_id AND d.decision = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'accepted output requires an approval decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_workflows_pointer_guard BEFORE INSERT OR UPDATE ON algorithm_workflows
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_workflow_pointers();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  fingerprint text;
BEGIN
  IF NEW.revision_id IS NOT NULL THEN
    SELECT input_fingerprint INTO fingerprint FROM algorithm_revisions
      WHERE id = NEW.revision_id AND video_id = NEW.video_id;
  ELSE
    SELECT input_fingerprint INTO fingerprint FROM algorithm_outputs
      WHERE id = NEW.output_id AND video_id = NEW.video_id;
  END IF;
  IF fingerprint IS NULL OR fingerprint IS DISTINCT FROM NEW.expected_fingerprint THEN
    RAISE EXCEPTION 'decision fingerprint does not match its target';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_decisions_fingerprint_guard BEFORE INSERT ON algorithm_decisions
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_decision();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_lesson() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'playbook lesson history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'review_reason', 'reviewed_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'review_reason', 'reviewed_at']) THEN
    RAISE EXCEPTION 'lesson content is immutable; create a new version';
  END IF;
  IF OLD.status <> 'proposed' AND NOT (OLD.status = 'approved' AND NEW.status = 'retired') THEN
    RAISE EXCEPTION 'reviewed lesson may only be retired';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER playbook_lessons_immutable BEFORE UPDATE OR DELETE ON playbook_lessons
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_lesson();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_asset_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.asset_id IS NOT NULL THEN
    PERFORM 1 FROM assets a JOIN videos v ON v.series_id = a.series_id
      WHERE a.id = NEW.asset_id AND v.id = NEW.video_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'algorithm asset must belong to the design series';
    END IF;
  END IF;
  IF NEW.status = 'bound' THEN
    PERFORM 1 FROM assets a JOIN asset_variants av ON av.asset_id = a.id
      WHERE a.id = NEW.asset_id AND av.state = NEW.state
        AND a.status = 'approved' AND av.status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'binding requires an approved asset and variant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_asset_requests_binding_guard BEFORE INSERT OR UPDATE ON algorithm_asset_requests
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_asset_binding();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_run_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'generation history cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.video_id IS DISTINCT FROM OLD.video_id
     OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.request_key IS DISTINCT FROM OLD.request_key
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'generation input snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_generation_runs_snapshot_guard BEFORE UPDATE OR DELETE ON algorithm_generation_runs
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_run_snapshot();
--> statement-breakpoint
CREATE FUNCTION algorithm_guard_output_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'output history cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.video_id IS DISTINCT FROM OLD.video_id
     OR NEW.animation_revision_id IS DISTINCT FROM OLD.animation_revision_id
     OR NEW.animation_stage IS DISTINCT FROM OLD.animation_stage
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.renderer_version IS DISTINCT FROM OLD.renderer_version
     OR NEW.asset_manifest IS DISTINCT FROM OLD.asset_manifest
     OR NEW.duration_frames IS DISTINCT FROM OLD.duration_frames
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.file_path IS NOT NULL AND NEW.file_path IS DISTINCT FROM OLD.file_path) THEN
    RAISE EXCEPTION 'output input snapshot and published path are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_outputs_snapshot_guard BEFORE UPDATE OR DELETE ON algorithm_outputs
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_output_snapshot();
