CREATE OR REPLACE FUNCTION public.update_my_role(_target_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _target_role NOT IN ('viewer', 'editor', 'admin') THEN
    RAISE EXCEPTION 'Unsupported role selection';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = current_user_id
    AND role IN ('viewer', 'editor', 'admin');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, _target_role);

  RETURN jsonb_build_object('role', _target_role);
END;
$$;

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
    public.has_role(current_user_id, 'admin')
    OR (
      definition_record.created_by = current_user_id
      AND (
        public.has_role(current_user_id, 'editor')
        OR public.has_role(current_user_id, 'admin')
      )
    )
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

GRANT EXECUTE ON FUNCTION public.delete_definition_cascade(uuid) TO authenticated;

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
    public.has_role(current_user_id, 'admin')
    OR (
      ontology_record.created_by = current_user_id
      AND (
        public.has_role(current_user_id, 'editor')
        OR public.has_role(current_user_id, 'admin')
      )
    )
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

GRANT EXECUTE ON FUNCTION public.delete_ontology_cascade(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_definition_owner_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  definition_owner uuid;
  definition_title text;
BEGIN
  SELECT created_by, title
  INTO definition_owner, definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  IF definition_owner IS NOT NULL AND definition_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      definition_owner,
      'definition_comment',
      'New comment on your definition',
      format('"%s" received a new comment.', coalesce(definition_title, 'A definition')),
      format('/definitions/%s', NEW.definition_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_definition_favoriters_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  content_changed boolean := ROW(
    NEW.title,
    NEW.description,
    NEW.content,
    NEW.example,
    NEW.priority,
    NEW.tags,
    NEW.metadata,
    NEW.version
  ) IS DISTINCT FROM ROW(
    OLD.title,
    OLD.description,
    OLD.content,
    OLD.example,
    OLD.priority,
    OLD.tags,
    OLD.metadata,
    OLD.version
  );
  status_changed boolean := NEW.status IS DISTINCT FROM OLD.status;
BEGIN
  IF NOT content_changed AND NOT status_changed THEN
    RETURN NEW;
  END IF;

  IF content_changed THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT
      favorites.user_id,
      'definition_changed',
      'Definition you liked was updated',
      format('"%s" was updated.', NEW.title),
      format('/definitions/%s', NEW.id)
    FROM public.favorites AS favorites
    WHERE favorites.definition_id = NEW.id
      AND favorites.user_id IS DISTINCT FROM actor_id;
  END IF;

  IF status_changed THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT
      favorites.user_id,
      'definition_status_changed',
      'Definition status changed',
      format(
        '"%s" moved from %s to %s.',
        NEW.title,
        replace(coalesce(OLD.status::text, 'draft'), '_', ' '),
        replace(coalesce(NEW.status::text, 'draft'), '_', ' ')
      ),
      format('/definitions/%s', NEW.id)
    FROM public.favorites AS favorites
    WHERE favorites.definition_id = NEW.id
      AND favorites.user_id IS DISTINCT FROM actor_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_definition_favoriters_on_relationship_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  relation_record public.relationships%ROWTYPE;
  relation_name text;
BEGIN
  relation_record := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  relation_name := coalesce(nullif(btrim(relation_record.label), ''), replace(relation_record.type::text, '_', ' '));

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT DISTINCT
    favorite.user_id,
    'definition_changed',
    'Definition relationship changed',
    format('A "%s" relation changed for "%s".', relation_name, definition_record.title),
    format('/definitions/%s', definition_record.id)
  FROM public.definitions AS definition_record
  JOIN public.favorites AS favorite ON favorite.definition_id = definition_record.id
  WHERE definition_record.id IN (relation_record.source_id, relation_record.target_id)
    AND favorite.user_id IS DISTINCT FROM actor_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS notify_definition_relationships_on_change ON public.relationships;
CREATE TRIGGER notify_definition_relationships_on_change
AFTER INSERT OR UPDATE OR DELETE ON public.relationships
FOR EACH ROW
EXECUTE FUNCTION public.notify_definition_favoriters_on_relationship_change();

CREATE OR REPLACE FUNCTION public.notify_ontology_favoriters_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF ROW(
    NEW.title,
    NEW.description,
    NEW.status,
    NEW.priority,
    NEW.tags
  ) IS NOT DISTINCT FROM ROW(
    OLD.title,
    OLD.description,
    OLD.status,
    OLD.priority,
    OLD.tags
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT
    favorites.user_id,
    'ontology_changed',
    'Ontology you liked was updated',
    format('"%s" was updated.', NEW.title),
    format('/ontologies/%s', NEW.id)
  FROM public.favorites AS favorites
  WHERE favorites.ontology_id = NEW.id
    AND favorites.user_id IS DISTINCT FROM actor_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_ontology_favoriters_on_update ON public.ontologies;
CREATE TRIGGER notify_ontology_favoriters_on_update
AFTER UPDATE ON public.ontologies
FOR EACH ROW
EXECUTE FUNCTION public.notify_ontology_favoriters_on_update();
