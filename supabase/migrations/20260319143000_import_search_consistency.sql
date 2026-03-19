ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_target_check
  CHECK (num_nonnulls(definition_id, ontology_id) = 1);

DELETE FROM public.search_history older
USING public.search_history newer
WHERE older.user_id = newer.user_id
  AND lower(btrim(older.query)) = lower(btrim(newer.query))
  AND (
    older.created_at < newer.created_at
    OR (older.created_at = newer.created_at AND older.id < newer.id)
  );

CREATE UNIQUE INDEX search_history_user_query_normalized_idx
  ON public.search_history (user_id, lower(btrim(query)));

CREATE OR REPLACE FUNCTION public.save_search_history(
  _query text,
  _filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  inserted_row jsonb;
  normalized_query text := lower(btrim(coalesce(_query, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF normalized_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  DELETE FROM public.search_history
  WHERE user_id = auth.uid()
    AND lower(btrim(query)) = normalized_query;

  WITH inserted AS (
    INSERT INTO public.search_history (user_id, query, filters)
    VALUES (auth.uid(), btrim(_query), coalesce(_filters, '{}'::jsonb))
    RETURNING id, user_id, query, filters, created_at
  )
  SELECT to_jsonb(inserted.*) INTO inserted_row
  FROM inserted;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_search_history(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_definitions_to_ontology(
  _ontology_id uuid,
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  row_number integer := 1;
  imported_count integer := 0;
  warnings jsonb := '[]'::jsonb;
  ontology_title text;
  raw_title text;
  raw_description text;
  raw_content text;
  raw_example text;
  raw_priority text;
  raw_status text;
  parsed_priority public.priority_level := 'normal';
  parsed_status public.workflow_status := 'draft';
  parsed_tags text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _ontology_id IS NULL THEN
    RAISE EXCEPTION 'Ontology is required';
  END IF;

  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import payload must be an array of rows';
  END IF;

  SELECT title
  INTO ontology_title
  FROM public.ontologies
  WHERE id = _ontology_id;

  IF ontology_title IS NULL THEN
    RAISE EXCEPTION 'Selected ontology was not found';
  END IF;

  FOR row_data IN
    SELECT value
    FROM jsonb_array_elements(_rows)
  LOOP
    raw_title := nullif(btrim(coalesce(row_data ->> 'title', '')), '');
    raw_description := nullif(btrim(coalesce(row_data ->> 'description', '')), '');
    raw_content := nullif(btrim(coalesce(row_data ->> 'content', '')), '');
    raw_example := nullif(btrim(coalesce(row_data ->> 'example', '')), '');
    raw_priority := lower(btrim(coalesce(row_data ->> 'priority', '')));
    raw_status := lower(btrim(coalesce(row_data ->> 'status', '')));
    parsed_priority := 'normal';
    parsed_status := 'draft';
    parsed_tags := '{}';

    IF raw_title IS NULL THEN
      warnings := warnings || jsonb_build_array(format('Row %s was skipped because title is required.', row_number + 1));
      row_number := row_number + 1;
      CONTINUE;
    END IF;

    IF jsonb_typeof(row_data -> 'tags') = 'array' THEN
      SELECT coalesce(array_agg(value), '{}')
      INTO parsed_tags
      FROM jsonb_array_elements_text(row_data -> 'tags') AS tag(value)
      WHERE btrim(value) <> '';
    END IF;

    IF raw_priority IN ('low', 'normal', 'high', 'critical') THEN
      parsed_priority := raw_priority::public.priority_level;
    ELSIF raw_priority <> '' THEN
      warnings := warnings || jsonb_build_array(format('Row %s used unsupported priority "%s" and defaulted to normal.', row_number + 1, raw_priority));
    END IF;

    IF raw_status IN ('draft', 'in_review', 'approved', 'rejected', 'archived') THEN
      parsed_status := raw_status::public.workflow_status;
    ELSIF raw_status <> '' THEN
      warnings := warnings || jsonb_build_array(format('Row %s used unsupported status "%s" and defaulted to draft.', row_number + 1, raw_status));
    END IF;

    INSERT INTO public.definitions (
      title,
      description,
      content,
      example,
      ontology_id,
      created_by,
      priority,
      status,
      tags
    )
    VALUES (
      raw_title,
      raw_description,
      raw_content,
      raw_example,
      _ontology_id,
      auth.uid(),
      parsed_priority,
      parsed_status,
      parsed_tags
    );

    imported_count := imported_count + 1;
    row_number := row_number + 1;
  END LOOP;

  IF imported_count > 0 THEN
    INSERT INTO public.activity_events (
      user_id,
      action,
      entity_type,
      entity_id,
      entity_title,
      details
    )
    VALUES (
      auth.uid(),
      'imported',
      'ontology',
      _ontology_id,
      ontology_title,
      jsonb_build_object('imported_count', imported_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'importedCount', imported_count,
    'warnings', warnings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_definitions_to_ontology(uuid, jsonb) TO authenticated;
