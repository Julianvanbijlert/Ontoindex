-- Granular tracked activity notification preferences and backend-only ontology timeline.

INSERT INTO public.notification_type_catalog (type, category, label, description, default_enabled)
VALUES
  ('ontology_workflow_changed', 'tracked ontology activity', 'Workflow changes', 'Notify me when a tracked ontology changes workflow status.', true),
  ('ontology_edited', 'tracked ontology activity', 'Edits', 'Notify me when a tracked ontology is edited.', true),
  ('ontology_relation_added', 'tracked ontology activity', 'New relations', 'Notify me when a tracked ontology gets a new relation.', true),
  ('ontology_relation_deleted', 'tracked ontology activity', 'Deleted relations', 'Notify me when a tracked ontology loses a relation.', true),
  ('ontology_deleted', 'tracked ontology activity', 'Deletions', 'Notify me when a tracked ontology is deleted.', true),
  ('ontology_other_activity', 'tracked ontology activity', 'Other activity', 'Notify me about other tracked ontology history events, such as imports or review activity.', true),
  ('definition_workflow_changed', 'tracked definition activity', 'Workflow changes', 'Notify me when a tracked definition changes workflow status.', true),
  ('definition_edited', 'tracked definition activity', 'Edits', 'Notify me when a tracked definition is edited.', true),
  ('definition_relation_added', 'tracked definition activity', 'New relations', 'Notify me when a tracked definition gets a new relation.', true),
  ('definition_relation_deleted', 'tracked definition activity', 'Deleted relations', 'Notify me when a tracked definition loses a relation.', true),
  ('definition_deleted', 'tracked definition activity', 'Deletions', 'Notify me when a tracked definition is deleted.', true),
  ('definition_other_activity', 'tracked definition activity', 'Other activity', 'Notify me about other tracked definition history events, such as review activity.', true),
  ('comment_reply', 'comments', 'Comment replies', 'Notify me when someone replies to one of my comments.', true),
  ('comment_resolved', 'comments', 'Comment resolution', 'Notify me when someone resolves one of my comments.', true),
  ('definition_commented_for_author', 'comments', 'Comments on my definitions', 'Notify me when someone comments on a definition I authored.', true),
  ('review_request_incorporated', 'reviews', 'My review requests were incorporated', 'Notify me when a review request I created is approved and incorporated.', true),
  ('assigned_definition_review', 'reviews', 'Assigned definition reviews', 'Notify me when I am assigned to review a definition.', true),
  ('assigned_change_review', 'reviews', 'Assigned change reviews', 'Notify me when I am assigned to review a change.', true)
ON CONFLICT (type) DO UPDATE
SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled;

WITH legacy_mappings AS (
  SELECT
    preference.user_id,
    preference.enabled,
    mapped.notification_type
  FROM public.notification_preferences AS preference
  JOIN (
    SELECT
      'tracked_ontology_history_changed'::text AS legacy_type,
      unnest(ARRAY[
        'ontology_workflow_changed',
        'ontology_edited',
        'ontology_relation_added',
        'ontology_relation_deleted',
        'ontology_deleted',
        'ontology_other_activity'
      ]) AS notification_type
    UNION ALL
    SELECT
      'tracked_definition_history_changed'::text AS legacy_type,
      unnest(ARRAY[
        'definition_workflow_changed',
        'definition_edited',
        'definition_relation_added',
        'definition_relation_deleted',
        'definition_deleted',
        'definition_other_activity'
      ]) AS notification_type
  ) AS mapped
    ON mapped.legacy_type = preference.notification_type
)
INSERT INTO public.notification_preferences (user_id, notification_type, enabled)
SELECT
  legacy_mappings.user_id,
  legacy_mappings.notification_type,
  legacy_mappings.enabled
FROM legacy_mappings
ON CONFLICT (user_id, notification_type) DO NOTHING;

DELETE FROM public.notification_type_catalog
WHERE type IN ('tracked_ontology_history_changed', 'tracked_definition_history_changed');

CREATE TABLE IF NOT EXISTS public.ontology_activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id UUID NOT NULL,
  activity_event_id UUID REFERENCES public.activity_events(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id UUID,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ontology_activity_timeline_ontology_created_idx
  ON public.ontology_activity_timeline (ontology_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ontology_activity_timeline_source_entity_idx
  ON public.ontology_activity_timeline (source_entity_type, source_entity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ontology_activity_timeline_ontology_dedupe_idx
  ON public.ontology_activity_timeline (ontology_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.ontology_activity_timeline ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.normalize_tracked_activity_type(_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _action = 'status_changed' THEN 'workflow_changed'
    WHEN _action = 'updated' THEN 'edited'
    WHEN _action = 'relationship_added' THEN 'relation_added'
    WHEN _action = 'relationship_removed' THEN 'relation_deleted'
    WHEN _action = 'deleted' THEN 'deleted'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tracked_activity_notification_type(_scope text, _activity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _scope = 'ontology' AND _activity_type = 'workflow_changed' THEN 'ontology_workflow_changed'
    WHEN _scope = 'ontology' AND _activity_type = 'edited' THEN 'ontology_edited'
    WHEN _scope = 'ontology' AND _activity_type = 'relation_added' THEN 'ontology_relation_added'
    WHEN _scope = 'ontology' AND _activity_type = 'relation_deleted' THEN 'ontology_relation_deleted'
    WHEN _scope = 'ontology' AND _activity_type = 'deleted' THEN 'ontology_deleted'
    WHEN _scope = 'ontology' THEN 'ontology_other_activity'
    WHEN _scope = 'definition' AND _activity_type = 'workflow_changed' THEN 'definition_workflow_changed'
    WHEN _scope = 'definition' AND _activity_type = 'edited' THEN 'definition_edited'
    WHEN _scope = 'definition' AND _activity_type = 'relation_added' THEN 'definition_relation_added'
    WHEN _scope = 'definition' AND _activity_type = 'relation_deleted' THEN 'definition_relation_deleted'
    WHEN _scope = 'definition' AND _activity_type = 'deleted' THEN 'definition_deleted'
    WHEN _scope = 'definition' THEN 'definition_other_activity'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_definition_ontology_id(_definition_id uuid, _details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_ontology_id uuid;
BEGIN
  BEGIN
    resolved_ontology_id := NULLIF(COALESCE(_details ->> 'ontology_id', ''), '')::uuid;
  EXCEPTION WHEN others THEN
    resolved_ontology_id := NULL;
  END;

  IF resolved_ontology_id IS NOT NULL THEN
    RETURN resolved_ontology_id;
  END IF;

  SELECT ontology_id INTO resolved_ontology_id
  FROM public.definitions
  WHERE id = _definition_id;

  RETURN resolved_ontology_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_ontology_timeline_event(
  _ontology_id uuid,
  _activity_event_id uuid,
  _actor_user_id uuid,
  _source_entity_type text,
  _source_entity_id uuid,
  _activity_type text,
  _title text,
  _summary text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF _ontology_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _dedupe_key IS NOT NULL THEN
    INSERT INTO public.ontology_activity_timeline (
      ontology_id,
      activity_event_id,
      actor_user_id,
      source_entity_type,
      source_entity_id,
      activity_type,
      title,
      summary,
      metadata,
      dedupe_key
    )
    VALUES (
      _ontology_id,
      _activity_event_id,
      _actor_user_id,
      COALESCE(_source_entity_type, 'ontology'),
      _source_entity_id,
      COALESCE(_activity_type, 'other'),
      COALESCE(NULLIF(btrim(_title), ''), 'Ontology activity'),
      COALESCE(_summary, ''),
      COALESCE(_metadata, '{}'::jsonb),
      _dedupe_key
    )
    ON CONFLICT (ontology_id, dedupe_key) WHERE dedupe_key IS NOT NULL
    DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NULL THEN
      SELECT id INTO inserted_id
      FROM public.ontology_activity_timeline
      WHERE ontology_id = _ontology_id
        AND dedupe_key = _dedupe_key
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    RETURN inserted_id;
  END IF;

  INSERT INTO public.ontology_activity_timeline (
    ontology_id,
    activity_event_id,
    actor_user_id,
    source_entity_type,
    source_entity_id,
    activity_type,
    title,
    summary,
    metadata,
    dedupe_key
  )
  VALUES (
    _ontology_id,
    _activity_event_id,
    _actor_user_id,
    COALESCE(_source_entity_type, 'ontology'),
    _source_entity_id,
    COALESCE(_activity_type, 'other'),
    COALESCE(NULLIF(btrim(_title), ''), 'Ontology activity'),
    COALESCE(_summary, ''),
    COALESCE(_metadata, '{}'::jsonb),
    NULL
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ontology_timeline_from_activity_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ontology_id uuid;
  ontology_title text;
  activity_type text;
  summary text;
  dedupe_key text;
BEGIN
  IF NEW.entity_id IS NULL
     OR NEW.entity_type NOT IN ('ontology', 'definition')
     OR NEW.action = 'viewed' THEN
    RETURN NEW;
  END IF;

  activity_type := public.normalize_tracked_activity_type(NEW.action);
  summary := COALESCE(
    NULLIF(btrim(COALESCE(NEW.details ->> 'summary', '')), ''),
    format('There is new activity on "%s".', COALESCE(NEW.entity_title, 'this item'))
  );

  IF NEW.entity_type = 'ontology' THEN
    ontology_id := NEW.entity_id;
    ontology_title := COALESCE(NEW.entity_title, 'Untitled ontology');
  ELSE
    ontology_id := public.resolve_definition_ontology_id(NEW.entity_id, NEW.details);

    IF ontology_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT title INTO ontology_title
    FROM public.ontologies
    WHERE id = ontology_id;

    ontology_title := COALESCE(ontology_title, NEW.details ->> 'ontology_title', 'Untitled ontology');
  END IF;

  dedupe_key := CASE
    WHEN NEW.action IN ('relationship_added', 'relationship_removed')
      AND COALESCE(NEW.details ->> 'relationship_id', '') <> ''
    THEN format('ontology:%s:%s:%s', ontology_id, NEW.action, NEW.details ->> 'relationship_id')
    ELSE format('ontology:%s:activity-event:%s', ontology_id, NEW.id)
  END;

  PERFORM public.enqueue_ontology_timeline_event(
    ontology_id,
    NEW.id,
    NEW.user_id,
    NEW.entity_type,
    NEW.entity_id,
    activity_type,
    ontology_title,
    summary,
    COALESCE(NEW.details, '{}'::jsonb)
      || jsonb_build_object(
        'ontology_title', ontology_title,
        'entity_title', NEW.entity_title,
        'activity_action', NEW.action,
        'activity_type', activity_type
      ),
    dedupe_key
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_definition_trackers_on_activity_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  activity_type text;
  notification_type text;
  definition_title text;
  summary text;
  parent_ontology_id uuid;
  notification_title text;
  link_path text;
BEGIN
  IF NEW.entity_id IS NULL
     OR NEW.entity_type <> 'definition'
     OR NEW.action = 'viewed' THEN
    RETURN NEW;
  END IF;

  activity_type := public.normalize_tracked_activity_type(NEW.action);
  notification_type := public.tracked_activity_notification_type('definition', activity_type);

  IF notification_type IS NULL THEN
    RETURN NEW;
  END IF;

  definition_title := COALESCE(NEW.entity_title, NEW.details ->> 'definition_title', 'Untitled definition');
  summary := COALESCE(
    NULLIF(btrim(COALESCE(NEW.details ->> 'summary', '')), ''),
    format('There is new activity on "%s".', definition_title)
  );
  parent_ontology_id := public.resolve_definition_ontology_id(NEW.entity_id, NEW.details);

  notification_title := CASE activity_type
    WHEN 'workflow_changed' THEN format('Workflow change: %s', definition_title)
    WHEN 'edited' THEN format('Definition edited: %s', definition_title)
    WHEN 'relation_added' THEN format('New relation: %s', definition_title)
    WHEN 'relation_deleted' THEN format('Relation removed: %s', definition_title)
    WHEN 'deleted' THEN format('Definition deleted: %s', definition_title)
    ELSE format('Definition activity: %s', definition_title)
  END;

  link_path := CASE
    WHEN activity_type = 'deleted' AND COALESCE(NEW.details ->> 'cause', '') = 'ontology_deleted' THEN '/ontologies'
    WHEN activity_type = 'deleted' AND parent_ontology_id IS NOT NULL THEN format('/ontologies/%s', parent_ontology_id)
    WHEN activity_type = 'deleted' THEN '/definitions'
    ELSE format('/definitions/%s', NEW.entity_id)
  END;

  PERFORM public.create_notification(
    favorite.user_id,
    notification_type,
    NEW.user_id,
    'definition',
    NEW.entity_id,
    CASE WHEN parent_ontology_id IS NULL THEN NULL ELSE 'ontology' END,
    parent_ontology_id,
    notification_title,
    summary,
    link_path,
    COALESCE(NEW.details, '{}'::jsonb)
      || jsonb_build_object(
        'activity_event_id', NEW.id,
        'activity_action', NEW.action,
        'activity_type', activity_type,
        'definition_title', definition_title
      ),
    format('definition-activity:%s:%s', NEW.id, favorite.user_id)
  )
  FROM public.favorites AS favorite
  WHERE favorite.definition_id = NEW.entity_id
    AND favorite.user_id IS DISTINCT FROM NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_ontology_trackers_on_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  ontology_title text;
  source_title text;
  notification_title text;
  link_path text;
BEGIN
  notification_type := public.tracked_activity_notification_type('ontology', NEW.activity_type);

  IF notification_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.source_entity_type = 'definition'
     AND NEW.activity_type = 'deleted'
     AND COALESCE(NEW.metadata ->> 'cause', '') = 'ontology_deleted' THEN
    RETURN NEW;
  END IF;

  ontology_title := COALESCE(NEW.metadata ->> 'ontology_title', NEW.title, 'Untitled ontology');
  source_title := COALESCE(NEW.metadata ->> 'entity_title', ontology_title);

  notification_title := CASE
    WHEN NEW.source_entity_type = 'definition' THEN
      CASE NEW.activity_type
        WHEN 'workflow_changed' THEN format('Workflow change in %s', ontology_title)
        WHEN 'edited' THEN format('Definition edited in %s', ontology_title)
        WHEN 'relation_added' THEN format('New relation in %s', ontology_title)
        WHEN 'relation_deleted' THEN format('Relation removed in %s', ontology_title)
        WHEN 'deleted' THEN format('Definition deleted in %s', ontology_title)
        ELSE format('Definition activity in %s', ontology_title)
      END
    ELSE
      CASE NEW.activity_type
        WHEN 'workflow_changed' THEN format('Workflow change: %s', ontology_title)
        WHEN 'edited' THEN format('Ontology edited: %s', ontology_title)
        WHEN 'relation_added' THEN format('New relation in %s', ontology_title)
        WHEN 'relation_deleted' THEN format('Relation removed in %s', ontology_title)
        WHEN 'deleted' THEN format('Ontology deleted: %s', ontology_title)
        ELSE format('Ontology activity: %s', ontology_title)
      END
  END;

  link_path := CASE
    WHEN NEW.activity_type = 'deleted' THEN '/ontologies'
    ELSE format('/ontologies/%s', NEW.ontology_id)
  END;

  PERFORM public.create_notification(
    favorite.user_id,
    notification_type,
    NEW.actor_user_id,
    'ontology',
    NEW.ontology_id,
    NEW.source_entity_type,
    NEW.source_entity_id,
    notification_title,
    COALESCE(NULLIF(btrim(NEW.summary), ''), format('There is new activity on "%s".', source_title)),
    link_path,
    COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ontology_activity_timeline_id', NEW.id,
        'activity_type', NEW.activity_type,
        'source_entity_title', source_title
      ),
    format('ontology-activity:%s:%s', NEW.id, favorite.user_id)
  )
  FROM public.favorites AS favorite
  WHERE favorite.ontology_id = NEW.ontology_id
    AND favorite.user_id IS DISTINCT FROM NEW.actor_user_id
    AND NOT (
      NEW.source_entity_type = 'definition'
      AND NEW.source_entity_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.favorites AS definition_favorite
        WHERE definition_favorite.user_id = favorite.user_id
          AND definition_favorite.definition_id = NEW.source_entity_id
      )
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_my_notification_preferences()
RETURNS TABLE (
  notification_type text,
  category text,
  label text,
  description text,
  default_enabled boolean,
  enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.type AS notification_type,
    c.category,
    c.label,
    c.description,
    c.default_enabled,
    COALESCE(p.enabled, c.default_enabled) AS enabled
  FROM public.notification_type_catalog AS c
  LEFT JOIN public.notification_preferences AS p
    ON p.user_id = auth.uid()
   AND p.notification_type = c.type
  ORDER BY
    CASE c.category
      WHEN 'tracked ontology activity' THEN 1
      WHEN 'tracked definition activity' THEN 2
      WHEN 'comments' THEN 3
      WHEN 'reviews' THEN 4
      ELSE 99
    END,
    c.label;
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
  WHERE link = format('/definitions/%s', _definition_id)
     OR link_path = format('/definitions/%s', _definition_id);

  DELETE FROM public.activity_events
  WHERE entity_type = 'definition'
    AND entity_id = _definition_id;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    current_user_id,
    'deleted',
    'definition',
    _definition_id,
    definition_record.title,
    jsonb_build_object(
      'ontology_id', definition_record.ontology_id,
      'summary', format('Deleted definition "%s".', definition_record.title)
    )
  );

  DELETE FROM public.definitions
  WHERE id = _definition_id;

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
  definition_record RECORD;
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
     OR link_path = format('/ontologies/%s', _ontology_id)
     OR link IN (
       SELECT format('/definitions/%s', definitions.id)
       FROM public.definitions
       WHERE definitions.ontology_id = _ontology_id
     )
     OR link_path IN (
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

  FOR definition_record IN
    SELECT id, title
    FROM public.definitions
    WHERE ontology_id = _ontology_id
  LOOP
    INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
    VALUES (
      current_user_id,
      'deleted',
      'definition',
      definition_record.id,
      definition_record.title,
      jsonb_build_object(
        'ontology_id', _ontology_id,
        'ontology_title', ontology_record.title,
        'cause', 'ontology_deleted',
        'summary', format('Deleted definition "%s" as part of deleting ontology "%s".', definition_record.title, ontology_record.title)
      )
    );
  END LOOP;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    current_user_id,
    'deleted',
    'ontology',
    _ontology_id,
    ontology_record.title,
    jsonb_build_object(
      'summary', format('Deleted ontology "%s".', ontology_record.title)
    )
  );

  DELETE FROM public.ontologies
  WHERE id = _ontology_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'id', _ontology_id,
    'title', ontology_record.title
  );
END;
$$;

SELECT public.enqueue_ontology_timeline_event(
  derived.ontology_id,
  derived.activity_event_id,
  derived.actor_user_id,
  derived.source_entity_type,
  derived.source_entity_id,
  derived.activity_type,
  derived.title,
  derived.summary,
  derived.metadata,
  derived.dedupe_key
)
FROM (
  SELECT
    CASE
      WHEN activity.entity_type = 'ontology' THEN activity.entity_id
      ELSE public.resolve_definition_ontology_id(activity.entity_id, activity.details)
    END AS ontology_id,
    activity.id AS activity_event_id,
    activity.user_id AS actor_user_id,
    activity.entity_type AS source_entity_type,
    activity.entity_id AS source_entity_id,
    public.normalize_tracked_activity_type(activity.action) AS activity_type,
    COALESCE(
      ontology.title,
      activity.details ->> 'ontology_title',
      activity.entity_title,
      'Untitled ontology'
    ) AS title,
    COALESCE(
      NULLIF(btrim(COALESCE(activity.details ->> 'summary', '')), ''),
      format('There is new activity on "%s".', COALESCE(activity.entity_title, 'this item'))
    ) AS summary,
    COALESCE(activity.details, '{}'::jsonb)
      || jsonb_build_object(
        'ontology_title', COALESCE(ontology.title, activity.details ->> 'ontology_title', activity.entity_title),
        'entity_title', activity.entity_title,
        'activity_action', activity.action,
        'activity_type', public.normalize_tracked_activity_type(activity.action)
      ) AS metadata,
    CASE
      WHEN activity.action IN ('relationship_added', 'relationship_removed')
        AND COALESCE(activity.details ->> 'relationship_id', '') <> ''
      THEN format(
        'ontology:%s:%s:%s',
        CASE
          WHEN activity.entity_type = 'ontology' THEN activity.entity_id
          ELSE public.resolve_definition_ontology_id(activity.entity_id, activity.details)
        END,
        activity.action,
        activity.details ->> 'relationship_id'
      )
      ELSE format(
        'ontology:%s:activity-event:%s',
        CASE
          WHEN activity.entity_type = 'ontology' THEN activity.entity_id
          ELSE public.resolve_definition_ontology_id(activity.entity_id, activity.details)
        END,
        activity.id
      )
    END AS dedupe_key
  FROM public.activity_events AS activity
  LEFT JOIN public.ontologies AS ontology
    ON ontology.id = CASE
      WHEN activity.entity_type = 'ontology' THEN activity.entity_id
      ELSE public.resolve_definition_ontology_id(activity.entity_id, activity.details)
    END
  WHERE activity.entity_id IS NOT NULL
    AND activity.entity_type IN ('ontology', 'definition')
    AND activity.action <> 'viewed'
) AS derived
WHERE derived.ontology_id IS NOT NULL;

DROP TRIGGER IF EXISTS notify_followers_on_activity_event ON public.activity_events;
DROP TRIGGER IF EXISTS notify_definition_trackers_on_activity_event ON public.activity_events;
CREATE TRIGGER notify_definition_trackers_on_activity_event
AFTER INSERT ON public.activity_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_definition_trackers_on_activity_event();

DROP TRIGGER IF EXISTS record_ontology_timeline_from_activity_event ON public.activity_events;
CREATE TRIGGER record_ontology_timeline_from_activity_event
AFTER INSERT ON public.activity_events
FOR EACH ROW
EXECUTE FUNCTION public.record_ontology_timeline_from_activity_event();

DROP TRIGGER IF EXISTS notify_ontology_trackers_on_timeline_event ON public.ontology_activity_timeline;
CREATE TRIGGER notify_ontology_trackers_on_timeline_event
AFTER INSERT ON public.ontology_activity_timeline
FOR EACH ROW
EXECUTE FUNCTION public.notify_ontology_trackers_on_timeline_event();

DROP FUNCTION IF EXISTS public.notify_followers_on_activity_event();

GRANT EXECUTE ON FUNCTION public.fetch_my_notification_preferences() TO authenticated;
