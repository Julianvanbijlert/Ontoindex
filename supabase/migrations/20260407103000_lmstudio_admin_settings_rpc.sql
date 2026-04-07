CREATE OR REPLACE FUNCTION public.default_embedding_model_for_provider(_provider text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(nullif(_provider, ''), 'gemini'))
    WHEN 'huggingface' THEN 'sentence-transformers/all-MiniLM-L6-v2'
    WHEN 'local' THEN 'nomic-embed-text'
    WHEN 'lmstudio' THEN ''
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
    WHEN 'lmstudio' THEN 'http://localhost:1234/v1'
    ELSE 'https://generativelanguage.googleapis.com/v1beta'
  END
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
  selected_embedding_provider text;
  selected_embedding_model text;
  selected_embedding_base_url text;
  selected_embedding_vector_dimensions integer;
  selected_embedding_schema_dimensions integer;
  selected_embedding_fingerprint text;
  active_embedding_provider text;
  active_embedding_model text;
  active_embedding_base_url text;
  active_embedding_vector_dimensions integer;
  active_embedding_schema_dimensions integer;
  active_embedding_generation_id text;
  active_embedding_fingerprint text;
  selected_generation_id text;
  pending_generation_id text;
  pending_job_id uuid;
  pending_job_status text;
  reindex_required boolean;
  activation_pending boolean;
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
      WHEN effective_provider = 'lmstudio' THEN ''
      ELSE 'gemini-2.0-flash'
    END
  );
  effective_base_url := CASE
    WHEN effective_provider = 'deepseek' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.deepseek.com')
    WHEN effective_provider = 'gemini' THEN coalesce(settings_row.chat_llm_base_url, 'https://generativelanguage.googleapis.com/v1beta')
    WHEN effective_provider = 'openai' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.openai.com/v1')
    WHEN effective_provider = 'anthropic' THEN coalesce(settings_row.chat_llm_base_url, 'https://api.anthropic.com')
    WHEN effective_provider = 'lmstudio' THEN coalesce(settings_row.chat_llm_base_url, 'http://localhost:1234/v1')
    ELSE settings_row.chat_llm_base_url
  END;
  effective_api_key := CASE
    WHEN effective_provider = 'deepseek' THEN coalesce(nullif(secrets_row.chat_llm_api_key, ''), nullif(secrets_row.deepseek_api_key, ''))
    WHEN effective_provider = 'gemini' THEN nullif(secrets_row.gemini_api_key, '')
    WHEN effective_provider IN ('openai', 'openai-compatible', 'anthropic') THEN nullif(secrets_row.chat_llm_api_key, '')
    ELSE null
  END;

  selected_embedding_provider := coalesce(settings_row.embedding_provider, 'gemini');
  selected_embedding_model := coalesce(
    nullif(settings_row.embedding_model, ''),
    public.default_embedding_model_for_provider(selected_embedding_provider)
  );
  selected_embedding_base_url := coalesce(
    nullif(settings_row.embedding_base_url, ''),
    public.default_embedding_base_url_for_provider(selected_embedding_provider)
  );
  selected_embedding_vector_dimensions := greatest(coalesce(settings_row.embedding_vector_dimensions, 1536), 1);
  selected_embedding_schema_dimensions := greatest(
    coalesce(settings_row.embedding_schema_dimensions, settings_row.embedding_vector_dimensions, 1536),
    1
  );
  selected_embedding_fingerprint := public.build_embedding_config_fingerprint(
    selected_embedding_provider,
    selected_embedding_model,
    selected_embedding_base_url,
    selected_embedding_vector_dimensions,
    selected_embedding_schema_dimensions
  );

  active_embedding_provider := coalesce(settings_row.active_embedding_provider, selected_embedding_provider);
  active_embedding_model := coalesce(nullif(settings_row.active_embedding_model, ''), selected_embedding_model);
  active_embedding_base_url := coalesce(nullif(settings_row.active_embedding_base_url, ''), selected_embedding_base_url);
  active_embedding_vector_dimensions := greatest(coalesce(settings_row.active_embedding_vector_dimensions, selected_embedding_vector_dimensions), 1);
  active_embedding_schema_dimensions := greatest(coalesce(settings_row.active_embedding_schema_dimensions, selected_embedding_schema_dimensions), 1);
  active_embedding_generation_id := coalesce(
    nullif(settings_row.active_embedding_generation_id, ''),
    nullif(settings_row.active_embedding_fingerprint, ''),
    selected_embedding_fingerprint
  );
  active_embedding_fingerprint := coalesce(
    nullif(settings_row.active_embedding_fingerprint, ''),
    public.build_embedding_config_fingerprint(
      active_embedding_provider,
      active_embedding_model,
      active_embedding_base_url,
      active_embedding_vector_dimensions,
      active_embedding_schema_dimensions
    )
  );
  pending_generation_id := CASE
    WHEN nullif(settings_row.embedding_pending_generation_id, '') IS NOT NULL
      THEN settings_row.embedding_pending_generation_id
    WHEN selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint
      THEN selected_embedding_fingerprint
    ELSE NULL
  END;
  selected_generation_id := coalesce(pending_generation_id, active_embedding_generation_id);

  SELECT job.id, job.status
  INTO pending_job_id, pending_job_status
  FROM public.search_index_jobs AS job
  WHERE job.job_type = 'embed_stale_documents'
    AND job.status IN ('pending', 'processing')
    AND (
      pending_generation_id IS NULL
      OR coalesce(job.metadata ->> 'generationId', job.metadata ->> 'embeddingConfigFingerprint') = pending_generation_id
    )
  ORDER BY job.created_at DESC
  LIMIT 1;

  activation_pending := pending_generation_id IS NOT NULL
    AND pending_job_status IS NULL
    AND selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint;
  reindex_required := coalesce(settings_row.embedding_reindex_required, false)
    OR selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint;

  RETURN jsonb_build_object(
    'provider', jsonb_build_object(
      'llmProvider', effective_provider,
      'llmModel', effective_model,
      'llmBaseUrl', effective_base_url,
      'llmTemperature', greatest(coalesce(settings_row.chat_llm_temperature, 0.2), 0),
      'llmMaxTokens', greatest(coalesce(settings_row.chat_llm_max_tokens, 700), 1),
      'apiKeyConfigured', coalesce(effective_api_key, '') <> '',
      'apiKeyMasked', CASE WHEN coalesce(effective_api_key, '') = '' THEN NULL ELSE 'Configured' END,
      'apiKeyUpdatedAt', secrets_row.updated_at
    ),
    'embeddings', jsonb_build_object(
      'embeddingProvider', selected_embedding_provider,
      'embeddingModel', selected_embedding_model,
      'embeddingBaseUrl', selected_embedding_base_url,
      'fallbackProvider', coalesce(settings_row.embedding_fallback_provider, 'huggingface'),
      'fallbackModel', coalesce(settings_row.embedding_fallback_model, 'sentence-transformers/all-MiniLM-L6-v2'),
      'fallbackBaseUrl', coalesce(settings_row.embedding_fallback_base_url, 'https://api-inference.huggingface.co/models'),
      'vectorDimensions', selected_embedding_vector_dimensions,
      'schemaDimensions', selected_embedding_schema_dimensions,
      'reindexRequired', reindex_required,
      'lastIndexedFingerprint', coalesce(nullif(settings_row.embedding_last_indexed_fingerprint, ''), active_embedding_fingerprint),
      'lastIndexedAt', settings_row.embedding_last_indexed_at,
      'pendingJobId', pending_job_id,
      'pendingJobStatus', pending_job_status,
      'activeRetrieval', jsonb_build_object(
        'embeddingProvider', active_embedding_provider,
        'embeddingModel', active_embedding_model,
        'embeddingBaseUrl', active_embedding_base_url,
        'vectorDimensions', active_embedding_vector_dimensions,
        'schemaDimensions', active_embedding_schema_dimensions,
        'generationId', active_embedding_generation_id,
        'fingerprint', active_embedding_fingerprint,
        'activatedAt', settings_row.active_embedding_activated_at
      ),
      'reindexState', jsonb_build_object(
        'required', reindex_required,
        'status', CASE
          WHEN pending_job_status = 'processing' THEN 'processing'
          WHEN pending_job_status = 'pending' THEN 'queued'
          WHEN reindex_required THEN 'required'
          ELSE 'aligned'
        END,
        'activeFingerprint', active_embedding_fingerprint,
        'selectedFingerprint', selected_embedding_fingerprint,
        'lastIndexedFingerprint', coalesce(nullif(settings_row.embedding_last_indexed_fingerprint, ''), active_embedding_fingerprint),
        'lastIndexedAt', settings_row.embedding_last_indexed_at,
        'activeGenerationId', active_embedding_generation_id,
        'selectedGenerationId', selected_generation_id,
        'pendingGenerationId', pending_generation_id,
        'pendingJobId', pending_job_id,
        'pendingJobStatus', pending_job_status,
        'activationPending', activation_pending,
        'message', CASE
          WHEN selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint THEN
            'Search embeddings are rebuilding. Retrieval stays on the active indexed generation until activation completes.'
          WHEN reindex_required THEN
            'Search embeddings need to be rebuilt for the active embedding configuration.'
          ELSE NULL
        END
      )
    ),
    'providerKeys', jsonb_build_object(
      'deepseek', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.deepseek_api_key, ''), '') <> '',
        'masked', CASE WHEN coalesce(nullif(secrets_row.deepseek_api_key, ''), '') = '' THEN NULL ELSE 'Configured' END,
        'updatedAt', secrets_row.updated_at
      ),
      'gemini', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.gemini_api_key, ''), '') <> '',
        'masked', CASE WHEN coalesce(nullif(secrets_row.gemini_api_key, ''), '') = '' THEN NULL ELSE 'Configured' END,
        'updatedAt', secrets_row.updated_at
      ),
      'huggingface', jsonb_build_object(
        'configured', coalesce(nullif(secrets_row.hf_api_key, ''), '') <> '',
        'masked', CASE WHEN coalesce(nullif(secrets_row.hf_api_key, ''), '') = '' THEN NULL ELSE 'Configured' END,
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

CREATE OR REPLACE FUNCTION public.update_admin_chat_settings(
  _settings jsonb DEFAULT '{}'::jsonb,
  _api_key text DEFAULT NULL::text,
  _clear_api_key boolean DEFAULT false
)
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
  current_active_embedding_provider text;
  current_active_embedding_model text;
  current_active_embedding_base_url text;
  current_active_embedding_vector_dimensions integer;
  current_active_embedding_schema_dimensions integer;
  current_active_embedding_generation_id text;
  current_active_embedding_fingerprint text;
  next_selected_embedding_fingerprint text;
  next_reindex_required boolean;
  next_pending_generation_id text;
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

  current_active_embedding_provider := coalesce(current_settings_row.active_embedding_provider, current_settings_row.embedding_provider, 'gemini');
  current_active_embedding_model := coalesce(
    nullif(current_settings_row.active_embedding_model, ''),
    nullif(current_settings_row.embedding_model, ''),
    public.default_embedding_model_for_provider(current_active_embedding_provider)
  );
  current_active_embedding_base_url := coalesce(
    nullif(current_settings_row.active_embedding_base_url, ''),
    nullif(current_settings_row.embedding_base_url, ''),
    public.default_embedding_base_url_for_provider(current_active_embedding_provider)
  );
  current_active_embedding_vector_dimensions := greatest(
    coalesce(current_settings_row.active_embedding_vector_dimensions, current_settings_row.embedding_vector_dimensions, 1536),
    1
  );
  current_active_embedding_schema_dimensions := greatest(
    coalesce(current_settings_row.active_embedding_schema_dimensions, current_settings_row.embedding_schema_dimensions, current_settings_row.embedding_vector_dimensions, 1536),
    1
  );
  current_active_embedding_fingerprint := coalesce(
    nullif(current_settings_row.active_embedding_fingerprint, ''),
    public.build_embedding_config_fingerprint(
      current_active_embedding_provider,
      current_active_embedding_model,
      current_active_embedding_base_url,
      current_active_embedding_vector_dimensions,
      current_active_embedding_schema_dimensions
    )
  );
  current_active_embedding_generation_id := coalesce(
    nullif(current_settings_row.active_embedding_generation_id, ''),
    current_active_embedding_fingerprint
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
        WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'lmstudio' THEN ''
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
      WHEN lower(coalesce(nullif(_settings #>> '{provider,llmProvider}', ''), current_settings_row.chat_llm_provider, 'gemini')) = 'lmstudio'
        THEN coalesce(nullif(_settings #>> '{provider,llmBaseUrl}', ''), nullif(current_settings_row.chat_llm_base_url, ''), 'http://localhost:1234/v1')
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

  IF next_provider NOT IN ('mock', 'deepseek', 'gemini', 'openai', 'openai-compatible', 'anthropic', 'lmstudio') THEN
    RAISE EXCEPTION 'Unsupported LLM provider'
      USING ERRCODE = '22023';
  END IF;

  IF next_embedding_provider NOT IN ('gemini', 'deepseek', 'huggingface', 'local', 'lmstudio') THEN
    RAISE EXCEPTION 'Unsupported embedding provider'
      USING ERRCODE = '22023';
  END IF;

  IF next_embedding_fallback_provider NOT IN ('gemini', 'deepseek', 'huggingface', 'local', 'lmstudio') THEN
    RAISE EXCEPTION 'Unsupported embedding fallback provider'
      USING ERRCODE = '22023';
  END IF;

  next_selected_embedding_fingerprint := public.build_embedding_config_fingerprint(
    next_embedding_provider,
    next_embedding_model,
    next_embedding_base_url,
    next_embedding_vector_dimensions,
    next_embedding_schema_dimensions
  );
  next_reindex_required := current_active_embedding_fingerprint IS DISTINCT FROM next_selected_embedding_fingerprint;
  next_pending_generation_id := CASE
    WHEN next_reindex_required THEN next_selected_embedding_fingerprint
    ELSE NULL
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
    embedding_reindex_required = next_reindex_required,
    embedding_last_indexed_fingerprint = coalesce(current_settings_row.embedding_last_indexed_fingerprint, current_active_embedding_fingerprint),
    embedding_last_indexed_at = coalesce(current_settings_row.embedding_last_indexed_at, current_settings_row.active_embedding_activated_at, now()),
    embedding_pending_generation_id = next_pending_generation_id,
    chat_similarity_expansion_enabled = next_similarity_enabled,
    chat_strict_citations_default = next_strict_citations,
    chat_history_limit = next_history_limit,
    chat_max_evidence_items = next_max_evidence_items,
    chat_runtime_temperature = next_runtime_temperature,
    chat_runtime_max_tokens = next_runtime_max_tokens,
    chat_ai_enabled = next_ai_enabled,
    updated_by = auth.uid()
  WHERE id = 1;

  IF next_reindex_required THEN
    INSERT INTO public.search_embedding_generations (
      id,
      fingerprint,
      provider,
      model,
      base_url,
      vector_dimensions,
      schema_dimensions,
      status
    )
    VALUES (
      next_selected_embedding_fingerprint,
      next_selected_embedding_fingerprint,
      next_embedding_provider,
      next_embedding_model,
      next_embedding_base_url,
      next_embedding_vector_dimensions,
      next_embedding_schema_dimensions,
      'building'
    )
    ON CONFLICT (id) DO UPDATE
    SET
      fingerprint = excluded.fingerprint,
      provider = excluded.provider,
      model = excluded.model,
      base_url = excluded.base_url,
      vector_dimensions = excluded.vector_dimensions,
      schema_dimensions = excluded.schema_dimensions,
      status = CASE
        WHEN public.search_embedding_generations.status = 'active' THEN 'active'
        ELSE 'building'
      END,
      last_error = NULL;

    IF current_settings_row.embedding_pending_generation_id IS DISTINCT FROM next_pending_generation_id
      OR public.build_embedding_config_fingerprint(
        current_settings_row.embedding_provider,
        current_settings_row.embedding_model,
        current_settings_row.embedding_base_url,
        current_settings_row.embedding_vector_dimensions,
        current_settings_row.embedding_schema_dimensions
      ) IS DISTINCT FROM next_selected_embedding_fingerprint
    THEN
      PERFORM public.enqueue_search_index_job(
        'embed_stale_documents',
        jsonb_build_object(
          'reason', 'embedding_config_changed',
          'generationId', next_pending_generation_id,
          'embeddingConfigFingerprint', next_selected_embedding_fingerprint
        )
      );
    END IF;
  END IF;

  IF _clear_api_key THEN
    UPDATE public.app_setting_secrets
    SET chat_llm_api_key = NULL, updated_by = auth.uid()
    WHERE id = 1;
  ELSIF nullif(btrim(coalesce(_api_key, '')), '') IS NOT NULL THEN
    UPDATE public.app_setting_secrets
    SET chat_llm_api_key = btrim(_api_key), updated_by = auth.uid()
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

GRANT EXECUTE ON FUNCTION public.get_admin_chat_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_chat_settings(jsonb, text, boolean) TO authenticated;
