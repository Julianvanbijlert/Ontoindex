CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context_summary TEXT,
  context_embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.search_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own search sessions"
  ON public.search_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own search sessions"
  ON public.search_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own search sessions"
  ON public.search_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own search sessions"
  ON public.search_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages search sessions"
  ON public.search_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_search_session_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.last_seen_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_search_sessions_last_seen
BEFORE UPDATE ON public.search_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_search_session_last_seen();

CREATE INDEX search_sessions_user_last_seen_idx
  ON public.search_sessions (user_id, last_seen_at DESC);

CREATE INDEX search_sessions_created_at_idx
  ON public.search_sessions (created_at DESC);

CREATE INDEX search_sessions_metadata_idx
  ON public.search_sessions USING gin(metadata);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
    EXECUTE 'CREATE INDEX search_sessions_context_embedding_ann_idx ON public.search_sessions USING hnsw (context_embedding vector_cosine_ops) WHERE context_embedding IS NOT NULL';
  ELSE
    EXECUTE 'CREATE INDEX search_sessions_context_embedding_ann_idx ON public.search_sessions USING ivfflat (context_embedding vector_cosine_ops) WITH (lists = 32) WHERE context_embedding IS NOT NULL';
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    NULL;
END;
$$;

CREATE TABLE public.search_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  query_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.search_session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own search session events"
  ON public.search_session_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own search session events"
  ON public.search_session_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.search_sessions
      WHERE search_sessions.id = session_id
        AND search_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own search session events"
  ON public.search_session_events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.search_sessions
      WHERE search_sessions.id = session_id
        AND search_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own search session events"
  ON public.search_session_events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages search session events"
  ON public.search_session_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX search_session_events_session_created_idx
  ON public.search_session_events (session_id, created_at DESC);

CREATE INDEX search_session_events_user_created_idx
  ON public.search_session_events (user_id, created_at DESC);

CREATE INDEX search_session_events_event_type_created_idx
  ON public.search_session_events (event_type, created_at DESC);

CREATE INDEX search_session_events_entity_idx
  ON public.search_session_events (entity_type, entity_id, created_at DESC);

CREATE INDEX search_session_events_metadata_idx
  ON public.search_session_events USING gin(metadata);

CREATE TABLE public.user_context_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preference_key)
);

ALTER TABLE public.user_context_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own context preferences"
  ON public.user_context_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own context preferences"
  ON public.user_context_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own context preferences"
  ON public.user_context_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own context preferences"
  ON public.user_context_preferences
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages user context preferences"
  ON public.user_context_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_user_context_preferences_updated_at
BEFORE UPDATE ON public.user_context_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX user_context_preferences_updated_idx
  ON public.user_context_preferences (user_id, updated_at DESC);

ALTER TABLE public.activity_events
  ADD COLUMN session_id UUID REFERENCES public.search_sessions(id) ON DELETE SET NULL,
  ADD COLUMN event_type TEXT NOT NULL DEFAULT 'activity',
  ADD COLUMN is_tombstone BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.classify_activity_event_type(_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(_action, '')) IN ('search', 'searched') THEN 'search'
    WHEN lower(coalesce(_action, '')) IN ('view', 'viewed', 'open', 'opened') THEN 'view'
    WHEN lower(coalesce(_action, '')) IN ('click', 'clicked') THEN 'click'
    WHEN lower(coalesce(_action, '')) IN ('save', 'saved', 'favorite', 'favorited', 'bookmarked') THEN 'save'
    WHEN lower(coalesce(_action, '')) IN ('like', 'liked') THEN 'like'
    WHEN lower(coalesce(_action, '')) IN ('comment', 'commented') THEN 'comment'
    WHEN lower(coalesce(_action, '')) IN ('review_assign', 'review_assigned', 'assigned_for_review') THEN 'review_assign'
    WHEN lower(coalesce(_action, '')) IN ('delete', 'deleted', 'remove', 'removed') THEN 'tombstone'
    ELSE 'activity'
  END
$$;

CREATE OR REPLACE FUNCTION public.apply_activity_event_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IS NULL OR NEW.event_type = 'activity' THEN
    NEW.event_type := public.classify_activity_event_type(NEW.action);
  END IF;

  IF NEW.event_type = 'tombstone' THEN
    NEW.is_tombstone := true;
    NEW.details := coalesce(NEW.details, '{}'::jsonb) || jsonb_build_object(
      'tombstone', true,
      'tombstone_recorded_at', coalesce(NEW.created_at, now())
    );
  ELSIF NEW.is_tombstone IS NULL THEN
    NEW.is_tombstone := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_activity_event_defaults ON public.activity_events;
CREATE TRIGGER set_activity_event_defaults
BEFORE INSERT OR UPDATE ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.apply_activity_event_defaults();

UPDATE public.activity_events
SET
  event_type = public.classify_activity_event_type(action),
  is_tombstone = public.classify_activity_event_type(action) = 'tombstone',
  details = CASE
    WHEN public.classify_activity_event_type(action) = 'tombstone'
      THEN coalesce(details, '{}'::jsonb) || jsonb_build_object('tombstone', true)
    ELSE details
  END
WHERE event_type = 'activity'
   OR event_type IS NULL
   OR (
     is_tombstone = false
     AND public.classify_activity_event_type(action) = 'tombstone'
   );

CREATE INDEX activity_events_user_event_created_idx
  ON public.activity_events (user_id, event_type, created_at DESC);

CREATE INDEX activity_events_session_created_idx
  ON public.activity_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX activity_events_tombstone_idx
  ON public.activity_events (entity_type, entity_id, created_at DESC)
  WHERE is_tombstone = true;

INSERT INTO public.user_context_preferences (user_id, preference_key, enabled)
SELECT profiles.user_id, preference.preference_key, true
FROM public.profiles
CROSS JOIN (
  VALUES
    ('context_personalization_enabled'),
    ('context_use_profile'),
    ('context_use_device_location')
) AS preference(preference_key)
ON CONFLICT (user_id, preference_key) DO NOTHING;
