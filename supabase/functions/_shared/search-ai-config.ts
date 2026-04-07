import type { ChatProvider, EmbeddingProvider } from "../../../src/lib/ai/provider-types.ts";
import {
  buildEmbeddingConfigFingerprint,
  type EmbeddingConfigSnapshot,
} from "../../../src/lib/ai/embedding-config-state.ts";
import {
  DEFAULT_CHAT_PROVIDER,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_FALLBACK_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_PROVIDER,
  defaultChatBaseUrlForProvider,
  defaultChatModelForProvider,
  defaultEmbeddingBaseUrlForProvider,
  defaultEmbeddingModelForProvider,
  normalizeBaseUrl,
  normalizeChatProvider,
  normalizeEmbeddingDimensions,
  normalizeEmbeddingProvider,
} from "../../../src/lib/ai/provider-factory.ts";

export interface SearchAiSettingsRow {
  chat_llm_provider?: string | null;
  chat_llm_model?: string | null;
  chat_llm_base_url?: string | null;
  chat_ai_enabled?: boolean | null;
  embedding_provider?: string | null;
  embedding_model?: string | null;
  embedding_base_url?: string | null;
  embedding_fallback_provider?: string | null;
  embedding_fallback_model?: string | null;
  embedding_fallback_base_url?: string | null;
  embedding_vector_dimensions?: number | null;
  embedding_schema_dimensions?: number | null;
  embedding_reindex_required?: boolean | null;
  embedding_last_indexed_fingerprint?: string | null;
  embedding_last_indexed_at?: string | null;
  active_embedding_provider?: string | null;
  active_embedding_model?: string | null;
  active_embedding_base_url?: string | null;
  active_embedding_vector_dimensions?: number | null;
  active_embedding_schema_dimensions?: number | null;
  active_embedding_generation_id?: string | null;
  active_embedding_fingerprint?: string | null;
  active_embedding_activated_at?: string | null;
  embedding_pending_generation_id?: string | null;
}

export interface SearchAiSecretsRow {
  chat_llm_api_key?: string | null;
  deepseek_api_key?: string | null;
  gemini_api_key?: string | null;
  hf_api_key?: string | null;
}

type EnvSource = Record<string, string | undefined>;

export interface SearchEmbeddingProviderRuntimeConfig {
  provider: EmbeddingProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

export interface SearchEmbeddingRuntimeConfig {
  primary: SearchEmbeddingProviderRuntimeConfig;
  fallback: SearchEmbeddingProviderRuntimeConfig | null;
  providers: SearchEmbeddingProviderRuntimeConfig[];
  indexing: SearchEmbeddingProviderRuntimeConfig;
  indexingFallback: SearchEmbeddingProviderRuntimeConfig | null;
  indexingProviders: SearchEmbeddingProviderRuntimeConfig[];
  active: {
    primary: SearchEmbeddingProviderRuntimeConfig;
    fallback: SearchEmbeddingProviderRuntimeConfig | null;
    providers: SearchEmbeddingProviderRuntimeConfig[];
    vectorDimensions: number;
    schemaDimensions: number;
    fingerprint: string;
    generationId: string | null;
    activatedAt: string | null;
  };
  selected: {
    primary: SearchEmbeddingProviderRuntimeConfig;
    fallback: SearchEmbeddingProviderRuntimeConfig | null;
    providers: SearchEmbeddingProviderRuntimeConfig[];
    vectorDimensions: number;
    schemaDimensions: number;
    fingerprint: string;
    generationId: string | null;
  };
  vectorDimensions: number;
  schemaDimensions: number;
  activeFingerprint: string;
  selectedFingerprint: string;
  activeGenerationId: string | null;
  targetGenerationId: string | null;
  reindexRequired: boolean;
  lastIndexedFingerprint: string | null;
  lastIndexedAt: string | null;
}

export interface SearchQueryExpansionRuntimeConfig {
  provider: ChatProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveFallbackEmbeddingProvider(input: {
  selectedProvider: EmbeddingProvider;
  env: EnvSource;
  settings?: SearchAiSettingsRow | null;
}) {
  const explicitFallbackProvider = trimOrNull(
    input.env.SEARCH_EMBEDDING_FALLBACK_PROVIDER
      || input.settings?.embedding_fallback_provider
      || input.env.EMBEDDING_FALLBACK_PROVIDER,
  );

  if (!explicitFallbackProvider) {
    return input.selectedProvider === "lmstudio" ? null : "huggingface";
  }

  return normalizeEmbeddingProvider(explicitFallbackProvider);
}

function getEnv(env?: EnvSource) {
  if (env) {
    return env;
  }

  if (typeof globalThis !== "undefined" && "Deno" in globalThis) {
    return (globalThis as { Deno?: { env: { toObject(): EnvSource } } }).Deno?.env.toObject() || {};
  }

  return {};
}

export function getProviderApiKey(
  provider: EmbeddingProvider | ChatProvider,
  env?: EnvSource,
  secrets?: SearchAiSecretsRow | null,
  options?: {
    allowChatApiKeyFallback?: boolean;
  },
) {
  const source = getEnv(env);
  const allowChatApiKeyFallback = options?.allowChatApiKeyFallback ?? true;

  switch (provider) {
    case "deepseek":
      return trimOrNull(secrets?.deepseek_api_key)
        || (allowChatApiKeyFallback ? trimOrNull(secrets?.chat_llm_api_key) : null)
        || trimOrNull(source.DEEPSEEK_API_KEY)
        || (allowChatApiKeyFallback ? trimOrNull(source.LLM_API_KEY) : null);
    case "gemini":
      return trimOrNull(secrets?.gemini_api_key)
        || trimOrNull(source.GEMINI_API_KEY)
        || trimOrNull(source.GOOGLE_API_KEY);
    case "huggingface":
      return trimOrNull(secrets?.hf_api_key)
        || trimOrNull(source.HF_API_KEY);
    case "openai":
    case "openai-compatible":
      return (allowChatApiKeyFallback ? trimOrNull(secrets?.chat_llm_api_key) : null)
        || trimOrNull(source.OPENAI_API_KEY)
        || (allowChatApiKeyFallback ? trimOrNull(source.LLM_API_KEY) : null);
    case "anthropic":
      return (allowChatApiKeyFallback ? trimOrNull(secrets?.chat_llm_api_key) : null)
        || trimOrNull(source.ANTHROPIC_API_KEY)
        || (allowChatApiKeyFallback ? trimOrNull(source.LLM_API_KEY) : null);
    case "local":
    case "lmstudio":
    case "mock":
      return null;
    default:
      return null;
  }
}

function buildEmbeddingProviderConfig(
  provider: EmbeddingProvider,
  options: {
    model?: string | null;
    baseUrl?: string | null;
    env?: EnvSource;
    secrets?: SearchAiSecretsRow | null;
  },
): SearchEmbeddingProviderRuntimeConfig {
  return {
    provider,
    apiKey: getProviderApiKey(provider, options.env, options.secrets, {
      allowChatApiKeyFallback: false,
    }),
    baseUrl: normalizeBaseUrl(options.baseUrl, defaultEmbeddingBaseUrlForProvider(provider)),
    model: trimOrNull(options.model) || defaultEmbeddingModelForProvider(provider),
  };
}

function buildEmbeddingConfigSnapshot(input: {
  provider: EmbeddingProvider;
  model: string | null;
  baseUrl: string | null;
  vectorDimensions: number;
  schemaDimensions: number;
}): EmbeddingConfigSnapshot {
  return {
    provider: input.provider,
    model: input.model || "",
    baseUrl: input.baseUrl,
    vectorDimensions: input.vectorDimensions,
    schemaDimensions: input.schemaDimensions,
  };
}

function buildResolvedEmbeddingRuntimeConfig(
  provider: EmbeddingProvider,
  options: {
    model?: string | null;
    baseUrl?: string | null;
    fallbackProvider?: EmbeddingProvider;
    fallbackModel?: string | null;
    fallbackBaseUrl?: string | null;
    env: EnvSource;
    secrets?: SearchAiSecretsRow | null;
    vectorDimensions: number;
    schemaDimensions: number;
    generationId?: string | null;
    fingerprint?: string | null;
    activatedAt?: string | null;
  },
) {
  const primary = buildEmbeddingProviderConfig(provider, {
    model: options.model,
    baseUrl: options.baseUrl,
    env: options.env,
    secrets: options.secrets,
  });
  const fallbackProvider = options.fallbackProvider && options.fallbackProvider !== provider
    ? buildEmbeddingProviderConfig(options.fallbackProvider, {
        model: options.fallbackModel,
        baseUrl: options.fallbackBaseUrl,
        env: options.env,
        secrets: options.secrets,
      })
    : null;
  const fingerprint = options.fingerprint || buildEmbeddingConfigFingerprint(buildEmbeddingConfigSnapshot({
    provider: primary.provider,
    model: primary.model,
    baseUrl: primary.baseUrl,
    vectorDimensions: options.vectorDimensions,
    schemaDimensions: options.schemaDimensions,
  }));

  return {
    primary,
    fallback: fallbackProvider,
    providers: [primary, ...(fallbackProvider ? [fallbackProvider] : [])],
    vectorDimensions: options.vectorDimensions,
    schemaDimensions: options.schemaDimensions,
    fingerprint,
    generationId: trimOrNull(options.generationId) || null,
    activatedAt: trimOrNull(options.activatedAt) || null,
  };
}

export function readSearchEmbeddingConfig(
  options?: {
    env?: EnvSource;
    settings?: SearchAiSettingsRow | null;
    secrets?: SearchAiSecretsRow | null;
  },
): SearchEmbeddingRuntimeConfig {
  const env = getEnv(options?.env);
  const settings = options?.settings;
  const secrets = options?.secrets;
  const selectedProvider = normalizeEmbeddingProvider(
    env.SEARCH_EMBEDDING_PROVIDER
      || settings?.embedding_provider
      || env.EMBEDDING_PROVIDER
      || DEFAULT_EMBEDDING_PROVIDER,
  );
  const defaultSelectedModel = defaultEmbeddingModelForProvider(selectedProvider) || DEFAULT_EMBEDDING_MODEL;
  const fallbackProvider = resolveFallbackEmbeddingProvider({
    selectedProvider,
    env,
    settings,
  });
  const defaultFallbackModel = fallbackProvider
    ? (defaultEmbeddingModelForProvider(fallbackProvider) || DEFAULT_EMBEDDING_FALLBACK_MODEL)
    : null;
  const selectedVectorDimensions = normalizeEmbeddingDimensions(
    Number(
      env.SEARCH_EMBEDDING_VECTOR_DIMENSION
        ?? settings?.embedding_vector_dimensions
        ?? env.EMBEDDING_VECTOR_DIMENSION
        ?? DEFAULT_EMBEDDING_DIMENSIONS,
    ),
  );
  const selectedSchemaDimensions = normalizeEmbeddingDimensions(
    Number(
      env.SEARCH_EMBEDDING_SCHEMA_DIMENSIONS
        ?? settings?.embedding_schema_dimensions
        ?? env.EMBEDDING_SCHEMA_DIMENSIONS
        ?? DEFAULT_EMBEDDING_DIMENSIONS,
    ),
  );
  const selected = buildResolvedEmbeddingRuntimeConfig(selectedProvider, {
    model: env.SEARCH_EMBEDDING_MODEL
      || settings?.embedding_model
      || env.EMBEDDING_MODEL
      || defaultSelectedModel,
    baseUrl: env.SEARCH_EMBEDDING_BASE_URL
      || settings?.embedding_base_url
      || env.EMBEDDING_BASE_URL,
    fallbackProvider,
    fallbackModel: env.SEARCH_EMBEDDING_FALLBACK_MODEL
      || settings?.embedding_fallback_model
      || env.EMBEDDING_FALLBACK_MODEL
      || defaultFallbackModel,
    fallbackBaseUrl: env.SEARCH_EMBEDDING_FALLBACK_BASE_URL
      || settings?.embedding_fallback_base_url
      || env.EMBEDDING_FALLBACK_BASE_URL,
    env,
    secrets,
    vectorDimensions: selectedVectorDimensions,
    schemaDimensions: selectedSchemaDimensions,
    generationId: settings?.embedding_pending_generation_id
      || settings?.active_embedding_generation_id
      || null,
  });
  const activeProvider = normalizeEmbeddingProvider(
    env.ACTIVE_EMBEDDING_PROVIDER
      || settings?.active_embedding_provider
      || selected.primary.provider,
  );
  const activeVectorDimensions = normalizeEmbeddingDimensions(
    Number(
      env.ACTIVE_EMBEDDING_VECTOR_DIMENSION
        ?? settings?.active_embedding_vector_dimensions
        ?? selected.vectorDimensions,
    ),
  );
  const activeSchemaDimensions = normalizeEmbeddingDimensions(
    Number(
      env.ACTIVE_EMBEDDING_SCHEMA_DIMENSIONS
        ?? settings?.active_embedding_schema_dimensions
        ?? selected.schemaDimensions,
    ),
  );
  const active = buildResolvedEmbeddingRuntimeConfig(activeProvider, {
    model: env.ACTIVE_EMBEDDING_MODEL
      || settings?.active_embedding_model
      || selected.primary.model,
    baseUrl: env.ACTIVE_EMBEDDING_BASE_URL
      || settings?.active_embedding_base_url
      || selected.primary.baseUrl,
    fallbackProvider,
    fallbackModel: env.EMBEDDING_FALLBACK_MODEL
      || env.SEARCH_EMBEDDING_FALLBACK_MODEL
      || settings?.embedding_fallback_model
      || defaultFallbackModel,
    fallbackBaseUrl: env.EMBEDDING_FALLBACK_BASE_URL
      || env.SEARCH_EMBEDDING_FALLBACK_BASE_URL
      || settings?.embedding_fallback_base_url,
    env,
    secrets,
    vectorDimensions: activeVectorDimensions,
    schemaDimensions: activeSchemaDimensions,
    generationId: settings?.active_embedding_generation_id || null,
    fingerprint: trimOrNull(settings?.active_embedding_fingerprint) || null,
    activatedAt: settings?.active_embedding_activated_at || null,
  });
  const lastIndexedFingerprint = trimOrNull(settings?.embedding_last_indexed_fingerprint) || active.fingerprint;
  const reindexRequired = Boolean(settings?.embedding_reindex_required)
    || active.fingerprint !== selected.fingerprint;

  return {
    primary: active.primary,
    fallback: active.fallback,
    providers: active.providers,
    indexing: selected.primary,
    indexingFallback: selected.fallback,
    indexingProviders: selected.providers,
    active,
    selected,
    vectorDimensions: active.vectorDimensions,
    schemaDimensions: active.schemaDimensions,
    activeFingerprint: active.fingerprint,
    selectedFingerprint: selected.fingerprint,
    activeGenerationId: active.generationId,
    targetGenerationId: trimOrNull(settings?.embedding_pending_generation_id)
      || (selected.fingerprint === active.fingerprint ? active.generationId : selected.generationId),
    reindexRequired,
    lastIndexedFingerprint,
    lastIndexedAt: trimOrNull(settings?.embedding_last_indexed_at) || null,
  };
}

export function readSearchQueryExpansionConfig(
  options?: {
    env?: EnvSource;
    settings?: SearchAiSettingsRow | null;
    secrets?: SearchAiSecretsRow | null;
  },
): SearchQueryExpansionRuntimeConfig {
  const env = getEnv(options?.env);
  const settings = options?.settings;
  const secrets = options?.secrets;
  const provider = normalizeChatProvider(
    env.QUERY_EXPANSION_PROVIDER
      || env.SEARCH_QUERY_EXPANSION_PROVIDER
      || settings?.chat_llm_provider
      || env.LLM_PROVIDER
      || DEFAULT_CHAT_PROVIDER,
  );
  const model = trimOrNull(
    env.QUERY_EXPANSION_MODEL
      || env.SEARCH_QUERY_EXPANSION_MODEL
      || settings?.chat_llm_model,
  ) || defaultChatModelForProvider(provider);

  return {
    provider,
    apiKey: getProviderApiKey(provider, env, secrets),
    baseUrl: normalizeBaseUrl(
      env.QUERY_EXPANSION_BASE_URL
        || env.SEARCH_QUERY_EXPANSION_BASE_URL
        || settings?.chat_llm_base_url,
      provider === "mock" ? null : defaultChatBaseUrlForProvider(provider),
    ),
    model,
  };
}
