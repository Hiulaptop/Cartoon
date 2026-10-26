-- Generation revisions start with an immutable input snapshot, then publish validated model output.
CREATE OR REPLACE FUNCTION algorithm_guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'algorithm revisions cannot be deleted';
  END IF;

  IF OLD.status IN ('generating', 'failed') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.video_id IS DISTINCT FROM OLD.video_id
       OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
       OR NEW.generation_run_id IS DISTINCT FROM OLD.generation_run_id
       OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.video_kind IS DISTINCT FROM OLD.video_kind THEN
      RAISE EXCEPTION 'revision identity and generation provenance are immutable';
    END IF;
    IF NEW.status = 'generating' AND OLD.status <> 'generating' THEN
      RAISE EXCEPTION 'published revisions cannot return to generating';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.video_id IS DISTINCT FROM OLD.video_id
     OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.generation_run_id IS DISTINCT FROM OLD.generation_run_id
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.video_kind IS DISTINCT FROM OLD.video_kind THEN
    RAISE EXCEPTION 'revision identity and input snapshot are immutable';
  END IF;
  IF OLD.status <> 'generating' AND
     (to_jsonb(NEW) - ARRAY['status', 'model', 'input_fingerprint']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'model', 'input_fingerprint']) THEN
    RAISE EXCEPTION 'published revision content is immutable; create a new revision';
  END IF;
  RETURN NEW;
END;
$$;
