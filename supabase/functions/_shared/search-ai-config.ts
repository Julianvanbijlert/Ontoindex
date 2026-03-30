import type { ChatProvider, EmbeddingProvider } from "../../../src/lib/ai/provider-types.ts";
import {
  DEFAULT_CHAT_PROVIDER,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_FALLBACK_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_PROVIDER,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_CHAT_MODEL,
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
  embedding_provider?: string | null;
  embedding_model?: string | null;
  embedding_base_url?: string | null;
  embedding_fallback_provider?: string | null;
  embedding_fallback_model?: string | null;
  embedding_fallback_base_url?: string | null;
  embedding_vector_dimensions?: number | null;
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
  vectorDimensions: number;
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

function getEnv(env?: EnvSource) {
  return env || Deno.env.toObject();
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
    case "local":
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
  const primaryProvider = normalizeEmbeddingProvider(
    env.EMBEDDING_PROVIDER
      || env.SEARCH_EMBEDDING_PROVIDER
      || settings?.embedding_provider
      || DEFAULT_EMBEDDING_PROVIDER,
  );
  const fallbackProvider = normalizeEmbeddingProvider(
    env.EMBEDDING_FALLBACK_PROVIDER
      || env.SEARCH_EMBEDDING_FALLBACK_PROVIDER
      || settings?.embedding_fallback_provider
      || "huggingface",
  );
  const primary = buildEmbeddingProviderConfig(primaryProvider, {
    model: env.SEARCH_EMBEDDING_MODEL
      || env.EMBEDDING_MODEL
      || settings?.embedding_model
      || DEFAULT_EMBEDDING_MODEL,
    baseUrl: env.EMBEDDING_BASE_URL
      || env.SEARCH_EMBEDDING_BASE_URL
      || settings?.embedding_base_url,
    env,
    secrets,
  });
  const fallback = fallbackProvider === primary.provider
    ? null
    : buildEmbeddingProviderConfig(fallbackProvider, {
        model: env.EMBEDDING_FALLBACK_MODEL
          || env.SEARCH_EMBEDDING_FALLBACK_MODEL
          || settings?.embedding_fallback_model
          || DEFAULT_EMBEDDING_FALLBACK_MODEL,
        baseUrl: env.EMBEDDING_FALLBACK_BASE_URL
          || env.SEARCH_EMBEDDING_FALLBACK_BASE_URL
          || settings?.embedding_fallback_base_url,
        env,
        secrets,
      });

  return {
    primary,
    fallback,
    providers: [primary, ...(fallback ? [fallback] : [])],
    vectorDimensions: normalizeEmbeddingDimensions(
      Number(
        env.SEARCH_EMBEDDING_VECTOR_DIMENSION
          ?? env.EMBEDDING_VECTOR_DIMENSION
          ?? settings?.embedding_vector_dimensions
          ?? DEFAULT_EMBEDDING_DIMENSIONS,
      ),
    ),
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
  const defaultBaseUrl = provider === "gemini" ? DEFAULT_GEMINI_BASE_URL : DEFAULT_DEEPSEEK_BASE_URL;

  return {
    provider,
    apiKey: getProviderApiKey(provider, env, secrets),
    baseUrl: normalizeBaseUrl(
      env.QUERY_EXPANSION_BASE_URL
        || env.SEARCH_QUERY_EXPANSION_BASE_URL
        || settings?.chat_llm_base_url,
      provider === "mock" ? null : defaultBaseUrl,
    ),
    model: model || DEFAULT_GEMINI_CHAT_MODEL,
  };
}
