import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { SearchContext } from "@/lib/search/context/types";
import {
  buildInlineSearchContextSummary,
  normalizeContextEmbeddingMode,
  type SearchContextEmbeddingMode,
} from "@/lib/search-query-embedding";

type AppSupabaseClient = SupabaseClient<Database>;

interface QueryEmbeddingResponse {
  embedding?: string | null;
  model?: string | null;
  provider?: string | null;
  dimensions?: number;
  storageDimensions?: number | null;
  debug?: {
    cacheHit?: boolean;
    cacheKey?: string;
    contextHash?: string | null;
    contextSummary?: string | null;
    contextSummarySource?: string;
    effectiveMode?: SearchContextEmbeddingMode;
    requestedMode?: SearchContextEmbeddingMode;
    sessionModeFallback?: boolean;
    reindexRequired?: boolean;
    embeddingConfigFingerprint?: string | null;
    indexedConfigFingerprint?: string | null;
    selectedEmbeddingConfigFingerprint?: string | null;
    activeEmbeddingGenerationId?: string | null;
    selectedEmbeddingGenerationId?: string | null;
  } | null;
}

export interface FetchSearchQueryEmbeddingOptions {
  context?: SearchContext | null;
  contextHash?: string | null;
  contextSummary?: string | null;
  sessionId?: string | null;
  mode?: SearchContextEmbeddingMode;
}

export async function fetchSearchQueryEmbedding(
  client: AppSupabaseClient,
  query: string,
  options?: FetchSearchQueryEmbeddingOptions,
) {
  if (!client.functions?.invoke) {
    return {
      embedding: null,
      model: null,
      debug: null,
    };
  }

  const context = options?.context;
  const mode = normalizeContextEmbeddingMode(options?.mode || "concat");
  const contextHash = options?.contextHash ?? context?.contextHash ?? null;
  const contextSummary = options?.contextSummary ?? buildInlineSearchContextSummary(context);
  const sessionId = options?.sessionId ?? context?.session.sessionId ?? null;
  const { data, error } = await client.functions.invoke<QueryEmbeddingResponse>("search-query-embed", {
    body: {
      query,
      contextHash,
      contextSummary,
      sessionId,
      mode,
    },
  });

  if (error) {
    throw error;
  }

  return {
    embedding: typeof data?.embedding === "string" ? data.embedding : null,
    model: typeof data?.model === "string" ? data.model : null,
    provider: typeof data?.provider === "string" ? data.provider : null,
    dimensions: typeof data?.dimensions === "number" ? data.dimensions : null,
    storageDimensions: typeof data?.storageDimensions === "number" ? data.storageDimensions : null,
    debug: data?.debug || null,
  };
}
