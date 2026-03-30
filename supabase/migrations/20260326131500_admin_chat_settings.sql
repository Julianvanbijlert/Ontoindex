ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS chat_llm_provider text NOT NULL DEFAULT 'deepseek',
  ADD COLUMN IF NOT EXISTS chat_llm_model text NOT NULL DEFAULT 'deepseek-chat',
  ADD COLUMN IF NOT EXISTS chat_llm_base_url text,
  ADD COLUMN IF NOT EXISTS chat_llm_temperature double precision NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS chat_llm_max_tokens integer NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS chat_similarity_expansion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_strict_citations_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_history_limit integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS chat_max_evidence_items integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS chat_runtime_temperature double precision NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS chat_runtime_max_tokens integer NOT NULL DEFAULT 700;

UPDATE public.app_settings
SET
  chat_llm_provider = lower(coalesce(nullif(chat_llm_provider, ''), 'deepseek')),
  chat_llm_model = CASE
    WHEN lower(coalesce(nullif(chat_llm_provider, ''), 'deepseek')) = 'mock' THEN coalesce(nullif(chat_llm_model, ''), 'mock-grounded-chat')
    ELSE coalesce(nullif(chat_llm_model, ''), 'deepseek-chat')
  END,
  chat_llm_base_url = CASE
    WHEN lower(coalesce(nullif(chat_llm_provider, ''), 'deepseek')) = 'deepseek' THEN coalesce(nullif(chat_llm_base_url, ''), 'https://api.deepseek.com')
    ELSE nullif(chat_llm_base_url, '')
  END,
  chat_llm_temperature = greatest(coalesce(chat_llm_temperature, 0.2), 0),
  chat_llm_max_tokens = greatest(coalesce(chat_llm_max_tokens, 700), 1),
  chat_history_limit = greatest(coalesce(chat_history_limit, 12), 1),
  chat_max_evidence_items = greatest(coalesce(chat_max_evidence_items, 6), 1),
  chat_runtime_temperature = greatest(coalesce(chat_runtime_temperature, 0.2), 0),
  chat_runtime_max_tokens = greatest(coalesce(chat_runtime_max_tokens, 700), 1)
WHERE id = 1;

CREATE TABLE IF NOT EXISTS public.app_setting_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  chat_llm_api_key text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_setting_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_setting_secrets (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "App settings viewable by authenticated" ON public.app_settings;
DROP POLICY IF EXISTS "Admins view app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Service role manages app settings" ON public.app_settings;

CREATE POLICY "Admins view app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages app settings"
ON public.app_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view app setting secrets" ON public.app_setting_secrets;
DROP POLICY IF EXISTS "Admins manage app setting secrets" ON public.app_setting_secrets;
DROP POLICY IF EXISTS "Service role manages app setting secrets" ON public.app_setting_secrets;

CREATE POLICY "Admins view app setting secrets"
ON public.app_setting_secrets
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage app setting secrets"
ON public.app_setting_secrets
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages app setting secrets"
ON public.app_setting_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_app_setting_secrets_updated_at ON public.app_setting_secrets;
CREATE TRIGGER update_app_setting_secrets_updated_at
BEFORE UPDATE ON public.app_setting_secrets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_chat_runtime_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'similarityExpansion', coalesce(app_settings.chat_similarity_expansion_enabled, true),
    'strictCitationsDefault', coalesce(app_settings.chat_strict_citations_default, true),
    'historyMessageLimit', greatest(coalesce(app_settings.chat_history_limit, 12), 1),
    'maxEvidenceItems', greatest(coalesce(app_settings.chat_max_evidence_items, 6), 1),
    'answerTemperature', greatest(coalesce(app_settings.chat_runtime_temperature, app_settings.chat_llm_temperature, 0.2), 0),
    'maxAnswerTokens', greatest(coalesce(app_settings.chat_runtime_max_tokens, app_settings.chat_llm_max_tokens, 700), 1)
  )
  FROM public.app_settings AS app_settings
  WHERE app_settings.id = 1
$$;

CREATE OR REPLACE FUNCTION public.get_admin_chat_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.app_settings%ROWTYPE;
  secrets_row public.app_setting_secrets%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO settings_row
  FROM public.app_settings
  WHERE id = 1;

  SELECT *
  INTO secrets_row
  FROM public.app_setting_secrets
  WHERE id = 1;

  RETURN jsonb_build_object(
    'provider', jsonb_build_object(
      'llmProvider', coalesce(settings_row.chat_llm_provider, 'deepseek'),
      'llmModel', coalesce(
        settings_row.chat_llm_model,
        CASE
          WHEN coalesce(settings_row.chat_llm_provider, 'deepseek') = 'mock' THEN 'mock-grounded-chat'
          ELSE 'deepseek-chat'
        END
      ),
      'llmBaseUrl', CASE
        WHEN coalesce(settings_row.chat_llm_provider, 'deepseek') = 'deepseek' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.deepseek.com')
        ELSE settings_row.chat_llm_base_url
      END,
      'llmTemperature', greatest(coalesce(settings_row.chat_llm_temperature, 0.2), 0),
      'llmMaxTokens', greatest(coalesce(settings_row.chat_llm_max_tokens, 700), 1),
      'apiKeyConfigured', coalesce(nullif(secrets_row.chat_llm_api_key, ''), '') <> '',
      'apiKeyMasked', CASE
        WHEN coalesce(nullif(secrets_row.chat_llm_api_key, ''), '') = '' THEN NULL
        ELSE 'Configured'
      END,
      'apiKeyUpdatedAt', secrets_row.updated_at
    ),
    'runtime', jsonb_build_object(
      'enableSimilarityExpansion', coalesce(settings_row.chat_similarity_expansion_enabled, true),
      'strictCitationsDefault', coalesce(settings_row.chat_strict_citations_default, true),
      'historyLimit', greatest(coalesce(settings_row.chat_history_limit, 12), 1),
      'maxEvidenceItems', greatest(coalesce(settings_row.chat_max_evidence_items, 6), 1),
      'temperature', greatest(coalesce(settings_row.chat_runtime_temperature, 0.2), 0),
      'maxTokens', greatest(coalesce(settings_row.chat_runtime_max_tokens, 700), 1)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_chat_settings(
  _settings jsonb DEFAULT '{}'::jsonb,
  _api_key text DEFAULT NULL,
  _clear_api_key boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_provider text;
  next_model text;
  next_base_url text;
  next_llm_temperature double precision;
  next_llm_max_tokens integer;
  next_similarity_enabled boolean;
  next_strict_citations boolean;
  next_history_limit integer;
  next_max_evidence_items integer;
  next_runtime_temperature double precision;
  next_runtime_max_tokens integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'deepseek')),
    coalesce(
      nullif(_settings #>> '{provider,llmModel}', ''),
      app_settings.chat_llm_model,
      CASE
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'deepseek')) = 'mock' THEN 'mock-grounded-chat'
        ELSE 'deepseek-chat'
      END
    ),
    CASE
      WHEN nullif(_settings #>> '{provider,llmBaseUrl}', '') IS NOT NULL THEN nullif(_settings #>> '{provider,llmBaseUrl}', '')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'deepseek')) = 'deepseek'
        THEN coalesce(nullif(app_settings.chat_llm_base_url, ''), 'https://api.deepseek.com')
      ELSE nullif(app_settings.chat_llm_base_url, '')
    END,
    greatest(coalesce((_settings #>> '{provider,llmTemperature}')::double precision, app_settings.chat_llm_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{provider,llmMaxTokens}')::integer, app_settings.chat_llm_max_tokens, 700), 1),
    coalesce((_settings #>> '{runtime,enableSimilarityExpansion}')::boolean, app_settings.chat_similarity_expansion_enabled, true),
    coalesce((_settings #>> '{runtime,strictCitationsDefault}')::boolean, app_settings.chat_strict_citations_default, true),
    greatest(coalesce((_settings #>> '{runtime,historyLimit}')::integer, app_settings.chat_history_limit, 12), 1),
    greatest(coalesce((_settings #>> '{runtime,maxEvidenceItems}')::integer, app_settings.chat_max_evidence_items, 6), 1),
    greatest(coalesce((_settings #>> '{runtime,temperature}')::double precision, app_settings.chat_runtime_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{runtime,maxTokens}')::integer, app_settings.chat_runtime_max_tokens, 700), 1)
  INTO
    next_provider,
    next_model,
    next_base_url,
    next_llm_temperature,
    next_llm_max_tokens,
    next_similarity_enabled,
    next_strict_citations,
    next_history_limit,
    next_max_evidence_items,
    next_runtime_temperature,
    next_runtime_max_tokens
  FROM public.app_settings AS app_settings
  WHERE app_settings.id = 1;

  IF next_provider NOT IN ('deepseek', 'mock', 'openai', 'openai-compatible', 'anthropic') THEN
    RAISE EXCEPTION 'Unsupported LLM provider'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.app_settings
  SET
    chat_llm_provider = next_provider,
    chat_llm_model = next_model,
    chat_llm_base_url = next_base_url,
    chat_llm_temperature = next_llm_temperature,
    chat_llm_max_tokens = next_llm_max_tokens,
    chat_similarity_expansion_enabled = next_similarity_enabled,
    chat_strict_citations_default = next_strict_citations,
    chat_history_limit = next_history_limit,
    chat_max_evidence_items = next_max_evidence_items,
    chat_runtime_temperature = next_runtime_temperature,
    chat_runtime_max_tokens = next_runtime_max_tokens,
    updated_by = auth.uid()
  WHERE id = 1;

  IF _clear_api_key THEN
    UPDATE public.app_setting_secrets
    SET
      chat_llm_api_key = NULL,
      updated_by = auth.uid()
    WHERE id = 1;
  ELSIF nullif(btrim(coalesce(_api_key, '')), '') IS NOT NULL THEN
    UPDATE public.app_setting_secrets
    SET
      chat_llm_api_key = btrim(_api_key),
      updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  RETURN public.get_admin_chat_settings();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_runtime_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_chat_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_chat_settings(jsonb, text, boolean) TO authenticated;
