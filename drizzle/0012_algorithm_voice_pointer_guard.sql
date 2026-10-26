-- Workflow pointer guard now also validates the voice stage pointers.
CREATE OR REPLACE FUNCTION algorithm_guard_workflow_pointers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stage_name text;
  pointer_name text;
  selected_revision_id uuid;
  selected_output_id uuid;
BEGIN
  FOREACH stage_name IN ARRAY ARRAY['problem', 'solution', 'combo', 'script', 'assets', 'voice', 'animation'] LOOP
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
-- stage = voice được kiểm bằng trigger (so sánh dạng text) thay vì CHECK/DEFAULT enum, vì giá trị enum mới chưa dùng được trong cùng transaction migration.
CREATE FUNCTION algorithm_guard_voice_clip() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM algorithm_revisions r
    WHERE r.id = NEW.voice_revision_id AND r.video_id = NEW.video_id AND r.stage::text = 'voice';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voice clip must belong to a voice revision of the same design';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER algorithm_voice_clips_stage_guard BEFORE INSERT OR UPDATE ON algorithm_voice_clips
FOR EACH ROW EXECUTE FUNCTION algorithm_guard_voice_clip();
