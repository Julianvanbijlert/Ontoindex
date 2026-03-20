DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;

CREATE POLICY "Users can delete own comments and editors or admins can moderate comments"
ON public.comments
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.delete_comment(_comment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  comment_record public.comments%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO comment_record
  FROM public.comments
  WHERE id = _comment_id;

  IF comment_record.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  IF NOT (
    comment_record.user_id = current_user_id
    OR public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this comment';
  END IF;

  DELETE FROM public.comments
  WHERE id = _comment_id;

  RETURN jsonb_build_object(
    'id', _comment_id,
    'deleted', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_comment_resolved(
  _comment_id uuid,
  _resolved boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  updated_comment public.comments%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(current_user_id, 'editor')
    OR public.has_role(current_user_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to resolve this comment';
  END IF;

  UPDATE public.comments
  SET is_resolved = COALESCE(_resolved, true)
  WHERE id = _comment_id
  RETURNING * INTO updated_comment;

  IF updated_comment.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_comment.id,
    'is_resolved', updated_comment.is_resolved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_comment_resolved(uuid, boolean) TO authenticated;
