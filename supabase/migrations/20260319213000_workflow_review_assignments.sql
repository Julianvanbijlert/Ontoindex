CREATE TYPE public.review_assignment_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE public.approval_request_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE CASCADE NOT NULL,
  definition_id UUID REFERENCES public.definitions(id) ON DELETE CASCADE NOT NULL,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_team TEXT,
  status public.review_assignment_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_message TEXT DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_request_assignments_target_check CHECK (num_nonnulls(reviewer_user_id, reviewer_team) = 1),
  CONSTRAINT approval_request_assignments_unique_user UNIQUE (approval_request_id, reviewer_user_id),
  CONSTRAINT approval_request_assignments_unique_team UNIQUE (approval_request_id, reviewer_team)
);

ALTER TABLE public.approval_request_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments viewable by authenticated"
ON public.approval_request_assignments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System inserts assignments"
ON public.approval_request_assignments
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "System updates assignments"
ON public.approval_request_assignments
FOR UPDATE
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.upsert_definition_review_request(
  _definition_id uuid,
  _message text DEFAULT '',
  _reviewer_user_ids uuid[] DEFAULT '{}'::uuid[],
  _reviewer_teams text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  request_record public.approval_requests%ROWTYPE;
  definition_record public.definitions%ROWTYPE;
  normalized_team text;
  reviewer_user_id uuid;
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
    RAISE EXCEPTION 'Only editors or admins can assign reviewers';
  END IF;

  IF coalesce(array_length(_reviewer_user_ids, 1), 0) = 0
     AND coalesce(array_length(_reviewer_teams, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assign at least one reviewer user or team';
  END IF;

  SELECT *
  INTO request_record
  FROM public.approval_requests
  WHERE definition_id = _definition_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF request_record.id IS NULL THEN
    INSERT INTO public.approval_requests (
      definition_id,
      requested_by,
      message,
      status,
      review_message
    )
    VALUES (
      _definition_id,
      current_user_id,
      coalesce(_message, ''),
      'in_review',
      ''
    )
    RETURNING * INTO request_record;
  ELSE
    UPDATE public.approval_requests
    SET
      requested_by = current_user_id,
      message = coalesce(_message, ''),
      status = 'in_review',
      reviewed_by = NULL,
      review_message = '',
      updated_at = now()
    WHERE id = request_record.id
    RETURNING * INTO request_record;

    DELETE FROM public.approval_request_assignments
    WHERE approval_request_id = request_record.id;
  END IF;

  UPDATE public.definitions
  SET status = 'in_review'
  WHERE id = _definition_id;

  FOREACH reviewer_user_id IN ARRAY (
    SELECT ARRAY(
      SELECT DISTINCT reviewer_id
      FROM unnest(coalesce(_reviewer_user_ids, '{}'::uuid[])) AS reviewer_id
      WHERE reviewer_id IS NOT NULL
        AND reviewer_id <> current_user_id
    )
  ) LOOP
    INSERT INTO public.approval_request_assignments (
      approval_request_id,
      definition_id,
      reviewer_user_id
    )
    VALUES (
      request_record.id,
      _definition_id,
      reviewer_user_id
    );

    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      reviewer_user_id,
      'review_assignment',
      'Definition review requested',
      format('You were assigned to review "%s".', definition_record.title),
      format('/definitions/%s', _definition_id)
    );
  END LOOP;

  FOREACH normalized_team IN ARRAY (
    SELECT ARRAY(
      SELECT DISTINCT btrim(team_name)
      FROM unnest(coalesce(_reviewer_teams, '{}'::text[])) AS team_name
      WHERE btrim(team_name) <> ''
    )
  ) LOOP
    INSERT INTO public.approval_request_assignments (
      approval_request_id,
      definition_id,
      reviewer_team
    )
    VALUES (
      request_record.id,
      _definition_id,
      normalized_team
    );

    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT
      profiles.user_id,
      'review_assignment',
      'Definition review requested',
      format('Your team "%s" was assigned to review "%s".', normalized_team, definition_record.title),
      format('/definitions/%s', _definition_id)
    FROM public.profiles AS profiles
    WHERE lower(btrim(coalesce(profiles.team, ''))) = lower(normalized_team)
      AND profiles.user_id <> current_user_id;
  END LOOP;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    current_user_id,
    'requested_review',
    'definition',
    _definition_id,
    definition_record.title,
    jsonb_build_object(
      'approval_request_id', request_record.id,
      'reviewer_user_count', coalesce(array_length(_reviewer_user_ids, 1), 0),
      'reviewer_team_count', coalesce(array_length(_reviewer_teams, 1), 0)
    )
  );

  RETURN jsonb_build_object(
    'approvalRequestId', request_record.id,
    'definitionId', _definition_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_definition_review_request(uuid, text, uuid[], text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_review_assignment_decision(
  _assignment_id uuid,
  _decision public.review_assignment_status,
  _review_message text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  assignment_record public.approval_request_assignments%ROWTYPE;
  definition_record public.definitions%ROWTYPE;
  current_team text;
  pending_count integer;
  rejected_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review decision';
  END IF;

  SELECT *
  INTO assignment_record
  FROM public.approval_request_assignments
  WHERE id = _assignment_id;

  IF assignment_record.id IS NULL THEN
    RAISE EXCEPTION 'Review assignment not found';
  END IF;

  SELECT team
  INTO current_team
  FROM public.profiles
  WHERE user_id = current_user_id;

  IF NOT (
    public.has_role(current_user_id, 'admin')
    OR assignment_record.reviewer_user_id = current_user_id
    OR (
      assignment_record.reviewer_team IS NOT NULL
      AND lower(btrim(coalesce(current_team, ''))) = lower(btrim(assignment_record.reviewer_team))
    )
  ) THEN
    RAISE EXCEPTION 'You are not assigned to review this definition';
  END IF;

  UPDATE public.approval_request_assignments
  SET
    status = _decision,
    reviewed_by = current_user_id,
    review_message = coalesce(_review_message, ''),
    reviewed_at = now()
  WHERE id = _assignment_id
  RETURNING * INTO assignment_record;

  SELECT *
  INTO definition_record
  FROM public.definitions
  WHERE id = assignment_record.definition_id;

  SELECT count(*)
  INTO pending_count
  FROM public.approval_request_assignments
  WHERE approval_request_id = assignment_record.approval_request_id
    AND status = 'pending';

  SELECT count(*)
  INTO rejected_count
  FROM public.approval_request_assignments
  WHERE approval_request_id = assignment_record.approval_request_id
    AND status = 'rejected';

  IF rejected_count > 0 THEN
    UPDATE public.approval_requests
    SET
      status = 'rejected',
      reviewed_by = current_user_id,
      review_message = coalesce(_review_message, ''),
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = 'rejected'
    WHERE id = assignment_record.definition_id;
  ELSIF pending_count = 0 THEN
    UPDATE public.approval_requests
    SET
      status = 'approved',
      reviewed_by = current_user_id,
      review_message = coalesce(_review_message, ''),
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = 'approved'
    WHERE id = assignment_record.definition_id;
  ELSE
    UPDATE public.approval_requests
    SET
      status = 'in_review',
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = 'in_review'
    WHERE id = assignment_record.definition_id;
  END IF;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    current_user_id,
    CASE WHEN _decision = 'accepted' THEN 'accepted_review' ELSE 'rejected_review' END,
    'definition',
    assignment_record.definition_id,
    definition_record.title,
    jsonb_build_object('assignment_id', assignment_record.id, 'approval_request_id', assignment_record.approval_request_id)
  );

  RETURN jsonb_build_object(
    'assignmentId', assignment_record.id,
    'definitionId', assignment_record.definition_id,
    'decision', _decision
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_review_assignment_decision(uuid, public.review_assignment_status, text) TO authenticated;
