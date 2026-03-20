CREATE OR REPLACE FUNCTION public.normalize_app_role(_role text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized_role text := lower(btrim(coalesce(_role, '')));
BEGIN
  CASE normalized_role
    WHEN 'admin' THEN RETURN 'admin';
    WHEN 'editor' THEN RETURN 'editor';
    WHEN 'reviewer' THEN RETURN 'editor';
    WHEN 'viewer' THEN RETURN 'viewer';
    ELSE RETURN 'viewer';
  END CASE;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    EXECUTE $sync_profiles_roles$
      INSERT INTO public.user_roles (user_id, role)
      SELECT
        profile.user_id,
        CASE public.normalize_app_role(profile.role)
          WHEN 'admin' THEN 'admin'::public.app_role
          WHEN 'editor' THEN 'editor'::public.app_role
          ELSE 'viewer'::public.app_role
        END
      FROM public.profiles AS profile
      WHERE profile.user_id IS NOT NULL
      ON CONFLICT (user_id, role) DO NOTHING
    $sync_profiles_roles$;
  END IF;
END;
$$;

WITH canonical_roles AS (
  SELECT
    user_role.user_id,
    CASE
      WHEN bool_or(user_role.role::text = 'admin') THEN 'admin'
      WHEN bool_or(user_role.role::text IN ('editor', 'reviewer')) THEN 'editor'
      ELSE 'viewer'
    END AS canonical_role
  FROM public.user_roles AS user_role
  GROUP BY user_role.user_id
)
DELETE FROM public.user_roles AS user_role
USING canonical_roles
WHERE canonical_roles.user_id = user_role.user_id
  AND user_role.role::text IN ('viewer', 'editor', 'admin', 'reviewer')
  AND user_role.role::text <> canonical_roles.canonical_role;

WITH canonical_roles AS (
  SELECT
    user_role.user_id,
    CASE
      WHEN bool_or(user_role.role::text = 'admin') THEN 'admin'
      WHEN bool_or(user_role.role::text IN ('editor', 'reviewer')) THEN 'editor'
      ELSE 'viewer'
    END AS canonical_role
  FROM public.user_roles AS user_role
  GROUP BY user_role.user_id
)
INSERT INTO public.user_roles (user_id, role)
SELECT
  canonical_roles.user_id,
  canonical_roles.canonical_role::public.app_role
FROM canonical_roles
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  normalized_role text := public.normalize_app_role(NEW.raw_user_meta_data->>'requested_role');
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, normalized_role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_role();

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = _user_id
        AND user_role.role::text = 'admin'
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = _user_id
        AND user_role.role::text IN ('editor', 'reviewer')
    ) THEN 'editor'
    ELSE 'viewer'
  END
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(_user_id) = public.normalize_app_role(_role::text)
$$;

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
