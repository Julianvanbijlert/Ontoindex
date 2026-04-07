ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS embedding_reindex_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embedding_last_indexed_fingerprint text,
  ADD COLUMN IF NOT EXISTS embedding_last_indexed_at timestamptz;

ALTER TABLE public.search_documents
  ADD COLUMN IF NOT EXISTS embedding_config_fingerprint text;

CREATE OR REPLACE FUNCTION public.default_embedding_model_for_provider(_provider text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(nullif(_provider, ''), 'gemini'))
    WHEN 'huggingface' THEN 'sentence-transformers/all-MiniLM-L6-v2'
    WHEN 'local' THEN 'nomic-embed-text'
    ELSE 'gemini-embedding-001'
  END
$$;

CREATE OR REPLACE FUNCTION public.default_embedding_base_url_for_provider(_provider text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(nullif(_provider, ''), 'gemini'))
    WHEN 'deepseek' THEN 'https://api.deepseek.com'
    WHEN 'huggingface' THEN 'https://api-inference.huggingface.co/models'
    WHEN 'local' THEN 'http://127.0.0.1:11434/v1'
    ELSE 'https://generativelanguage.googleapis.com/v1beta'
  END
$$;

CREATE OR REPLACE FUNCTION public.build_embedding_config_fingerprint(
  _provider text,
  _model text,
  _base_url text,
  _vector_dimensions integer,
  _schema_dimensions integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT concat_ws(
    '|',
    lower(coalesce(nullif(btrim(_provider), ''), 'gemini')),
    lower(coalesce(nullif(btrim(_model), ''), public.default_embedding_model_for_provider(_provider))),
    lower(coalesce(nullif(btrim(_base_url), ''), public.default_embedding_base_url_for_provider(_provider))),
    greatest(coalesce(_vector_dimensions, 1536), 1)::text,
    greatest(coalesce(_schema_dimensions, _vector_dimensions, 1536), 1)::text
  )
$$;

UPDATE public.app_settings
SET
  embedding_last_indexed_fingerprint = coalesce(
    nullif(embedding_last_indexed_fingerprint, ''),
    public.build_embedding_config_fingerprint(
      embedding_provider,
      embedding_model,
      embedding_base_url,
      embedding_vector_dimensions,
      embedding_schema_dimensions
    )
  ),
  embedding_last_indexed_at = coalesce(embedding_last_indexed_at, now()),
  embedding_reindex_required = coalesce(embedding_reindex_required, false);

WITH current_embedding_config AS (
  SELECT public.build_embedding_config_fingerprint(
    embedding_provider,
    embedding_model,
    embedding_base_url,
    embedding_vector_dimensions,
    embedding_schema_dimensions
  ) AS fingerprint
  FROM public.app_settings
  WHERE id = 1
)
UPDATE public.search_documents AS d
SET embedding_config_fingerprint = current_embedding_config.fingerprint
FROM current_embedding_config
WHERE d.embedding IS NOT NULL
  AND d.embedding_config_fingerprint IS NULL;

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
  effective_embedding_provider text;
  effective_embedding_model text;
  effective_embedding_base_url text;
  active_embedding_fingerprint text;
  last_indexed_fingerprint text;
  pending_job_id uuid;
  pending_job_status text;
  reindex_required boolean;
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

  effective_embedding_provider := coalesce(settings_row.embedding_provider, 'gemini');
  effective_embedding_model := coalesce(
    nullif(settings_row.embedding_model, ''),
    public.default_embedding_model_for_provider(effective_embedding_provider)
  );
  effective_embedding_base_url := coalesce(
    nullif(settings_row.embedding_base_url, ''),
    public.default_embedding_base_url_for_provider(effective_embedding_provider)
  );
  active_embedding_fingerprint := public.build_embedding_config_fingerprint(
    effective_embedding_provider,
    effective_embedding_model,
    effective_embedding_base_url,
    greatest(coalesce(settings_row.embedding_vector_dimensions, 1536), 1),
    greatest(coalesce(settings_row.embedding_schema_dimensions, settings_row.embedding_vector_dimensions, 1536), 1)
  );
  last_indexed_fingerprint := coalesce(nullif(settings_row.embedding_last_indexed_fingerprint, ''), active_embedding_fingerprint);

  SELECT job.id, job.status
  INTO pending_job_id, pending_job_status
  FROM public.search_index_jobs AS job
  WHERE job.job_type = 'embed_stale_documents'
    AND job.status IN ('pending', 'processing')
  ORDER BY job.created_at DESC
  LIMIT 1;

  reindex_required := coalesce(settings_row.embedding_reindex_required, false)
    OR last_indexed_fingerprint IS DISTINCT FROM active_embedding_fingerprint;

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
      'embeddingProvider', effective_embedding_provider,
      'embeddingModel', effective_embedding_model,
      'embeddingBaseUrl', effective_embedding_base_url,
      'fallbackProvider', coalesce(settings_row.embedding_fallback_provider, 'huggingface'),
      'fallbackModel', coalesce(settings_row.embedding_fallback_model, 'sentence-transformers/all-MiniLM-L6-v2'),
      'fallbackBaseUrl', coalesce(settings_row.embedding_fallback_base_url, 'https://api-inference.huggingface.co/models'),
      'vectorDimensions', greatest(coalesce(settings_row.embedding_vector_dimensions, 1536), 1),
      'schemaDimensions', greatest(coalesce(settings_row.embedding_schema_dimensions, settings_row.embedding_vector_dimensions, 1536), 1),
      'reindexRequired', reindex_required,
      'lastIndexedFingerprint', last_indexed_fingerprint,
      'lastIndexedAt', settings_row.embedding_last_indexed_at,
      'pendingJobId', pending_job_id,
      'pendingJobStatus', pending_job_status,
      'reindexState', jsonb_build_object(
        'required', reindex_required,
        'status', CASE
          WHEN pending_job_status = 'processing' THEN 'processing'
          WHEN pending_job_status = 'pending' THEN 'queued'
          WHEN reindex_required THEN 'required'
          ELSE 'aligned'
        END,
        'activeFingerprint', active_embedding_fingerprint,
        'lastIndexedFingerprint', last_indexed_fingerprint,
        'lastIndexedAt', settings_row.embedding_last_indexed_at,
        'pendingJobId', pending_job_id,
        'pendingJobStatus', pending_job_status,
        'message', CASE
          WHEN reindex_required THEN 'Search embeddings need to be rebuilt for the active embedding configuration.'
          ELSE NULL
        END
      )
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
  current_settings_row public.app_settings%ROWTYPE;
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
  next_embedding_schema_dimensions integer;
  next_similarity_enabled boolean;
  next_strict_citations boolean;
  next_history_limit integer;
  next_max_evidence_items integer;
  next_runtime_temperature double precision;
  next_runtime_max_tokens integer;
  next_ai_enabled boolean;
  current_embedding_fingerprint text;
  current_last_indexed_fingerprint text;
  next_embedding_fingerprint text;
  next_embedding_reindex_required boolean;
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

  SELECT *
  INTO current_settings_row
  FROM public.app_settings
  WHERE id = 1;

  current_embedding_fingerprint := public.build_embedding_config_fingerprint(
    current_settings_row.embedding_provider,
    current_settings_row.embedding_model,
    current_settings_row.embedding_base_url,
    current_settings_row.embedding_vector_dimensions,
    current_settings_row.embedding_schema_dimensions
  );
  current_last_indexed_fingerprint := coalesce(
    nullif(current_settings_row.embedding_last_indexed_fingerprint, ''),
    current_embedding_fingerprint
  );

  SELECT
    lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')),
    coalesce(
      nullif(_settings #>> '{provider,llmModel}', ''),
      current_settings_row.chat_llm_model,
      CASE
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'mock' THEN 'mock-grounded-chat'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'deepseek' THEN 'deepseek-chat'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'openai' THEN 'gpt-4.1-mini'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'openai-compatible' THEN 'gpt-4.1-mini'
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'anthropic' THEN 'claude-3-5-sonnet-latest'
        ELSE 'gemini-2.0-flash'
      END
    ),
    CASE
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'deepseek'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''), 'https://api.deepseek.com')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'gemini'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''), 'https://generativelanguage.googleapis.com/v1beta')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'openai'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''), 'https://api.openai.com/v1')
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'anthropic'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''), 'https://api.anthropic.com')
      ELSE coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''))
    END,
    greatest(coalesce((_settings #>> '{provider,llmTemperature}')::double precision, current_settings_row.chat_llm_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{provider,llmMaxTokens}')::integer, current_settings_row.chat_llm_max_tokens, 700), 1),
    lower(coalesce(nullif(_settings #>> '{embeddings,embeddingProvider}', ''), current_settings_row.embedding_provider, 'gemini')),
    coalesce(
      nullif(_settings #>> '{embeddings,embeddingModel}', ''),
      nullif(current_settings_row.embedding_model, ''),
      public.default_embedding_model_for_provider(lower(coalesce(nullif(_settings #>> '{embeddings,embeddingProvider}', ''), current_settings_row.embedding_provider, 'gemini')))
    ),
    coalesce(
      nullif(_settings #>> '{embeddings,embeddingBaseUrl}', ''),
      nullif(current_settings_row.embedding_base_url, ''),
      public.default_embedding_base_url_for_provider(lower(coalesce(nullif(_settings #>> '{embeddings,embeddingProvider}', ''), current_settings_row.embedding_provider, 'gemini')))
    ),
    lower(coalesce(nullif(_settings #>> '{embeddings,fallbackProvider}', ''), current_settings_row.embedding_fallback_provider, 'huggingface')),
    coalesce(nullif(_settings #>> '{embeddings,fallbackModel}', ''), current_settings_row.embedding_fallback_model, 'sentence-transformers/all-MiniLM-L6-v2'),
    coalesce(nullif(_settings #>> '{embeddings,fallbackBaseUrl}', ''), current_settings_row.embedding_fallback_base_url, 'https://api-inference.huggingface.co/models'),
    greatest(coalesce((_settings #>> '{embeddings,vectorDimensions}')::integer, current_settings_row.embedding_vector_dimensions, 1536), 1),
    greatest(coalesce((_settings #>> '{embeddings,schemaDimensions}')::integer, current_settings_row.embedding_schema_dimensions, current_settings_row.embedding_vector_dimensions, 1536), 1),
    coalesce((_settings #>> '{runtime,enableSimilarityExpansion}')::boolean, current_settings_row.chat_similarity_expansion_enabled, true),
    coalesce((_settings #>> '{runtime,strictCitationsDefault}')::boolean, current_settings_row.chat_strict_citations_default, true),
    greatest(coalesce((_settings #>> '{runtime,historyLimit}')::integer, current_settings_row.chat_history_limit, 12), 1),
    greatest(coalesce((_settings #>> '{runtime,maxEvidenceItems}')::integer, current_settings_row.chat_max_evidence_items, 6), 1),
    greatest(coalesce((_settings #>> '{runtime,temperature}')::double precision, current_settings_row.chat_runtime_temperature, 0.2), 0),
    greatest(coalesce((_settings #>> '{runtime,maxTokens}')::integer, current_settings_row.chat_runtime_max_tokens, 700), 1),
    coalesce((_settings #>> '{runtime,aiEnabled}')::boolean, current_settings_row.chat_ai_enabled, true)
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
    next_embedding_schema_dimensions,
    next_similarity_enabled,
    next_strict_citations,
    next_history_limit,
    next_max_evidence_items,
    next_runtime_temperature,
    next_runtime_max_tokens,
    next_ai_enabled;

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

  next_embedding_fingerprint := public.build_embedding_config_fingerprint(
    next_embedding_provider,
    next_embedding_model,
    next_embedding_base_url,
    next_embedding_vector_dimensions,
    next_embedding_schema_dimensions
  );
  next_embedding_reindex_required := CASE
    WHEN current_embedding_fingerprint IS DISTINCT FROM next_embedding_fingerprint
      THEN current_last_indexed_fingerprint IS DISTINCT FROM next_embedding_fingerprint
    ELSE coalesce(current_settings_row.embedding_reindex_required, false)
  END;

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
    embedding_schema_dimensions = next_embedding_schema_dimensions,
    embedding_reindex_required = next_embedding_reindex_required,
    embedding_last_indexed_fingerprint = current_last_indexed_fingerprint,
    embedding_last_indexed_at = coalesce(current_settings_row.embedding_last_indexed_at, now()),
    chat_similarity_expansion_enabled = next_similarity_enabled,
    chat_strict_citations_default = next_strict_citations,
    chat_history_limit = next_history_limit,
    chat_max_evidence_items = next_max_evidence_items,
    chat_runtime_temperature = next_runtime_temperature,
    chat_runtime_max_tokens = next_runtime_max_tokens,
    chat_ai_enabled = next_ai_enabled,
    updated_by = auth.uid()
  WHERE id = 1;

  IF current_embedding_fingerprint IS DISTINCT FROM next_embedding_fingerprint AND next_embedding_reindex_required THEN
    PERFORM public.enqueue_search_index_job(
      'embed_stale_documents',
      jsonb_build_object(
        'reason', 'embedding_config_changed',
        'embeddingConfigFingerprint', next_embedding_fingerprint
      )
    );
  END IF;

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

DROP FUNCTION IF EXISTS public.list_stale_search_documents(integer);

CREATE OR REPLACE FUNCTION public.list_stale_search_documents(
  _limit integer DEFAULT 100,
  _embedding_config_fingerprint text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  search_text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.search_text
  FROM public.search_documents AS d
  WHERE nullif(btrim(coalesce(d.search_text, '')), '') IS NOT NULL
    AND (
      d.embedding IS NULL
      OR (
        nullif(btrim(coalesce(_embedding_config_fingerprint, '')), '') IS NOT NULL
        AND coalesce(d.embedding_config_fingerprint, '') IS DISTINCT FROM _embedding_config_fingerprint
      )
    )
  ORDER BY d.updated_at ASC, d.created_at ASC
  LIMIT greatest(coalesce(_limit, 100), 1)
$$;

REVOKE EXECUTE ON FUNCTION public.list_stale_search_documents(integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_stale_search_documents(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_search_embeddings_reindexed(
  _embedding_config_fingerprint text,
  _embedding_provider text DEFAULT NULL,
  _embedding_model text DEFAULT NULL,
  _embedding_dimensions integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_settings_row public.app_settings%ROWTYPE;
  current_embedding_fingerprint text;
BEGIN
  SELECT *
  INTO current_settings_row
  FROM public.app_settings
  WHERE id = 1;

  current_embedding_fingerprint := public.build_embedding_config_fingerprint(
    current_settings_row.embedding_provider,
    current_settings_row.embedding_model,
    current_settings_row.embedding_base_url,
    current_settings_row.embedding_vector_dimensions,
    current_settings_row.embedding_schema_dimensions
  );

  UPDATE public.app_settings
  SET
    embedding_last_indexed_fingerprint = coalesce(nullif(_embedding_config_fingerprint, ''), current_settings_row.embedding_last_indexed_fingerprint, current_embedding_fingerprint),
    embedding_last_indexed_at = now(),
    embedding_reindex_required = current_embedding_fingerprint IS DISTINCT FROM _embedding_config_fingerprint
  WHERE id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_search_embeddings_reindexed(text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_search_embeddings_reindexed(text, text, text, integer) TO service_role;
