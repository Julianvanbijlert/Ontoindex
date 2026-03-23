ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS parent_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS parent_entity_id UUID,
  ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS link_path TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

UPDATE public.notifications
SET
  body = COALESCE(NULLIF(body, ''), COALESCE(message, '')),
  link_path = COALESCE(link_path, NULLIF(link, '')),
  read_at = CASE
    WHEN COALESCE(is_read, false) THEN COALESCE(read_at, created_at)
    ELSE NULL
  END;

CREATE INDEX IF NOT EXISTS notifications_user_created_at_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_idx
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_type_catalog (
  type TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.notification_type_catalog (type, category, label, description, default_enabled)
VALUES
  ('tracked_ontology_history_changed', 'tracking', 'Tracked ontology changes', 'Notify me when an ontology I have liked or saved gets a new history event.', true),
  ('tracked_definition_history_changed', 'tracking', 'Tracked definition changes', 'Notify me when a definition I have liked or saved gets a new history event.', true),
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

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notification_type TEXT REFERENCES public.notification_type_catalog(type) ON DELETE CASCADE NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users see own notification preferences" ON public.notification_preferences
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users insert own notification preferences" ON public.notification_preferences
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users update own notification preferences" ON public.notification_preferences
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users delete own notification preferences" ON public.notification_preferences
FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_notification_enabled(_user_id uuid, _notification_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  catalog_default boolean;
  preference_enabled boolean;
BEGIN
  SELECT default_enabled INTO catalog_default
  FROM public.notification_type_catalog
  WHERE type = _notification_type;

  IF catalog_default IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT enabled INTO preference_enabled
  FROM public.notification_preferences
  WHERE user_id = _user_id
    AND notification_type = _notification_type;

  RETURN COALESCE(preference_enabled, catalog_default);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid,
  _notification_type text,
  _actor_user_id uuid DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _parent_entity_type text DEFAULT NULL,
  _parent_entity_id uuid DEFAULT NULL,
  _title text DEFAULT '',
  _body text DEFAULT '',
  _link_path text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _dedupe_key text DEFAULT NULL,
  _allow_self boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
  fallback_title text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT label INTO fallback_title
  FROM public.notification_type_catalog
  WHERE type = _notification_type;

  IF fallback_title IS NULL THEN
    RAISE EXCEPTION 'Unsupported notification type: %', _notification_type;
  END IF;

  IF NOT _allow_self AND _actor_user_id IS NOT NULL AND _actor_user_id = _user_id THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_notification_enabled(_user_id, _notification_type) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    parent_entity_type,
    parent_entity_id,
    title,
    message,
    body,
    link,
    link_path,
    metadata,
    is_read,
    read_at,
    dedupe_key
  )
  VALUES (
    _user_id,
    _notification_type,
    _actor_user_id,
    _entity_type,
    _entity_id,
    _parent_entity_type,
    _parent_entity_id,
    COALESCE(NULLIF(btrim(_title), ''), fallback_title),
    COALESCE(_body, ''),
    COALESCE(_body, ''),
    _link_path,
    _link_path,
    COALESCE(_metadata, '{}'::jsonb),
    false,
    NULL,
    _dedupe_key
  )
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL AND _dedupe_key IS NOT NULL THEN
    SELECT id INTO inserted_id
    FROM public.notifications
    WHERE user_id = _user_id
      AND dedupe_key = _dedupe_key
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_my_notifications(
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _unread_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  body text,
  link_path text,
  is_read boolean,
  created_at timestamptz,
  read_at timestamptz,
  actor_user_id uuid,
  actor_display_name text,
  actor_email text,
  entity_type text,
  entity_id uuid,
  parent_entity_type text,
  parent_entity_id uuid,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.type,
    n.title,
    n.body,
    COALESCE(n.link_path, n.link) AS link_path,
    COALESCE(n.is_read, false) AS is_read,
    n.created_at,
    n.read_at,
    n.actor_user_id,
    p.display_name AS actor_display_name,
    p.email AS actor_email,
    n.entity_type,
    n.entity_id,
    n.parent_entity_type,
    n.parent_entity_id,
    n.metadata
  FROM public.notifications AS n
  LEFT JOIN public.profiles AS p
    ON p.user_id = n.actor_user_id
  WHERE n.user_id = auth.uid()
    AND (NOT COALESCE(_unread_only, false) OR COALESCE(n.is_read, false) = false)
  ORDER BY n.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.fetch_my_notification_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND COALESCE(is_read, false) = false;
$$;

CREATE OR REPLACE FUNCTION public.set_my_notification_read_state(_notification_id uuid, _is_read boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_notification public.notifications%ROWTYPE;
BEGIN
  UPDATE public.notifications
  SET
    is_read = COALESCE(_is_read, true),
    read_at = CASE WHEN COALESCE(_is_read, true) THEN now() ELSE NULL END
  WHERE id = _notification_id
    AND user_id = auth.uid()
  RETURNING * INTO updated_notification;

  IF updated_notification.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN jsonb_build_object('id', updated_notification.id, 'is_read', updated_notification.is_read, 'read_at', updated_notification.read_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_my_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer := 0;
BEGIN
  UPDATE public.notifications
  SET
    is_read = true,
    read_at = now()
  WHERE user_id = auth.uid()
    AND COALESCE(is_read, false) = false;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN jsonb_build_object('marked_count', affected_count);
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
  ORDER BY c.category, c.label;
$$;

CREATE OR REPLACE FUNCTION public.set_my_notification_preference(_notification_type text, _enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  catalog_default boolean;
BEGIN
  SELECT default_enabled INTO catalog_default
  FROM public.notification_type_catalog
  WHERE type = _notification_type;

  IF catalog_default IS NULL THEN
    RAISE EXCEPTION 'Unsupported notification type';
  END IF;

  INSERT INTO public.notification_preferences (user_id, notification_type, enabled)
  VALUES (auth.uid(), _notification_type, COALESCE(_enabled, catalog_default))
  ON CONFLICT (user_id, notification_type)
  DO UPDATE
  SET
    enabled = EXCLUDED.enabled,
    updated_at = now();

  RETURN jsonb_build_object('notification_type', _notification_type, 'enabled', COALESCE(_enabled, catalog_default));
END;
$$;

CREATE OR REPLACE FUNCTION public.classify_review_assignment_notification_type(_definition_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(definitions.version, 1) > 1
      OR EXISTS (
        SELECT 1
        FROM public.version_history
        WHERE version_history.definition_id = definitions.id
      )
    THEN 'assigned_change_review'
    ELSE 'assigned_definition_review'
  END
  FROM public.definitions
  WHERE definitions.id = _definition_id;
$$;

CREATE OR REPLACE FUNCTION public.notify_followers_on_activity_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  notification_title text;
  notification_body text;
  parent_ontology_id uuid;
BEGIN
  IF NEW.entity_id IS NULL OR NEW.entity_type NOT IN ('definition', 'ontology') THEN
    RETURN NEW;
  END IF;

  IF NEW.action IN ('viewed', 'created', 'deleted', 'requested_review', 'accepted_review', 'rejected_review') THEN
    RETURN NEW;
  END IF;

  notification_type := CASE WHEN NEW.entity_type = 'definition' THEN 'tracked_definition_history_changed' ELSE 'tracked_ontology_history_changed' END;
  notification_title := CASE WHEN NEW.entity_type = 'definition' THEN format('Definition changed: %s', COALESCE(NEW.entity_title, 'Untitled definition')) ELSE format('Ontology changed: %s', COALESCE(NEW.entity_title, 'Untitled ontology')) END;
  notification_body := COALESCE(NULLIF(btrim(COALESCE(NEW.details ->> 'summary', '')), ''), format('There is new activity on "%s".', COALESCE(NEW.entity_title, 'this item')));

  IF NEW.entity_type = 'definition' THEN
    SELECT ontology_id INTO parent_ontology_id
    FROM public.definitions
    WHERE id = NEW.entity_id;

    PERFORM public.create_notification(
      f.user_id,
      notification_type,
      NEW.user_id,
      'definition',
      NEW.entity_id,
      CASE WHEN parent_ontology_id IS NULL THEN NULL ELSE 'ontology' END,
      parent_ontology_id,
      notification_title,
      notification_body,
      format('/definitions/%s', NEW.entity_id),
      jsonb_build_object('activity_event_id', NEW.id, 'activity_action', NEW.action, 'entity_title', NEW.entity_title),
      format('activity-event:%s:%s', NEW.id, f.user_id)
    )
    FROM public.favorites AS f
    WHERE f.definition_id = NEW.entity_id
      AND f.user_id IS DISTINCT FROM NEW.user_id;
  ELSE
    PERFORM public.create_notification(
      f.user_id,
      notification_type,
      NEW.user_id,
      'ontology',
      NEW.entity_id,
      NULL,
      NULL,
      notification_title,
      notification_body,
      format('/ontologies/%s', NEW.entity_id),
      jsonb_build_object('activity_event_id', NEW.id, 'activity_action', NEW.action, 'entity_title', NEW.entity_title),
      format('activity-event:%s:%s', NEW.id, f.user_id)
    )
    FROM public.favorites AS f
    WHERE f.ontology_id = NEW.entity_id
      AND f.user_id IS DISTINCT FROM NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_users_on_comment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  definition_owner_id uuid;
  definition_title text;
  parent_comment_owner_id uuid;
BEGIN
  SELECT created_by, title INTO definition_owner_id, definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_comment_owner_id
    FROM public.comments
    WHERE id = NEW.parent_id;

    PERFORM public.create_notification(
      parent_comment_owner_id,
      'comment_reply',
      NEW.user_id,
      'comment',
      NEW.id,
      'definition',
      NEW.definition_id,
      'New reply to your comment',
      format('Someone replied to your comment on "%s".', COALESCE(definition_title, 'this definition')),
      format('/definitions/%s', NEW.definition_id),
      jsonb_build_object('comment_id', NEW.id, 'parent_comment_id', NEW.parent_id, 'definition_title', definition_title),
      format('comment-reply:%s:%s', NEW.id, parent_comment_owner_id)
    );
  END IF;

  IF definition_owner_id IS NOT NULL
     AND definition_owner_id IS DISTINCT FROM NEW.user_id
     AND (NEW.parent_id IS NULL OR definition_owner_id IS DISTINCT FROM parent_comment_owner_id) THEN
    PERFORM public.create_notification(
      definition_owner_id,
      'definition_commented_for_author',
      NEW.user_id,
      'comment',
      NEW.id,
      'definition',
      NEW.definition_id,
      'New comment on your definition',
      format('"%s" received a new comment.', COALESCE(definition_title, 'Your definition')),
      format('/definitions/%s', NEW.definition_id),
      jsonb_build_object('comment_id', NEW.id, 'definition_title', definition_title),
      format('definition-comment:%s:%s', NEW.id, definition_owner_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_users_on_comment_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  definition_title text;
BEGIN
  IF COALESCE(OLD.is_resolved, false) = COALESCE(NEW.is_resolved, false)
     OR COALESCE(NEW.is_resolved, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT title INTO definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  PERFORM public.create_notification(
    NEW.user_id,
    'comment_resolved',
    auth.uid(),
    'comment',
    NEW.id,
    'definition',
    NEW.definition_id,
    'Your comment was resolved',
    format('Your comment on "%s" was marked as resolved.', COALESCE(definition_title, 'this definition')),
    format('/definitions/%s', NEW.definition_id),
    jsonb_build_object('comment_id', NEW.id, 'definition_title', definition_title, 'resolved', true),
    format('comment-resolved:%s:%s', NEW.id, NEW.updated_at)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_users_on_review_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.approval_requests%ROWTYPE;
  definition_title text;
  notification_type text;
BEGIN
  SELECT * INTO request_record
  FROM public.approval_requests
  WHERE id = NEW.approval_request_id;

  SELECT title INTO definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  notification_type := COALESCE(public.classify_review_assignment_notification_type(NEW.definition_id), 'assigned_definition_review');

  IF NEW.reviewer_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.reviewer_user_id,
      notification_type,
      request_record.requested_by,
      'review_assignment',
      NEW.id,
      'definition',
      NEW.definition_id,
      CASE WHEN notification_type = 'assigned_change_review' THEN 'You were assigned to review changes' ELSE 'You were assigned to review a definition' END,
      CASE WHEN notification_type = 'assigned_change_review' THEN format('You were assigned to review changes to "%s".', definition_title) ELSE format('You were assigned to review "%s".', definition_title) END,
      format('/definitions/%s', NEW.definition_id),
      jsonb_build_object('approval_request_id', NEW.approval_request_id, 'assignment_id', NEW.id, 'definition_title', definition_title),
      format('review-assignment:%s:%s', NEW.id, NEW.reviewer_user_id)
    );
  ELSE
    PERFORM public.create_notification(
      p.user_id,
      notification_type,
      request_record.requested_by,
      'review_assignment',
      NEW.id,
      'definition',
      NEW.definition_id,
      CASE WHEN notification_type = 'assigned_change_review' THEN 'Your team was assigned to review changes' ELSE 'Your team was assigned to review a definition' END,
      CASE WHEN notification_type = 'assigned_change_review' THEN format('Your team "%s" was assigned to review changes to "%s".', NEW.reviewer_team, definition_title) ELSE format('Your team "%s" was assigned to review "%s".', NEW.reviewer_team, definition_title) END,
      format('/definitions/%s', NEW.definition_id),
      jsonb_build_object('approval_request_id', NEW.approval_request_id, 'assignment_id', NEW.id, 'definition_title', definition_title, 'reviewer_team', NEW.reviewer_team),
      format('review-assignment:%s:%s', NEW.id, p.user_id)
    )
    FROM public.profiles AS p
    WHERE lower(btrim(COALESCE(p.team, ''))) = lower(btrim(COALESCE(NEW.reviewer_team, '')))
      AND p.user_id IS DISTINCT FROM request_record.requested_by;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_requester_on_review_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  definition_title text;
BEGIN
  IF COALESCE(OLD.status::text, '') = COALESCE(NEW.status::text, '')
     OR NEW.status <> 'approved'::public.workflow_status THEN
    RETURN NEW;
  END IF;

  SELECT title INTO definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  PERFORM public.create_notification(
    NEW.requested_by,
    'review_request_incorporated',
    NEW.reviewed_by,
    'approval_request',
    NEW.id,
    'definition',
    NEW.definition_id,
    'Your review request was incorporated',
    format('"%s" was approved and the requested review was incorporated.', COALESCE(definition_title, 'The definition')),
    format('/definitions/%s', NEW.definition_id),
    jsonb_build_object('approval_request_id', NEW.id, 'definition_title', definition_title, 'status', NEW.status),
    format('review-request-incorporated:%s:%s', NEW.id, NEW.updated_at)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_definition_owner_on_comment ON public.comments;
DROP TRIGGER IF EXISTS notify_comment_insert ON public.comments;
CREATE TRIGGER notify_comment_insert
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_users_on_comment_insert();

DROP TRIGGER IF EXISTS notify_comment_resolution ON public.comments;
CREATE TRIGGER notify_comment_resolution
AFTER UPDATE OF is_resolved ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_users_on_comment_resolution();

DROP TRIGGER IF EXISTS notify_definition_favoriters_on_update ON public.definitions;
DROP TRIGGER IF EXISTS notify_ontology_favoriters_on_update ON public.ontologies;
DROP TRIGGER IF EXISTS notify_definition_relationships_on_change ON public.relationships;
DROP TRIGGER IF EXISTS notify_followers_on_activity_event ON public.activity_events;
CREATE TRIGGER notify_followers_on_activity_event
AFTER INSERT ON public.activity_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_followers_on_activity_event();

DROP TRIGGER IF EXISTS notify_review_assignment_insert ON public.approval_request_assignments;
CREATE TRIGGER notify_review_assignment_insert
AFTER INSERT ON public.approval_request_assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_users_on_review_assignment();

DROP TRIGGER IF EXISTS notify_review_request_approved ON public.approval_requests;
CREATE TRIGGER notify_review_request_approved
AFTER UPDATE OF status ON public.approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_requester_on_review_approved();

DROP FUNCTION IF EXISTS public.notify_definition_owner_on_comment();
DROP FUNCTION IF EXISTS public.notify_definition_favoriters_on_update();
DROP FUNCTION IF EXISTS public.notify_definition_favoriters_on_relationship_change();
DROP FUNCTION IF EXISTS public.notify_ontology_favoriters_on_update();

GRANT EXECUTE ON FUNCTION public.is_notification_enabled(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, uuid, text, uuid, text, uuid, text, text, text, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_notifications(integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_notification_read_state(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_my_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_notification_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_notification_preference(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_review_assignment_notification_type(uuid) TO authenticated;
