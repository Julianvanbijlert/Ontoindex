ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS standards_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.app_settings
SET standards_settings = coalesce(standards_settings, '{}'::jsonb)
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.get_standards_runtime_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(app_settings.standards_settings, '{}'::jsonb)
  FROM public.app_settings AS app_settings
  WHERE app_settings.id = 1
$$;

CREATE OR REPLACE FUNCTION public.get_admin_standards_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN coalesce(
    (
      SELECT app_settings.standards_settings
      FROM public.app_settings AS app_settings
      WHERE app_settings.id = 1
    ),
    '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_standards_settings(
  _settings jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_settings
  SET
    standards_settings = coalesce(_settings, '{}'::jsonb),
    updated_by = auth.uid()
  WHERE id = 1;

  RETURN public.get_admin_standards_settings();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_standards_runtime_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_standards_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_standards_settings(jsonb) TO authenticated;
