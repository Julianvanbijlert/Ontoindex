DROP POLICY IF EXISTS "Approval requests viewable" ON public.approval_requests;
DROP POLICY IF EXISTS "Editors can request approval" ON public.approval_requests;
DROP POLICY IF EXISTS "Reviewers can update approvals" ON public.approval_requests;

CREATE POLICY "Editors and admins can view approval requests"
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can insert approval requests"
ON public.approval_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Editors and admins can update approval requests"
ON public.approval_requests
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

DROP POLICY IF EXISTS "Assignments viewable by authenticated" ON public.approval_request_assignments;
DROP POLICY IF EXISTS "System inserts assignments" ON public.approval_request_assignments;
DROP POLICY IF EXISTS "System updates assignments" ON public.approval_request_assignments;

CREATE POLICY "Editors and admins can view approval assignments"
ON public.approval_request_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can insert approval assignments"
ON public.approval_request_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can update approval assignments"
ON public.approval_request_assignments
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
  previous_status public.workflow_status;
  reviewer_user_count integer := 0;
  reviewer_team_count integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'Only editors or admins can access workflow';
  END IF;

  SELECT *
  INTO definition_record
  FROM public.definitions
  WHERE id = _definition_id;

  IF definition_record.id IS NULL THEN
    RAISE EXCEPTION 'Definition not found';
  END IF;

  previous_status := definition_record.status;

  IF coalesce(array_length(_reviewer_user_ids, 1), 0) = 0
     AND coalesce(array_length(_reviewer_teams, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assign at least one reviewer user or team';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = ANY(coalesce(_reviewer_user_ids, '{}'::uuid[]))
      AND NOT (
        public.has_role(user_id, 'editor')
        OR public.has_role(user_id, 'admin')
      )
  ) THEN
    RAISE EXCEPTION 'Only editors or admins can be assigned as individual reviewers';
  END IF;

  reviewer_user_count := coalesce(array_length(_reviewer_user_ids, 1), 0);
  reviewer_team_count := coalesce(array_length(_reviewer_teams, 1), 0);

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
      AND profiles.user_id <> current_user_id
      AND (
        public.has_role(profiles.user_id, 'editor')
        OR public.has_role(profiles.user_id, 'admin')
      );
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
      'reviewer_user_count', reviewer_user_count,
      'reviewer_team_count', reviewer_team_count,
      'summary',
      format(
        'Requested approval from %s user reviewer(s) and %s team reviewer(s).',
        reviewer_user_count,
        reviewer_team_count
      )
    )
  );

  IF previous_status IS DISTINCT FROM 'in_review'::public.workflow_status THEN
    INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
    VALUES (
      current_user_id,
      'status_changed',
      'definition',
      _definition_id,
      definition_record.title,
      jsonb_build_object(
        'from_status', previous_status,
        'to_status', 'in_review',
        'summary',
        format(
          'Workflow status changed from %s to in review.',
          replace(coalesce(previous_status::text, 'draft'), '_', ' ')
        )
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'approvalRequestId', request_record.id,
    'definitionId', _definition_id
  );
END;
$$;

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
  previous_status public.workflow_status;
  next_status public.workflow_status;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'Only editors or admins can access workflow';
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

  previous_status := definition_record.status;

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
    next_status := 'rejected';

    UPDATE public.approval_requests
    SET
      status = next_status,
      reviewed_by = current_user_id,
      review_message = coalesce(_review_message, ''),
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = next_status
    WHERE id = assignment_record.definition_id;
  ELSIF pending_count = 0 THEN
    next_status := 'approved';

    UPDATE public.approval_requests
    SET
      status = next_status,
      reviewed_by = current_user_id,
      review_message = coalesce(_review_message, ''),
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = next_status
    WHERE id = assignment_record.definition_id;
  ELSE
    next_status := 'in_review';

    UPDATE public.approval_requests
    SET
      status = next_status,
      updated_at = now()
    WHERE id = assignment_record.approval_request_id;

    UPDATE public.definitions
    SET status = next_status
    WHERE id = assignment_record.definition_id;
  END IF;

  INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    current_user_id,
    CASE WHEN _decision = 'accepted' THEN 'accepted_review' ELSE 'rejected_review' END,
    'definition',
    assignment_record.definition_id,
    definition_record.title,
    jsonb_build_object(
      'assignment_id', assignment_record.id,
      'approval_request_id', assignment_record.approval_request_id,
      'summary',
      CASE
        WHEN _decision = 'accepted' THEN 'Accepted the assigned review.'
        ELSE 'Rejected the assigned review.'
      END
    )
  );

  IF previous_status IS DISTINCT FROM next_status THEN
    INSERT INTO public.activity_events (user_id, action, entity_type, entity_id, entity_title, details)
    VALUES (
      current_user_id,
      'status_changed',
      'definition',
      assignment_record.definition_id,
      definition_record.title,
      jsonb_build_object(
        'from_status', previous_status,
        'to_status', next_status,
        'summary',
        format(
          'Workflow status changed from %s to %s.',
          replace(coalesce(previous_status::text, 'draft'), '_', ' '),
          replace(next_status::text, '_', ' ')
        )
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'assignmentId', assignment_record.id,
    'definitionId', assignment_record.definition_id,
    'decision', _decision,
    'status', next_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_definition_review_request(uuid, text, uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_review_assignment_decision(uuid, public.review_assignment_status, text) TO authenticated;
