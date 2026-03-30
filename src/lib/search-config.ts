function readBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value == null || value === "") {
    return fallback;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function readNumberFlag(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readContextEmbeddingMode(value: string | undefined, fallback: "none" | "concat" | "session") {
  if (value === "none" || value === "concat" || value === "session") {
    return value;
  }

  return fallback;
}

function readContextRolloutMode(value: string | undefined, fallback: "off" | "shadow" | "light" | "full") {
  if (value === "off" || value === "shadow" || value === "light" || value === "full") {
    return value;
  }

  return fallback;
}

const isTestMode = import.meta.env.MODE === "test";

export interface SearchRuntimeConfig {
  queryDebounceMs: number;
  searchResponseCacheTtlMs: number;
  queryEmbeddingCacheTtlMs: number;
  hybridCandidateLimit: number;
  exactMatchCandidateLimit: number;
  enableFallback: boolean;
  enableContextFallback: boolean;
  enableQueryRewriting: boolean;
  enableLlmQueryExpansion: boolean;
  enableReranking: boolean;
  enableResponseCache: boolean;
  enableEmbeddingCache: boolean;
  contextEmbeddingMode: "none" | "concat" | "session";
  contextRolloutMode: "off" | "shadow" | "light" | "full";
}

export const searchRuntimeConfig: SearchRuntimeConfig = {
  queryDebounceMs: readNumberFlag(
    import.meta.env.VITE_SEARCH_DEBOUNCE_MS,
    isTestMode ? 0 : 250,
  ),
  searchResponseCacheTtlMs: readNumberFlag(
    import.meta.env.VITE_SEARCH_RESPONSE_CACHE_TTL_MS,
    30_000,
  ),
  queryEmbeddingCacheTtlMs: readNumberFlag(
    import.meta.env.VITE_SEARCH_EMBEDDING_CACHE_TTL_MS,
    300_000,
  ),
  hybridCandidateLimit: readNumberFlag(
    import.meta.env.VITE_SEARCH_HYBRID_CANDIDATE_LIMIT,
    40,
  ),
  exactMatchCandidateLimit: readNumberFlag(
    import.meta.env.VITE_SEARCH_EXACT_CANDIDATE_LIMIT,
    20,
  ),
  enableFallback: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_FALLBACK,
    true,
  ),
  enableContextFallback: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_CONTEXT_FALLBACK,
    true,
  ),
  enableQueryRewriting: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_QUERY_REWRITING,
    true,
  ),
  enableLlmQueryExpansion: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_LLM_QUERY_EXPANSION,
    true,
  ),
  enableReranking: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_RERANKING,
    true,
  ),
  enableResponseCache: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_RESPONSE_CACHE,
    true,
  ),
  enableEmbeddingCache: readBooleanFlag(
    import.meta.env.VITE_SEARCH_ENABLE_EMBEDDING_CACHE,
    true,
  ),
  contextEmbeddingMode: readContextEmbeddingMode(
    import.meta.env.VITE_SEARCH_CONTEXT_EMBEDDING_MODE,
    "concat",
  ),
  contextRolloutMode: readContextRolloutMode(
    import.meta.env.VITE_SEARCH_CONTEXT_ROLLOUT_MODE,
    "full",
  ),
};
