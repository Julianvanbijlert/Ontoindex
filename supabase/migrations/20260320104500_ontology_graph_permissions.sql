DROP POLICY IF EXISTS "Editors and admins can update own ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Admins can delete ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors and admins can update definitions" ON public.definitions;
DROP POLICY IF EXISTS "Admins can delete definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors and admins can update relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors and admins can delete relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors and admins can insert relationships" ON public.relationships;

CREATE POLICY "Editors and admins can update ontologies"
ON public.ontologies
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete ontologies"
ON public.ontologies
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can update definitions"
ON public.definitions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete definitions"
ON public.definitions
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can insert relationships"
ON public.relationships
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can update relationships"
ON public.relationships
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete relationships"
ON public.relationships
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

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
  normalized_status text;
  parsed_priority public.priority_level := 'normal';
  parsed_status public.workflow_status := 'draft';
  parsed_tags text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to import ontology data';
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
    normalized_status := replace(replace(raw_status, '-', '_'), ' ', '_');
    parsed_priority := 'normal';
    parsed_status := 'draft';
    parsed_tags := '{}';

    IF raw_title IS NULL THEN
      warnings := warnings || jsonb_build_array(format('Row %s was skipped because title is required.', row_number + 1));
      row_number := row_number + 1;
      CONTINUE;
    END IF;

    IF raw_description IS NULL AND raw_content IS NULL THEN
      warnings := warnings || jsonb_build_array(format('Row %s was skipped because description or context is required.', row_number + 1));
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
    ELSIF raw_priority = 'medium' THEN
      parsed_priority := 'normal';
      warnings := warnings || jsonb_build_array(format('Row %s normalized priority "%s" to "normal".', row_number + 1, raw_priority));
    ELSIF raw_priority <> '' THEN
      warnings := warnings || jsonb_build_array(format('Row %s used unsupported priority "%s" and defaulted to normal.', row_number + 1, raw_priority));
    END IF;

    IF normalized_status IN ('draft', 'in_review', 'approved', 'rejected', 'archived') THEN
      parsed_status := normalized_status::public.workflow_status;

      IF raw_status <> '' AND raw_status <> normalized_status THEN
        warnings := warnings || jsonb_build_array(format('Row %s normalized status "%s" to "%s".', row_number + 1, raw_status, replace(normalized_status, '_', ' ')));
      END IF;
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

CREATE OR REPLACE FUNCTION public.delete_definition_cascade(_definition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  definition_record public.definitions%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO definition_record
  FROM public.definitions
  WHERE id = _definition_id;

  IF definition_record.id IS NULL THEN
    RAISE EXCEPTION 'Definition not found';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this definition';
  END IF;

  DELETE FROM public.notifications
  WHERE link = format('/definitions/%s', _definition_id);

  DELETE FROM public.activity_events
  WHERE entity_type = 'definition'
    AND entity_id = _definition_id;

  DELETE FROM public.definitions
  WHERE id = _definition_id;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title)
  VALUES (current_user_id, 'deleted', 'definition', _definition_id, definition_record.title);

  RETURN jsonb_build_object(
    'deleted', true,
    'id', _definition_id,
    'title', definition_record.title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ontology_cascade(_ontology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  ontology_record public.ontologies%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO ontology_record
  FROM public.ontologies
  WHERE id = _ontology_id;

  IF ontology_record.id IS NULL THEN
    RAISE EXCEPTION 'Ontology not found';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this ontology';
  END IF;

  DELETE FROM public.notifications
  WHERE link = format('/ontologies/%s', _ontology_id)
     OR link IN (
       SELECT format('/definitions/%s', definitions.id)
       FROM public.definitions
       WHERE definitions.ontology_id = _ontology_id
     );

  DELETE FROM public.activity_events
  WHERE (entity_type = 'ontology' AND entity_id = _ontology_id)
     OR (
       entity_type = 'definition'
       AND entity_id IN (
         SELECT id
         FROM public.definitions
         WHERE ontology_id = _ontology_id
       )
     );

  DELETE FROM public.ontologies
  WHERE id = _ontology_id;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title)
  VALUES (current_user_id, 'deleted', 'ontology', _ontology_id, ontology_record.title);

  RETURN jsonb_build_object(
    'deleted', true,
    'id', _ontology_id,
    'title', ontology_record.title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.export_ontology_snapshot(_ontology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ontology_record public.ontologies%ROWTYPE;
  definitions_payload jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to export ontology data';
  END IF;

  SELECT *
  INTO ontology_record
  FROM public.ontologies
  WHERE id = _ontology_id;

  IF ontology_record.id IS NULL THEN
    RAISE EXCEPTION 'Ontology not found';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', definition_record.id,
        'title', definition_record.title,
        'description', COALESCE(definition_record.description, ''),
        'content', COALESCE(definition_record.content, ''),
        'example', COALESCE(definition_record.example, ''),
        'status', COALESCE(definition_record.status::text, 'draft'),
        'priority', COALESCE(definition_record.priority::text, 'normal'),
        'tags', COALESCE(to_jsonb(definition_record.tags), '[]'::jsonb),
        'updatedAt', definition_record.updated_at,
        'viewCount', COALESCE(definition_record.view_count, 0),
        'relationships', definition_relationships.relationships
      )
      ORDER BY definition_record.title
    ),
    '[]'::jsonb
  )
  INTO definitions_payload
  FROM public.definitions AS definition_record
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', relationship_record.id,
          'type', relationship_record.type,
          'label', relationship_record.label,
          'targetId', target_definition.id,
          'targetTitle', COALESCE(target_definition.title, 'Unknown definition')
        )
        ORDER BY target_definition.title
      ),
      '[]'::jsonb
    ) AS relationships
    FROM public.relationships AS relationship_record
    LEFT JOIN public.definitions AS target_definition
      ON target_definition.id = relationship_record.target_id
    WHERE relationship_record.source_id = definition_record.id
  ) AS definition_relationships ON true
  WHERE definition_record.ontology_id = _ontology_id
    AND COALESCE(definition_record.is_deleted, false) = false;

  RETURN jsonb_build_object(
    'ontology', jsonb_build_object(
      'id', ontology_record.id,
      'title', ontology_record.title,
      'description', COALESCE(ontology_record.description, ''),
      'status', COALESCE(ontology_record.status::text, 'draft'),
      'tags', COALESCE(to_jsonb(ontology_record.tags), '[]'::jsonb),
      'updatedAt', ontology_record.updated_at
    ),
    'definitions', definitions_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_ontology_snapshot(uuid) TO authenticated;
