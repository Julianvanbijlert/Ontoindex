DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_my_role(_target_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_role text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _target_role::text NOT IN ('viewer', 'editor', 'admin') THEN
    RAISE EXCEPTION 'Unsupported role selection';
  END IF;

  normalized_role := public.normalize_app_role(_target_role::text);

  DELETE FROM public.user_roles
  WHERE user_id = current_user_id
    AND role::text IN ('viewer', 'editor', 'admin', 'reviewer');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, normalized_role::public.app_role);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', current_user_id,
    'role', normalized_role,
    'message', 'Role updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_role(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user_access(
  _target_user_id uuid,
  _target_role public.app_role,
  _team text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_role text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(current_user_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user required';
  END IF;

  IF _target_role::text NOT IN ('viewer', 'editor', 'admin') THEN
    RAISE EXCEPTION 'Unsupported role selection';
  END IF;

  normalized_role := public.normalize_app_role(_target_role::text);

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id
    AND role::text IN ('viewer', 'editor', 'admin', 'reviewer');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, normalized_role::public.app_role);

  UPDATE public.profiles
  SET
    team = COALESCE(_team, team),
    updated_at = now()
  WHERE user_id = _target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _target_user_id,
    'role', normalized_role,
    'team', _team,
    'message', 'User role updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_access(uuid, public.app_role, text) TO authenticated;
