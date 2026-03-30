CREATE TABLE public.search_index_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('embed_stale_documents')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.search_index_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view search index jobs"
  ON public.search_index_jobs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_search_index_jobs_updated_at
BEFORE UPDATE ON public.search_index_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX search_index_jobs_pending_embed_idx
  ON public.search_index_jobs (job_type)
  WHERE job_type = 'embed_stale_documents'
    AND status IN ('pending', 'processing');

CREATE INDEX search_index_jobs_status_created_idx
  ON public.search_index_jobs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.enqueue_search_index_job(
  _job_type text DEFAULT 'embed_stale_documents',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_job_id uuid;
  inserted_job_id uuid;
BEGIN
  IF _job_type <> 'embed_stale_documents' THEN
    RAISE EXCEPTION 'Unsupported search index job type: %', _job_type;
  END IF;

  SELECT id
  INTO existing_job_id
  FROM public.search_index_jobs
  WHERE job_type = _job_type
    AND status IN ('pending', 'processing')
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    RETURN existing_job_id;
  END IF;

  INSERT INTO public.search_index_jobs (
    job_type,
    status,
    requested_by,
    metadata
  )
  VALUES (
    _job_type,
    'pending',
    auth.uid(),
    coalesce(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO inserted_job_id;

  RETURN inserted_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_search_index_entity(
  _entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  definition_row record;
  ontology_row record;
  synced_count integer := 0;
  job_id uuid;
BEGIN
  SELECT id, ontology_id, coalesce(is_deleted, false) AS is_deleted
  INTO definition_row
  FROM public.definitions
  WHERE id = _entity_id;

  IF FOUND THEN
    IF definition_row.is_deleted THEN
      synced_count := public.delete_search_documents_for_entity('definition', _entity_id);
    ELSE
      synced_count := public.sync_search_documents_for_definition(_entity_id);
    END IF;

    IF definition_row.ontology_id IS NOT NULL THEN
      PERFORM public.sync_search_documents_for_ontology(definition_row.ontology_id, false);
    END IF;

    job_id := public.enqueue_search_index_job(
      'embed_stale_documents',
      jsonb_build_object(
        'reason', 'sync_entity',
        'entityId', _entity_id,
        'entityType', 'definition'
      )
    );

    RETURN jsonb_build_object(
      'entityId', _entity_id,
      'entityType', 'definition',
      'syncedCount', synced_count,
      'jobId', job_id
    );
  END IF;

  SELECT id
  INTO ontology_row
  FROM public.ontologies
  WHERE id = _entity_id;

  IF FOUND THEN
    synced_count := public.sync_search_documents_for_ontology(_entity_id, true);
    job_id := public.enqueue_search_index_job(
      'embed_stale_documents',
      jsonb_build_object(
        'reason', 'sync_entity',
        'entityId', _entity_id,
        'entityType', 'ontology'
      )
    );

    RETURN jsonb_build_object(
      'entityId', _entity_id,
      'entityType', 'ontology',
      'syncedCount', synced_count,
      'jobId', job_id
    );
  END IF;

  RAISE EXCEPTION 'Search index source entity not found: %', _entity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_search_index_ontology_subtree(
  _ontology_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  synced_count integer := 0;
  job_id uuid;
BEGIN
  synced_count := public.sync_search_documents_for_ontology(_ontology_id, true);
  job_id := public.enqueue_search_index_job(
    'embed_stale_documents',
    jsonb_build_object(
      'reason', 'sync_ontology_subtree',
      'ontologyId', _ontology_id
    )
  );

  RETURN jsonb_build_object(
    'ontologyId', _ontology_id,
    'syncedCount', synced_count,
    'jobId', job_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_search_index_job(
  _job_type text DEFAULT 'embed_stale_documents',
  _worker_id text DEFAULT 'search-index-worker'
)
RETURNS TABLE (
  id uuid,
  job_type text,
  metadata jsonb,
  attempts integer
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT job.id
    FROM public.search_index_jobs AS job
    WHERE job.job_type = _job_type
      AND job.status = 'pending'
    ORDER BY job.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.search_index_jobs AS job
    SET
      status = 'processing',
      attempts = job.attempts + 1,
      locked_by = _worker_id,
      started_at = now(),
      completed_at = NULL,
      last_error = NULL
    WHERE job.id IN (SELECT next_job.id FROM next_job)
    RETURNING job.id, job.job_type, job.metadata, job.attempts
  )
  SELECT claimed.id, claimed.job_type, claimed.metadata, claimed.attempts
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_search_index_job(
  _job_id uuid,
  _status text DEFAULT 'completed',
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.search_index_jobs
  SET
    status = _status,
    completed_at = now(),
    last_error = _error,
    locked_by = NULL
  WHERE id = _job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_stale_search_documents(
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  search_text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.search_text
  FROM public.search_documents AS d
  WHERE nullif(btrim(coalesce(d.search_text, '')), '') IS NOT NULL
    AND d.embedding IS NULL
  ORDER BY d.updated_at ASC, d.created_at ASC
  LIMIT greatest(coalesce(_limit, 100), 1)
$$;

CREATE OR REPLACE FUNCTION public.handle_definition_search_document_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_search_documents_for_entity('definition', OLD.id);

    IF OLD.ontology_id IS NOT NULL THEN
      PERFORM public.sync_search_documents_for_ontology(OLD.ontology_id, false);
      PERFORM public.enqueue_search_index_job(
        'embed_stale_documents',
        jsonb_build_object(
          'reason', 'definition_deleted',
          'definitionId', OLD.id,
          'ontologyId', OLD.ontology_id
        )
      );
    END IF;

    RETURN OLD;
  END IF;

  PERFORM public.sync_search_index_entity(NEW.id);

  IF TG_OP = 'UPDATE' AND OLD.ontology_id IS DISTINCT FROM NEW.ontology_id AND OLD.ontology_id IS NOT NULL THEN
    PERFORM public.sync_search_documents_for_ontology(OLD.ontology_id, false);
    PERFORM public.enqueue_search_index_job(
      'embed_stale_documents',
      jsonb_build_object(
        'reason', 'definition_moved',
        'definitionId', NEW.id,
        'oldOntologyId', OLD.ontology_id,
        'newOntologyId', NEW.ontology_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ontology_search_document_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_search_documents_for_entity('ontology', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_search_index_ontology_subtree(NEW.id);
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_search_index_job(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) TO authenticated;
