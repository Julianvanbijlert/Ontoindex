ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS chat_ai_enabled boolean NOT NULL DEFAULT true;

UPDATE public.app_settings
SET chat_ai_enabled = true
WHERE chat_ai_enabled IS NULL;

ALTER TABLE public.search_documents
  ADD COLUMN IF NOT EXISTS embedding_provider text,
  ADD COLUMN IF NOT EXISTS embedding_dimensions integer;

ALTER TABLE public.search_query_embeddings
  ADD COLUMN IF NOT EXISTS embedding_provider text,
  ADD COLUMN IF NOT EXISTS embedding_dimensions integer;

CREATE OR REPLACE FUNCTION public.get_chat_runtime_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'aiEnabled', coalesce(app_settings.chat_ai_enabled, true),
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
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  settings_row public.app_settings%ROWTYPE;
  secrets_row public.app_setting_secrets%ROWTYPE;
  effective_provider text;
  effective_model text;
  effective_base_url text;
  effective_api_key text;
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

  effective_provider := coalesce(settings_row.chat_llm_provider, 'gemini');
  effective_model := coalesce(
    settings_row.chat_llm_model,
    CASE
      WHEN effective_provider = 'mock' THEN 'mock-grounded-chat'
      WHEN effective_provider = 'deepseek' THEN 'deepseek-chat'
      WHEN effective_provider = 'openai' THEN 'gpt-4.1-mini'
      WHEN effective_provider = 'openai-compatible' THEN 'gpt-4.1-mini'
      WHEN effective_provider = 'anthropic' THEN 'claude-3-5-sonnet-latest'
      ELSE 'gemini-2.0-flash'
    END
  );
  effective_base_url := CASE
    WHEN effective_provider = 'deepseek' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.deepseek.com')
    WHEN effective_provider = 'gemini' THEN coalesce(settings_row.chat_llm_base_url, 'https://generativelanguage.googleapis.com/v1beta')
    WHEN effective_provider = 'openai' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.openai.com/v1')
    WHEN effective_provider = 'anthropic' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.anthropic.com')
    ELSE settings_row.chat_llm_base_url
  END;
  effective_api_key := CASE
    WHEN effective_provider = 'deepseek' THEN coalesce(nullif(secrets_row.chat_llm_api_key, ''), nullif(secrets_row.deepseek_api_key, ''))
    WHEN effective_provider = 'gemini' THEN nullif(secrets_row.gemini_api_key, '')
    WHEN effective_provider IN ('openai', 'openai-compatible', 'anthropic') THEN nullif(secrets_row.chat_llm_api_key, '')
    ELSE null
  END;

  RETURN jsonb_build_object(
    'provider', jsonb_build_object(
      'llmProvider', effective_provider,
      'llmModel', effective_model,
      'llmBaseUrl', effective_base_url,
      'llmTemperature', greatest(coalesce(settings_row.chat_llm_temperature, 0.2), 0),
      'llmMaxTokens', greatest(coalesce(settings_row.chat_llm_max_tokens, 700), 1),
      'apiKeyConfigured', coalesce(effective_api_key, '') <> '',
      'apiKeyMasked', CASE
        WHEN coalesce(effective_api_key, '') = '' THEN NULL
        ELSE 'Configured'
      END,
      'apiKeyUpdatedAt', secrets_row.updated_at
    ),
    'embeddings', jsonb_build_object(
      'embeddingProvider', coalesce(settings_row.embedding_provider, 'gemini'),
      'embeddingModel', coalesce(settings_row.embedding_model, 'gemini-embedding-001'),
      'embeddingBaseUrl', coalesce(settings_row.embedding_base_url, 'https://generativelanguage.googleapis.com/v1beta'),
      'fallbackProvider', coalesce(settings_row.embedding_fallback_provider, 'huggingface'),
      'fallbackModel', coalesce(settings_row.embedding_fallback_model, 'sentence-transformers/all-MiniLM-L6-v2'),
      'fallbackBaseUrl', coalesce(settings_row.embedding_fallback_base_url, 'https://api-inference.huggingface.co/models'),
      'vectorDimensions', greatest(coalesce(settings_row.embedding_vector_dimensions, 1536), 1)
    ),
    'providerKeys', jsonb_build_object(
      'deepseek', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.deepseek_api_key, ''), '') <> '',
        'masked', CASE
          WHEN coalesce(nullif(secrets_row.deepseek_api_key, ''), '') = '' THEN NULL
          ELSE 'Configured'
        END,
        'updatedAt', secrets_row.updated_at
      ),
      'gemini', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.gemini_api_key, ''), '') <> '',
        'masked', CASE
          WHEN coalesce(nullif(secrets_row.gemini_api_key, ''), '') = '' THEN NULL
          ELSE 'Configured'
        END,
        'updatedAt', secrets_row.updated_at
      ),
      'huggingface', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.hf_api_key, ''), '') <> '',
        'masked', CASE
          WHEN coalesce(nullif(secrets_row.hf_api_key, ''), '') = '' THEN NULL
          ELSE 'Configured'
        END,
        'updatedAt', secrets_row.updated_at
      )
    ),
    'runtime', jsonb_build_object(
      'aiEnabled', coalesce(settings_row.chat_ai_enabled, true),
      'enableSimilarityExpansion', coalesce(settings_row.chat_similarity_expansion_enabled, true),
      'strictCitationsDefault', coalesce(settings_row.chat_strict_citations_default, true),
      'historyLimit', greatest(coalesce(settings_row.chat_history_limit, 12), 1),
      'maxEvidenceItems', greatest(coalesce(settings_row.chat_max_evidence_items, 6), 1),
      'temperature', greatest(coalesce(settings_row.chat_runtime_temperature, 0.2), 0),
      'maxTokens', greatest(coalesce(settings_row.chat_runtime_max_tokens, 700), 1)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_admin_chat_settings(_settings jsonb DEFAULT '{}'::jsonb, _api_key text DEFAULT NULL::text, _clear_api_key boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_provider text;
  next_model text;
  next_base_url text;
  next_llm_temperature double precision;
  next_llm_max_tokens integer;
  next_embedding_provider text;
  next_embedding_model text;
  next_embedding_base_url text;
  next_embedding_fallback_provider text;
  next_embedding_fallback_model text;
  next_embedding_fallback_base_url text;
  next_embedding_vector_dimensions integer;
  next_similarity_enabled boolean;
  next_strict_citations boolean;
  next_history_limit integer;
  next_max_evidence_items integer;
  next_runtime_temperature double precision;
  next_runtime_max_tokens integer;
  next_ai_enabled boolean;
  selected_provider text;
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

  selected_provider := lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), 'gemini'));

  SELECT
    lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')),
    coalesce(
      nullif(_settings #>> '{provider,llmModel}', ''),
      app_settings.chat_llm_model,
      CASE
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'mock' THEN 'mock-grounded-chat'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'deepseek' THEN 'deepseek-chat'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'openai' THEN 'gpt-4.1-mini'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'openai-compatible' THEN 'gpt-4.1-mini'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'anthropic' THEN 'claude-3-5-sonnet-latest'
        ELSE 'gemini-2.0-flash'
      END
    ),
    CASE
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'deepseek'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(app_settings.chat_llm_base_url, ''), 'https://api.deepseek.com')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'gemini'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(app_settings.chat_llm_base_url, ''), 'https://generativelanguage.googleapis.com/v1beta')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'openai'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(app_settings.chat_llm_base_url, ''), 'https://api.openai.com/v1')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), app_settings.chat_llm_provider, 'gemini')) = 'anthropic'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(app_settings.chat_llm_base_url, ''), 'https://api.anthropic.com')
      ELSE coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(app_settings.chat_llm_base_url, ''))
    END,
    greatest(coalesce((_settings #>> '{provider,llmTemperature}')::double precision, app_settings.chat_llm_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{provider,llmMaxTokens}')::integer, app_settings.chat_llm_max_tokens, 700), 1),
    lower(coalesce(nullif(_settings #>> '{embeddings,embeddingProvider}', ''), app_settings.embedding_provider, 'gemini')),
    coalesce(nullif(_settings #>> '{embeddings,embeddingModel}', ''), app_settings.embedding_model, 'gemini-embedding-001'),
    coalesce(nullif(_settings #>> '{embeddings,embeddingBaseUrl}', ''), app_settings.embedding_base_url, 'https://generativelanguage.googleapis.com/v1beta'),
    lower(coalesce(nullif(_settings #>> '{embeddings,fallbackProvider}', ''), app_settings.embedding_fallback_provider, 'huggingface')),
    coalesce(nullif(_settings #>> '{embeddings,fallbackModel}', ''), app_settings.embedding_fallback_model, 'sentence-transformers/all-MiniLM-L6-v2'),
    coalesce(nullif(_settings #>> '{embeddings,fallbackBaseUrl}', ''), app_settings.embedding_fallback_base_url, 'https://api-inference.huggingface.co/models'),
    greatest(coalesce((_settings #>> '{embeddings,vectorDimensions}')::integer, app_settings.embedding_vector_dimensions, 1536), 1),
    coalesce((_settings #>> '{runtime,enableSimilarityExpansion}')::boolean, app_settings.chat_similarity_expansion_enabled, true),
    coalesce((_settings #>> '{runtime,strictCitationsDefault}')::boolean, app_settings.chat_strict_citations_default, true),
    greatest(coalesce((_settings #>> '{runtime,historyLimit}')::integer, app_settings.chat_history_limit, 12), 1),
    greatest(coalesce((_settings #>> '{runtime,maxEvidenceItems}')::integer, app_settings.chat_max_evidence_items, 6), 1),
    greatest(coalesce((_settings #>> '{runtime,temperature}')::double precision, app_settings.chat_runtime_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{runtime,maxTokens}')::integer, app_settings.chat_runtime_max_tokens, 700), 1),
    coalesce((_settings #>> '{runtime,aiEnabled}')::boolean, app_settings.chat_ai_enabled, true)
  INTO
    next_provider,
    next_model,
    next_base_url,
    next_llm_temperature,
    next_llm_max_tokens,
    next_embedding_provider,
    next_embedding_model,
    next_embedding_base_url,
    next_embedding_fallback_provider,
    next_embedding_fallback_model,
    next_embedding_fallback_base_url,
    next_embedding_vector_dimensions,
    next_similarity_enabled,
    next_strict_citations,
    next_history_limit,
    next_max_evidence_items,
    next_runtime_temperature,
    next_runtime_max_tokens,
    next_ai_enabled
  FROM public.app_settings AS app_settings
  WHERE app_settings.id = 1;

  IF next_provider NOT IN ('mock', 'deepseek', 'gemini', 'openai', 'openai-compatible', 'anthropic') THEN
    RAISE EXCEPTION 'Unsupported LLM provider'
      USING ERRCODE = '22023';
  END IF;

  IF next_embedding_provider NOT IN ('gemini', 'deepseek', 'huggingface', 'local') THEN
    RAISE EXCEPTION 'Unsupported embedding provider'
      USING ERRCODE = '22023';
  END IF;

  IF next_embedding_fallback_provider NOT IN ('gemini', 'deepseek', 'huggingface', 'local') THEN
    RAISE EXCEPTION 'Unsupported embedding fallback provider'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.app_settings
  SET
    chat_llm_provider = next_provider,
    chat_llm_model = next_model,
    chat_llm_base_url = next_base_url,
    chat_llm_temperature = next_llm_temperature,
    chat_llm_max_tokens = next_llm_max_tokens,
    embedding_provider = next_embedding_provider,
    embedding_model = next_embedding_model,
    embedding_base_url = next_embedding_base_url,
    embedding_fallback_provider = next_embedding_fallback_provider,
    embedding_fallback_model = next_embedding_fallback_model,
    embedding_fallback_base_url = next_embedding_fallback_base_url,
    embedding_vector_dimensions = next_embedding_vector_dimensions,
    chat_similarity_expansion_enabled = next_similarity_enabled,
    chat_strict_citations_default = next_strict_citations,
    chat_history_limit = next_history_limit,
    chat_max_evidence_items = next_max_evidence_items,
    chat_runtime_temperature = next_runtime_temperature,
    chat_runtime_max_tokens = next_runtime_max_tokens,
    chat_ai_enabled = next_ai_enabled,
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

  IF coalesce((_settings #>> '{providerKeys,clearDeepseekApiKey}')::boolean, false) THEN
    UPDATE public.app_setting_secrets
    SET deepseek_api_key = NULL, updated_by = auth.uid()
    WHERE id = 1;
  ELSIF nullif(btrim(coalesce(_settings #>> '{providerKeys,deepseekApiKey}', '')), '') IS NOT NULL THEN
    UPDATE public.app_setting_secrets
    SET deepseek_api_key = btrim(_settings #>> '{providerKeys,deepseekApiKey}'), updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  IF coalesce((_settings #>> '{providerKeys,clearGeminiApiKey}')::boolean, false) THEN
    UPDATE public.app_setting_secrets
    SET gemini_api_key = NULL, updated_by = auth.uid()
    WHERE id = 1;
  ELSIF nullif(btrim(coalesce(_settings #>> '{providerKeys,geminiApiKey}', '')), '') IS NOT NULL THEN
    UPDATE public.app_setting_secrets
    SET gemini_api_key = btrim(_settings #>> '{providerKeys,geminiApiKey}'), updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  IF coalesce((_settings #>> '{providerKeys,clearHuggingFaceApiKey}')::boolean, false) THEN
    UPDATE public.app_setting_secrets
    SET hf_api_key = NULL, updated_by = auth.uid()
    WHERE id = 1;
  ELSIF nullif(btrim(coalesce(_settings #>> '{providerKeys,huggingFaceApiKey}', '')), '') IS NOT NULL THEN
    UPDATE public.app_setting_secrets
    SET hf_api_key = btrim(_settings #>> '{providerKeys,huggingFaceApiKey}'), updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  RETURN public.get_admin_chat_settings();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_chat_runtime_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_chat_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_chat_settings(jsonb, text, boolean) TO authenticated;
