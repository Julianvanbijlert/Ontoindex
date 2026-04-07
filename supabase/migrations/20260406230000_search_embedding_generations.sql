ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS active_embedding_provider text,
  ADD COLUMN IF NOT EXISTS active_embedding_model text,
  ADD COLUMN IF NOT EXISTS active_embedding_base_url text,
  ADD COLUMN IF NOT EXISTS active_embedding_vector_dimensions integer,
  ADD COLUMN IF NOT EXISTS active_embedding_schema_dimensions integer,
  ADD COLUMN IF NOT EXISTS active_embedding_generation_id text,
  ADD COLUMN IF NOT EXISTS active_embedding_fingerprint text,
  ADD COLUMN IF NOT EXISTS active_embedding_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_pending_generation_id text;

CREATE TABLE IF NOT EXISTS public.search_embedding_generations (
  id text PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  provider text NOT NULL,
  model text NOT NULL,
  base_url text,
  vector_dimensions integer NOT NULL CHECK (vector_dimensions > 0),
  schema_dimensions integer NOT NULL CHECK (schema_dimensions > 0),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active', 'superseded', 'failed')),
  last_error text,
  completed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.search_document_embeddings (
  search_document_id uuid NOT NULL REFERENCES public.search_documents(id) ON DELETE CASCADE,
  generation_id text NOT NULL REFERENCES public.search_embedding_generations(id) ON DELETE CASCADE,
  generation_fingerprint text NOT NULL,
  embedding vector,
  embedding_provider text,
  embedding_model text,
  embedding_dimensions integer,
  embedding_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (search_document_id, generation_id)
);

CREATE INDEX IF NOT EXISTS search_document_embeddings_generation_idx
  ON public.search_document_embeddings (generation_id, embedding_updated_at DESC);

CREATE INDEX IF NOT EXISTS search_embedding_generations_status_idx
  ON public.search_embedding_generations (status, updated_at DESC);

DROP TRIGGER IF EXISTS update_search_embedding_generations_updated_at ON public.search_embedding_generations;
CREATE TRIGGER update_search_embedding_generations_updated_at
BEFORE UPDATE ON public.search_embedding_generations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_search_document_embeddings_updated_at ON public.search_document_embeddings;
CREATE TRIGGER update_search_document_embeddings_updated_at
BEFORE UPDATE ON public.search_document_embeddings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (id, allow_self_role_change)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recreate_search_documents_embedding_ann_index()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  EXECUTE 'DROP INDEX IF EXISTS public.search_documents_embedding_ann_idx';

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
      EXECUTE 'CREATE INDEX search_documents_embedding_ann_idx ON public.search_documents USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL';
    ELSE
      EXECUTE 'CREATE INDEX search_documents_embedding_ann_idx ON public.search_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 64) WHERE embedding IS NOT NULL';
    END IF;
  EXCEPTION
    WHEN undefined_object THEN
      NULL;
  END;
END;
$$;

WITH current_selected AS (
  SELECT
    id,
    lower(coalesce(nullif(embedding_provider, ''), 'gemini')) AS provider,
    coalesce(nullif(embedding_model, ''), public.default_embedding_model_for_provider(embedding_provider)) AS model,
    coalesce(nullif(embedding_base_url, ''), public.default_embedding_base_url_for_provider(embedding_provider)) AS base_url,
    greatest(coalesce(embedding_vector_dimensions, 1536), 1) AS vector_dimensions,
    greatest(coalesce(embedding_schema_dimensions, embedding_vector_dimensions, 1536), 1) AS schema_dimensions,
    public.build_embedding_config_fingerprint(
      embedding_provider,
      embedding_model,
      embedding_base_url,
      embedding_vector_dimensions,
      embedding_schema_dimensions
    ) AS fingerprint,
    coalesce(embedding_last_indexed_at, now()) AS activated_at
  FROM public.app_settings
  WHERE id = 1
)
INSERT INTO public.search_embedding_generations (
  id,
  fingerprint,
  provider,
  model,
  base_url,
  vector_dimensions,
  schema_dimensions,
  status,
  completed_at,
  activated_at
)
SELECT
  current_selected.fingerprint,
  current_selected.fingerprint,
  current_selected.provider,
  current_selected.model,
  current_selected.base_url,
  current_selected.vector_dimensions,
  current_selected.schema_dimensions,
  'active',
  current_selected.activated_at,
  current_selected.activated_at
FROM current_selected
ON CONFLICT (id) DO UPDATE
SET
  fingerprint = excluded.fingerprint,
  provider = excluded.provider,
  model = excluded.model,
  base_url = excluded.base_url,
  vector_dimensions = excluded.vector_dimensions,
  schema_dimensions = excluded.schema_dimensions,
  status = 'active',
  completed_at = coalesce(public.search_embedding_generations.completed_at, excluded.completed_at),
  activated_at = coalesce(public.search_embedding_generations.activated_at, excluded.activated_at);

WITH active_generation AS (
  SELECT
    provider,
    model,
    base_url,
    vector_dimensions,
    schema_dimensions,
    fingerprint,
    activated_at
  FROM public.search_embedding_generations
  WHERE status = 'active'
  ORDER BY activated_at DESC NULLS LAST, updated_at DESC
  LIMIT 1
)
UPDATE public.app_settings AS settings
SET
  active_embedding_provider = coalesce(settings.active_embedding_provider, active_generation.provider),
  active_embedding_model = coalesce(settings.active_embedding_model, active_generation.model),
  active_embedding_base_url = coalesce(settings.active_embedding_base_url, active_generation.base_url),
  active_embedding_vector_dimensions = coalesce(settings.active_embedding_vector_dimensions, active_generation.vector_dimensions),
  active_embedding_schema_dimensions = coalesce(settings.active_embedding_schema_dimensions, active_generation.schema_dimensions),
  active_embedding_generation_id = coalesce(settings.active_embedding_generation_id, active_generation.fingerprint),
  active_embedding_fingerprint = coalesce(settings.active_embedding_fingerprint, active_generation.fingerprint),
  active_embedding_activated_at = coalesce(settings.active_embedding_activated_at, active_generation.activated_at, now()),
  embedding_last_indexed_fingerprint = coalesce(settings.embedding_last_indexed_fingerprint, active_generation.fingerprint),
  embedding_last_indexed_at = coalesce(settings.embedding_last_indexed_at, active_generation.activated_at, now()),
  embedding_pending_generation_id = CASE
    WHEN public.build_embedding_config_fingerprint(
      settings.embedding_provider,
      settings.embedding_model,
      settings.embedding_base_url,
      settings.embedding_vector_dimensions,
      settings.embedding_schema_dimensions
    ) = active_generation.fingerprint
      THEN NULL
    ELSE coalesce(
      settings.embedding_pending_generation_id,
      public.build_embedding_config_fingerprint(
        settings.embedding_provider,
        settings.embedding_model,
        settings.embedding_base_url,
        settings.embedding_vector_dimensions,
        settings.embedding_schema_dimensions
      )
    )
  END,
  embedding_reindex_required = CASE
    WHEN public.build_embedding_config_fingerprint(
      settings.embedding_provider,
      settings.embedding_model,
      settings.embedding_base_url,
      settings.embedding_vector_dimensions,
      settings.embedding_schema_dimensions
    ) = active_generation.fingerprint
      THEN false
    ELSE true
  END
FROM active_generation
WHERE settings.id = 1;

WITH active_generation AS (
  SELECT
    coalesce(active_embedding_generation_id, active_embedding_fingerprint) AS generation_id,
    coalesce(active_embedding_fingerprint, embedding_last_indexed_fingerprint) AS generation_fingerprint
  FROM public.app_settings
  WHERE id = 1
)
INSERT INTO public.search_document_embeddings (
  search_document_id,
  generation_id,
  generation_fingerprint,
  embedding,
  embedding_provider,
  embedding_model,
  embedding_dimensions,
  embedding_updated_at
)
SELECT
  d.id,
  active_generation.generation_id,
  active_generation.generation_fingerprint,
  d.embedding,
  d.embedding_provider,
  d.embedding_model,
  d.embedding_dimensions,
  coalesce(d.embedding_updated_at, d.updated_at, now())
FROM public.search_documents AS d
CROSS JOIN active_generation
WHERE d.embedding IS NOT NULL
  AND active_generation.generation_id IS NOT NULL
ON CONFLICT (search_document_id, generation_id) DO UPDATE
SET
  generation_fingerprint = excluded.generation_fingerprint,
  embedding = excluded.embedding,
  embedding_provider = excluded.embedding_provider,
  embedding_model = excluded.embedding_model,
  embedding_dimensions = excluded.embedding_dimensions,
  embedding_updated_at = excluded.embedding_updated_at;

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

DROP FUNCTION IF EXISTS public.list_stale_search_documents(integer, text);
DROP FUNCTION IF EXISTS public.list_stale_search_documents(integer);

CREATE OR REPLACE FUNCTION public.list_stale_search_documents(
  _limit integer DEFAULT 100,
  _generation_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  search_text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH target_generation AS (
    SELECT coalesce(
      nullif(btrim(coalesce(_generation_id, '')), ''),
      nullif((SELECT embedding_pending_generation_id FROM public.app_settings WHERE id = 1), ''),
      nullif((SELECT active_embedding_generation_id FROM public.app_settings WHERE id = 1), ''),
      nullif((SELECT active_embedding_fingerprint FROM public.app_settings WHERE id = 1), ''),
      nullif((SELECT embedding_last_indexed_fingerprint FROM public.app_settings WHERE id = 1), '')
    ) AS generation_id
  )
  SELECT d.id, d.search_text
  FROM public.search_documents AS d
  CROSS JOIN target_generation AS target
  LEFT JOIN public.search_document_embeddings AS staged
    ON staged.search_document_id = d.id
   AND staged.generation_id = target.generation_id
  WHERE target.generation_id IS NOT NULL
    AND nullif(btrim(coalesce(d.search_text, '')), '') IS NOT NULL
    AND (
      staged.search_document_id IS NULL
      OR coalesce(staged.embedding_updated_at, '-infinity'::timestamptz) < d.updated_at
    )
  ORDER BY d.updated_at ASC, d.created_at ASC
  LIMIT greatest(coalesce(_limit, 100), 1)
$$;

REVOKE EXECUTE ON FUNCTION public.list_stale_search_documents(integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_stale_search_documents(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_search_embedding_generation(
  _generation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  settings_row public.app_settings%ROWTYPE;
  target_generation public.search_embedding_generations%ROWTYPE;
  selected_embedding_fingerprint text;
  active_generation_id text;
  schema_change_required boolean;
  stale_exists boolean;
BEGIN
  SELECT *
  INTO settings_row
  FROM public.app_settings
  WHERE id = 1;

  SELECT *
  INTO target_generation
  FROM public.search_embedding_generations
  WHERE id = nullif(btrim(coalesce(_generation_id, '')), '');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'generation_not_found');
  END IF;

  selected_embedding_fingerprint := public.build_embedding_config_fingerprint(
    settings_row.embedding_provider,
    settings_row.embedding_model,
    settings_row.embedding_base_url,
    settings_row.embedding_vector_dimensions,
    settings_row.embedding_schema_dimensions
  );
  active_generation_id := coalesce(
    nullif(settings_row.active_embedding_generation_id, ''),
    nullif(settings_row.active_embedding_fingerprint, ''),
    target_generation.id
  );

  IF target_generation.id IS DISTINCT FROM active_generation_id
    AND target_generation.id IS DISTINCT FROM coalesce(nullif(settings_row.embedding_pending_generation_id, ''), selected_embedding_fingerprint)
  THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'generation_no_longer_selected');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.list_stale_search_documents(1, target_generation.id)
  )
  INTO stale_exists;

  IF stale_exists THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'generation_still_stale');
  END IF;

  schema_change_required := greatest(
    coalesce(settings_row.active_embedding_schema_dimensions, settings_row.embedding_schema_dimensions, settings_row.embedding_vector_dimensions, 1536),
    1
  ) IS DISTINCT FROM target_generation.schema_dimensions;

  IF schema_change_required THEN
    EXECUTE 'DROP INDEX IF EXISTS public.search_documents_embedding_ann_idx';
    EXECUTE format(
      'ALTER TABLE public.search_documents ALTER COLUMN embedding TYPE vector(%s) USING NULL::vector(%s)',
      target_generation.schema_dimensions,
      target_generation.schema_dimensions
    );
  END IF;

  UPDATE public.search_documents AS document
  SET
    embedding = staged.embedding,
    embedding_provider = staged.embedding_provider,
    embedding_model = staged.embedding_model,
    embedding_dimensions = staged.embedding_dimensions,
    embedding_updated_at = coalesce(staged.embedding_updated_at, now()),
    embedding_config_fingerprint = target_generation.fingerprint
  FROM public.search_document_embeddings AS staged
  WHERE staged.generation_id = target_generation.id
    AND staged.search_document_id = document.id;

  IF schema_change_required THEN
    PERFORM public.recreate_search_documents_embedding_ann_index();
  END IF;

  UPDATE public.search_embedding_generations
  SET
    status = CASE
      WHEN id = target_generation.id THEN 'active'
      WHEN status = 'active' THEN 'superseded'
      ELSE status
    END,
    completed_at = CASE WHEN id = target_generation.id THEN coalesce(completed_at, now()) ELSE completed_at END,
    activated_at = CASE WHEN id = target_generation.id THEN now() ELSE activated_at END,
    last_error = CASE WHEN id = target_generation.id THEN NULL ELSE last_error END
  WHERE id = target_generation.id
     OR status = 'active';

  UPDATE public.app_settings
  SET
    active_embedding_provider = target_generation.provider,
    active_embedding_model = target_generation.model,
    active_embedding_base_url = target_generation.base_url,
    active_embedding_vector_dimensions = target_generation.vector_dimensions,
    active_embedding_schema_dimensions = target_generation.schema_dimensions,
    active_embedding_generation_id = target_generation.id,
    active_embedding_fingerprint = target_generation.fingerprint,
    active_embedding_activated_at = now(),
    embedding_last_indexed_fingerprint = target_generation.fingerprint,
    embedding_last_indexed_at = now(),
    embedding_pending_generation_id = CASE
      WHEN selected_embedding_fingerprint = target_generation.fingerprint THEN NULL
      ELSE selected_embedding_fingerprint
    END,
    embedding_reindex_required = selected_embedding_fingerprint IS DISTINCT FROM target_generation.fingerprint
  WHERE id = 1;

  RETURN jsonb_build_object(
    'activated', true,
    'generationId', target_generation.id,
    'fingerprint', target_generation.fingerprint
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_search_embedding_generation(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_search_embedding_generation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_chat_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_chat_settings(jsonb, text, boolean) TO authenticated;
