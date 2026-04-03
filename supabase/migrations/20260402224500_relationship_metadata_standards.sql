ALTER TABLE public.relationships
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

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
        'metadata', COALESCE(definition_record.metadata, '{}'::jsonb),
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
          'metadata', COALESCE(relationship_record.metadata, '{}'::jsonb),
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
