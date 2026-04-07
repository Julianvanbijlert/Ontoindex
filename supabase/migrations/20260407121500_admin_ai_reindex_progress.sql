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
  latest_job_status text;
  latest_job_error text;
  reindex_required boolean;
  activation_pending boolean;
  reindex_total_documents integer := 0;
  reindex_remaining_documents integer := 0;
  reindex_processed_documents integer := 0;
  reindex_progress_percent integer := 0;
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

  SELECT job.status, job.last_error
  INTO latest_job_status, latest_job_error
  FROM public.search_index_jobs AS job
  WHERE job.job_type = 'embed_stale_documents'
    AND (
      selected_generation_id IS NULL
      OR coalesce(job.metadata ->> 'generationId', job.metadata ->> 'embeddingConfigFingerprint') = selected_generation_id
    )
  ORDER BY job.created_at DESC
  LIMIT 1;

  activation_pending := pending_generation_id IS NOT NULL
    AND pending_job_status IS NULL
    AND selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint;
  reindex_required := coalesce(settings_row.embedding_reindex_required, false)
    OR selected_embedding_fingerprint IS DISTINCT FROM active_embedding_fingerprint;

  SELECT
    count(*)::integer,
    coalesce(sum(
      CASE
        WHEN staged.search_document_id IS NULL
          OR coalesce(staged.embedding_updated_at, '-infinity'::timestamptz) < d.updated_at
          THEN 1
        ELSE 0
      END
    ), 0)::integer
  INTO reindex_total_documents, reindex_remaining_documents
  FROM public.search_documents AS d
  LEFT JOIN public.search_document_embeddings AS staged
    ON staged.search_document_id = d.id
   AND staged.generation_id = selected_generation_id
  WHERE selected_generation_id IS NOT NULL
    AND nullif(btrim(coalesce(d.search_text, '')), '') IS NOT NULL;

  reindex_processed_documents := greatest(reindex_total_documents - reindex_remaining_documents, 0);
  reindex_progress_percent := CASE
    WHEN reindex_total_documents > 0 THEN least(
      greatest(round((reindex_processed_documents::numeric * 100) / reindex_total_documents), 0),
      100
    )::integer
    WHEN reindex_required THEN 0
    ELSE 100
  END;

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
      'totalDocuments', reindex_total_documents,
      'processedDocuments', reindex_processed_documents,
      'remainingDocuments', reindex_remaining_documents,
      'progressPercent', reindex_progress_percent,
      'lastError', CASE
        WHEN coalesce(latest_job_status, '') = 'failed' THEN latest_job_error
        ELSE NULL
      END,
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
          WHEN coalesce(latest_job_status, '') = 'failed' AND reindex_required THEN 'failed'
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
        'pendingJobStatus', CASE
          WHEN coalesce(latest_job_status, '') = 'failed' AND reindex_required THEN 'failed'
          ELSE pending_job_status
        END,
        'activationPending', activation_pending,
        'totalDocuments', reindex_total_documents,
        'processedDocuments', reindex_processed_documents,
        'remainingDocuments', reindex_remaining_documents,
        'progressPercent', reindex_progress_percent,
        'progressStatus', CASE
          WHEN coalesce(latest_job_status, '') = 'failed' AND reindex_required THEN 'failed'
          WHEN pending_job_status = 'pending' THEN 'queued'
          WHEN activation_pending AND reindex_progress_percent = 100 THEN 'activating'
          WHEN reindex_required THEN 'processing'
          ELSE 'completed'
        END,
        'progressLabel', CASE
          WHEN coalesce(latest_job_status, '') = 'failed' AND reindex_required THEN 'Failed'
          WHEN pending_job_status = 'pending' THEN 'Queued'
          WHEN activation_pending AND reindex_progress_percent = 100 THEN 'Activating new retrieval generation'
          WHEN reindex_required THEN 'Rebuilding embeddings'
          ELSE 'Completed'
        END,
        'lastError', CASE
          WHEN coalesce(latest_job_status, '') = 'failed' THEN latest_job_error
          ELSE NULL
        END,
        'message', CASE
          WHEN coalesce(latest_job_status, '') = 'failed' AND reindex_required THEN
            coalesce(latest_job_error, 'Embedding rebuild failed.')
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

GRANT EXECUTE ON FUNCTION public.get_admin_chat_settings() TO authenticated;
