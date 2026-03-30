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
  debug?: {
    cacheHit?: boolean;
    cacheKey?: string;
    contextHash?: string | null;
    contextSummary?: string | null;
    contextSummarySource?: string;
    effectiveMode?: SearchContextEmbeddingMode;
    requestedMode?: SearchContextEmbeddingMode;
    sessionModeFallback?: boolean;
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
    debug: data?.debug || null,
  };
}
