CREATE OR REPLACE FUNCTION public.fetch_my_recent_activity(_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  entity_title text,
  user_id uuid,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  safe_limit integer := LEAST(GREATEST(COALESCE(_limit, 30), 1), 100);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    activity_events.id,
    activity_events.action,
    activity_events.entity_type,
    activity_events.entity_id,
    activity_events.entity_title,
    activity_events.user_id,
    activity_events.details,
    activity_events.created_at
  FROM public.activity_events
  WHERE activity_events.user_id = current_user_id
  ORDER BY activity_events.created_at DESC
  LIMIT safe_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_my_recent_activity(integer) TO authenticated;
