INSERT INTO public.app_settings (id, allow_self_role_change)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_setting_secrets (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

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

  INSERT INTO public.app_settings (id, allow_self_role_change)
  VALUES (1, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.app_setting_secrets (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

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

GRANT EXECUTE ON FUNCTION public.update_admin_chat_settings(jsonb, text, boolean) TO authenticated;
