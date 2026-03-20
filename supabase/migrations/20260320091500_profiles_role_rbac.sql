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

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text;

UPDATE public.profiles AS profile
SET role = source.role
FROM (
  SELECT
    profile.user_id,
    CASE
      WHEN bool_or(user_role.role::text = 'admin') THEN 'admin'
      WHEN bool_or(user_role.role::text IN ('editor', 'reviewer')) THEN 'editor'
      ELSE 'viewer'
    END AS role
  FROM public.profiles AS profile
  LEFT JOIN public.user_roles AS user_role
    ON user_role.user_id = profile.user_id
  GROUP BY profile.user_id
) AS source
WHERE source.user_id = profile.user_id;

UPDATE public.profiles
SET role = public.normalize_app_role(role)
WHERE role IS NULL OR role NOT IN ('viewer', 'editor', 'admin');

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'viewer';

ALTER TABLE public.profiles
ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('viewer', 'editor', 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    public.normalize_app_role(NEW.raw_user_meta_data->>'requested_role')
  );
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
  SELECT COALESCE(
    (
      SELECT profile.role
      FROM public.profiles AS profile
      WHERE profile.user_id = _user_id
    ),
    'viewer'
  )
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

  UPDATE public.profiles
  SET
    role = normalized_role,
    updated_at = now()
  WHERE user_id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object('role', normalized_role);
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

  UPDATE public.profiles
  SET
    role = normalized_role,
    team = COALESCE(_team, team),
    updated_at = now()
  WHERE user_id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'role', normalized_role,
    'team', _team
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_access(uuid, public.app_role, text) TO authenticated;
