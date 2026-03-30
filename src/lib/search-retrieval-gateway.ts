import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { searchRuntimeConfig } from "@/lib/search-config";
import { normalizeSearchText } from "@/lib/search-normalization";
import { resolveSearchContextRollout, type SearchContextRolloutMode } from "@/lib/search-context-rollout";
import type { SearchContext } from "@/lib/search/context/types";
import { logSearchDiagnostics, buildSearchRetrievalDiagnostics, type SearchRetrievalDiagnostics } from "@/lib/search-diagnostics-logger";
import { fetchSearchQueryEmbedding } from "@/lib/search-index-service";
import { buildSearchQueryEmbeddingCacheKey } from "@/lib/search-query-embedding";
import {
  analyzeSearchQuery,
  buildLegacyConfidence,
} from "@/lib/search-query";
import { buildSearchQueryVariants, resolveSearchSimilarityExpansion } from "@/lib/search-similarity-expansion";
import type { SearchQueryAnalysis } from "@/lib/search-query-understanding";
import { filterAndSortSearchResults } from "@/lib/search-legacy-retrieval";
import { callHybridSearchRpc } from "@/lib/search-rpc";
import { buildLegacyMatchReasons, getBackendRankingScore, mapBackendRowToResult } from "@/lib/search-result-mapper";
import type { SearchBackendRow, SearchFilters, SearchResultItem, SearchSort } from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;

export interface SearchExecutionOptions {
  signal?: AbortSignal;
  bypassCache?: boolean;
  context?: SearchContext | null;
  rolloutMode?: SearchContextRolloutMode;
  requestedContextUse?: SearchRetrievalDiagnostics["context"]["requestedUse"];
}

export interface SearchRetrievalResponse {
  analysis: SearchQueryAnalysis;
  diagnostics: SearchRetrievalDiagnostics;
  results: SearchResultItem[];
}

interface SearchCacheEntry {
  expiresAt: number;
  response: SearchRetrievalResponse;
}

interface SearchEmbeddingCacheEntry {
  embedding: string | null;
  expiresAt: number;
}

interface SearchContextTelemetry {
  requestedUse: SearchRetrievalDiagnostics["context"]["requestedUse"];
  effectiveUse: SearchRetrievalDiagnostics["context"]["effectiveUse"];
  rewriteMode: SearchRetrievalDiagnostics["context"]["rewriteMode"];
  driftDetected: boolean;
  rolloutMode: SearchRetrievalDiagnostics["context"]["rolloutMode"];
  pipelineFallbackUsed: boolean;
  pipelineFailureReason: string | null;
}

interface SearchGatewayRequest {
  query: string;
  filters: SearchFilters;
  sortBy: SearchSort;
  currentUserId?: string | null;
  options?: SearchExecutionOptions;
}

const searchResponseCache = new Map<string, SearchCacheEntry>();
const queryEmbeddingCache = new Map<string, SearchEmbeddingCacheEntry>();
const inFlightSearchRequests = new Map<string, Promise<SearchRetrievalResponse>>();

function getTimestamp() {
  return Date.now();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Search request was aborted.", "AbortError");
  }
}

function isBackendUnavailable(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return true;
  }

  const message = String((error as { message?: unknown }).message || "").toLowerCase();

  return (
    message.includes("search_entities_hybrid")
    || message.includes("schema cache")
    || message.includes("could not find the function")
    || message.includes("relation \"public.search_documents\" does not exist")
    || message.includes("legacy")
  );
}

function isContextPipelineFailure(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  const message = String((error as { message?: unknown }).message || "").toLowerCase();

  return (
    message.includes("_context_json")
    || message.includes("_session_id")
    || message.includes("invalid input syntax for type uuid")
    || message.includes("search_session_events")
    || message.includes("activity_events")
    || message.includes("json")
  );
}

function buildSearchCacheKey(
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
  context?: SearchContext | null,
) {
  return JSON.stringify({
    query: normalizeSearchText(query),
    filters,
    sortBy,
    currentUserId: currentUserId || null,
    contextHash: context?.contextHash || null,
    contextUse: context?.retrievalPlan.contextUse || "none",
    flags: {
      fallback: searchRuntimeConfig.enableFallback,
      contextFallback: searchRuntimeConfig.enableContextFallback,
      reranking: searchRuntimeConfig.enableReranking,
      rewriting: searchRuntimeConfig.enableQueryRewriting,
      contextEmbeddingMode: searchRuntimeConfig.contextEmbeddingMode,
      contextRolloutMode: searchRuntimeConfig.contextRolloutMode,
    },
  });
}

function cleanupExpiredResponseCache(now: number) {
  for (const [key, entry] of searchResponseCache.entries()) {
    if (entry.expiresAt <= now) {
      searchResponseCache.delete(key);
    }
  }
}

function cleanupExpiredEmbeddingCache(now: number) {
  for (const [key, entry] of queryEmbeddingCache.entries()) {
    if (entry.expiresAt <= now) {
      queryEmbeddingCache.delete(key);
    }
  }
}

function cloneCachedResponse(
  entry: SearchCacheEntry,
  cacheStartedAt: number,
): SearchRetrievalResponse {
  const totalMs = getTimestamp() - cacheStartedAt;

  return {
    analysis: entry.response.analysis,
    results: entry.response.results,
    diagnostics: {
      ...entry.response.diagnostics,
      cacheHit: true,
      stageTimings: {
        ...entry.response.diagnostics.stageTimings,
        cacheMs: totalMs,
        totalMs,
      },
    },
  };
}

function getCandidateLimit(analysis: SearchQueryAnalysis) {
  return analysis.exactMatchSensitive
    ? searchRuntimeConfig.exactMatchCandidateLimit
    : searchRuntimeConfig.hybridCandidateLimit;
}

function buildContextTelemetry(
  analysis: SearchQueryAnalysis,
  context?: SearchContext | null,
  overrides: Partial<SearchContextTelemetry> = {},
): SearchContextTelemetry {
  return {
    requestedUse: overrides.requestedUse || analysis.retrievalPlan.contextUse,
    effectiveUse: overrides.effectiveUse || context?.retrievalPlan.contextUse || "none",
    rewriteMode: overrides.rewriteMode || analysis.retrievalPlan.rewriteMode,
    driftDetected: overrides.driftDetected ?? analysis.debug.rewriteGuardrails.driftDetected,
    rolloutMode: overrides.rolloutMode || "full",
    pipelineFallbackUsed: overrides.pipelineFallbackUsed ?? false,
    pipelineFailureReason: overrides.pipelineFailureReason || null,
  };
}

function sortBackendRows(rows: SearchBackendRow[]) {
  const preferRerankScore = searchRuntimeConfig.enableReranking;

  return [...rows].sort((left, right) =>
    getBackendRankingScore(right, { preferRerankScore })
    - getBackendRankingScore(left, { preferRerankScore }));
}

async function resolveQueryEmbedding(
  client: AppSupabaseClient,
  analysis: SearchQueryAnalysis,
  queryForEmbedding: string,
  context?: SearchContext | null,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);

  if (!analysis.normalizedQuery || !analysis.shouldAttemptDense) {
    return null;
  }

  const embeddingQuery = queryForEmbedding || analysis.rewrittenQueries[0] || analysis.originalQuery;
  const embeddingCacheKey = buildSearchQueryEmbeddingCacheKey(
    embeddingQuery,
    context?.contextHash || null,
    searchRuntimeConfig.contextEmbeddingMode,
  );
  const now = getTimestamp();

  if (searchRuntimeConfig.enableEmbeddingCache) {
    cleanupExpiredEmbeddingCache(now);
    const cachedEmbedding = queryEmbeddingCache.get(embeddingCacheKey);

    if (cachedEmbedding && cachedEmbedding.expiresAt > now) {
      return cachedEmbedding.embedding;
    }
  }

  const response = await fetchSearchQueryEmbedding(client, embeddingQuery, {
    context,
    mode: searchRuntimeConfig.contextEmbeddingMode,
  });
  throwIfAborted(signal);

  if (searchRuntimeConfig.enableEmbeddingCache) {
    queryEmbeddingCache.set(embeddingCacheKey, {
      embedding: response.embedding,
      expiresAt: now + searchRuntimeConfig.queryEmbeddingCacheTtlMs,
    });
  }

  return response.embedding;
}

async function runLegacyFallback(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
) {
  const normalizedQuery = normalizeSearchText(query);

  const [definitionsResponse, ontologiesResponse] = await Promise.all([
    client
      .from("definitions")
      .select("id, title, description, content, ontology_id, priority, status, tags, updated_at, view_count, created_by, ontologies(id, title)")
      .eq("is_deleted", false),
    client
      .from("ontologies")
      .select("id, title, description, status, tags, updated_at, view_count, created_by"),
  ]);

  if (definitionsResponse.error) {
    throw definitionsResponse.error;
  }

  if (ontologiesResponse.error) {
    throw ontologiesResponse.error;
  }

  return filterAndSortSearchResults(
    definitionsResponse.data || [],
    ontologiesResponse.data || [],
    normalizedQuery,
    filters,
    sortBy,
    currentUserId,
  );
}

async function executeSearch(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
  options?: SearchExecutionOptions,
): Promise<SearchRetrievalResponse> {
  const totalStartedAt = getTimestamp();
  const analysisStartedAt = getTimestamp();
  const analysis = analyzeSearchQuery(query, {
    context: options?.context,
  });
  const stageTimings: SearchRetrievalDiagnostics["stageTimings"] = {
    analysisMs: getTimestamp() - analysisStartedAt,
    understandingMs: 0,
    cacheMs: 0,
    embeddingMs: 0,
    retrievalMs: 0,
    rpcMs: 0,
    rerankMs: 0,
    fallbackMs: 0,
    totalMs: 0,
  };
  stageTimings.understandingMs = stageTimings.analysisMs;

  const contextTelemetry = buildContextTelemetry(analysis, options?.context, {
    requestedUse: options?.requestedContextUse || analysis.retrievalPlan.contextUse,
    rolloutMode: options?.rolloutMode || "full",
  });

  throwIfAborted(options?.signal);

  const similarityExpansion = await resolveSearchSimilarityExpansion(client, {
    query,
    analysis,
    filters,
  });
  const queryVariants = buildSearchQueryVariants(query, analysis, similarityExpansion.signals);
  const queryForEmbedding = queryVariants.join(" ");
  let queryEmbedding: string | null = null;

  if (analysis.shouldAttemptDense) {
    const embeddingStartedAt = getTimestamp();

    try {
      queryEmbedding = await resolveQueryEmbedding(client, analysis, queryForEmbedding, options?.context, options?.signal);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      console.warn("Search query embedding unavailable", { error });
    }

    stageTimings.embeddingMs = getTimestamp() - embeddingStartedAt;
  }

  let fallbackUsed = false;

  try {
    const retrievalStartedAt = getTimestamp();
    const rpcStartedAt = getTimestamp();
    const { data, error } = await callHybridSearchRpc(client, {
      query,
      filters,
      sortBy,
      analysis,
      queryEmbedding,
      candidateLimit: getCandidateLimit(analysis),
      context: options?.context,
      queryVariants,
      similaritySignals: similarityExpansion.signals,
    });
    stageTimings.rpcMs = getTimestamp() - rpcStartedAt;
    throwIfAborted(options?.signal);

    if (error) {
      throw error;
    }

    const rerankStartedAt = getTimestamp();
    const orderedRows = sortBackendRows(data || []);
    const results = orderedRows.map((row) =>
      mapBackendRowToResult(row, analysis, {
        preferRerankScore: searchRuntimeConfig.enableReranking,
      }));
    stageTimings.rerankMs = getTimestamp() - rerankStartedAt;
    stageTimings.retrievalMs = getTimestamp() - retrievalStartedAt;
    stageTimings.totalMs = getTimestamp() - totalStartedAt;

    const diagnostics = buildSearchRetrievalDiagnostics(
      results,
      stageTimings,
      fallbackUsed,
      analysis,
      false,
      contextTelemetry,
    );
    const response = {
      analysis,
      diagnostics,
      results,
    };

    void logSearchDiagnostics(client, {
      analysis,
      diagnostics,
      filters,
      query,
      results,
    });

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if (options?.context && searchRuntimeConfig.enableContextFallback && isContextPipelineFailure(error)) {
      const contextlessResponse = await executeSearch(client, query, filters, sortBy, currentUserId, {
        ...options,
        context: null,
        bypassCache: true,
      });
      throwIfAborted(options?.signal);

      return {
        ...contextlessResponse,
        diagnostics: {
          ...contextlessResponse.diagnostics,
          stageTimings: {
            ...contextlessResponse.diagnostics.stageTimings,
            totalMs: getTimestamp() - totalStartedAt,
          },
          context: buildContextTelemetry(analysis, null, {
            requestedUse: options?.requestedContextUse || analysis.retrievalPlan.contextUse,
            effectiveUse: "none",
            rewriteMode: analysis.retrievalPlan.rewriteMode,
            driftDetected: analysis.debug.rewriteGuardrails.driftDetected,
            rolloutMode: options?.rolloutMode || "full",
            pipelineFallbackUsed: true,
            pipelineFailureReason: error instanceof Error ? error.message : "context_pipeline_failed",
          }),
          debug: {
            ...contextlessResponse.diagnostics.debug,
            requestedContextUse: options?.requestedContextUse || analysis.retrievalPlan.contextUse,
            effectiveContextUse: "none",
            rewriteMode: analysis.retrievalPlan.rewriteMode,
            driftDetected: analysis.debug.rewriteGuardrails.driftDetected,
          },
        },
      };
    }

    if (!isBackendUnavailable(error)) {
      throw error;
    }

    if (!searchRuntimeConfig.enableFallback) {
      throw new Error("Hybrid search is unavailable and fallback search is disabled.");
    }

    fallbackUsed = true;
    console.warn("Hybrid search unavailable, using legacy fallback.", { error });
    const fallbackStartedAt = getTimestamp();
    const legacyResults = await runLegacyFallback(client, query, filters, sortBy, currentUserId);
    throwIfAborted(options?.signal);
    stageTimings.fallbackMs = getTimestamp() - fallbackStartedAt;
    stageTimings.totalMs = getTimestamp() - totalStartedAt;

    const results = legacyResults.map((result) => ({
      ...result,
      confidence: buildLegacyConfidence(result.relevance, analysis),
      matchReasons: buildLegacyMatchReasons(result, analysis),
      evidenceExcerpt: result.evidenceExcerpt || null,
      retrievalStrategy: "legacy" as const,
    }));

    const diagnostics = buildSearchRetrievalDiagnostics(
      results,
      stageTimings,
      fallbackUsed,
      analysis,
      false,
      contextTelemetry,
    );
    const response = {
      analysis,
      diagnostics,
      results,
    };

    void logSearchDiagnostics(client, {
      analysis,
      diagnostics,
      filters,
      query,
      results,
    });

    return response;
  }
}

export const searchRetrievalGateway = {
  async search(
    client: AppSupabaseClient,
    request: SearchGatewayRequest,
  ): Promise<SearchRetrievalResponse> {
    return searchWithRetrievalGateway(
      client,
      request.query,
      request.filters,
      request.sortBy,
      request.currentUserId,
      request.options,
    );
  },
};

export async function searchWithRetrievalGateway(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
  options?: SearchExecutionOptions,
): Promise<SearchRetrievalResponse> {
  const contextResolution = resolveSearchContextRollout(options?.context);
  const effectiveOptions = {
    ...options,
    context: contextResolution.context,
    rolloutMode: contextResolution.rolloutMode,
    requestedContextUse: contextResolution.requestedContextUse,
  };
  const cacheKey = buildSearchCacheKey(query, filters, sortBy, currentUserId, contextResolution.context);
  const cacheStartedAt = getTimestamp();

  if (searchRuntimeConfig.enableResponseCache && !options?.bypassCache) {
    cleanupExpiredResponseCache(cacheStartedAt);
    const cachedResponse = searchResponseCache.get(cacheKey);

    if (cachedResponse && cachedResponse.expiresAt > cacheStartedAt) {
      throwIfAborted(options?.signal);
      const response = cloneCachedResponse(cachedResponse, cacheStartedAt);
      void logSearchDiagnostics(client, {
        analysis: response.analysis,
        diagnostics: response.diagnostics,
        filters,
        query,
        results: response.results,
      });
      return response;
    }

    const inFlightRequest = inFlightSearchRequests.get(cacheKey);

    if (inFlightRequest) {
      const response = cloneCachedResponse({
        expiresAt: cacheStartedAt + searchRuntimeConfig.searchResponseCacheTtlMs,
        response: await inFlightRequest,
      }, cacheStartedAt);
      throwIfAborted(options?.signal);
      void logSearchDiagnostics(client, {
        analysis: response.analysis,
        diagnostics: response.diagnostics,
        filters,
        query,
        results: response.results,
      });
      return response;
    }
  }

  const requestPromise = executeSearch(client, query, filters, sortBy, currentUserId, effectiveOptions);

  if (searchRuntimeConfig.enableResponseCache && !options?.bypassCache) {
    inFlightSearchRequests.set(cacheKey, requestPromise);
  }

  try {
    const response = await requestPromise;
    throwIfAborted(options?.signal);

    if (searchRuntimeConfig.enableResponseCache && !options?.bypassCache) {
      searchResponseCache.set(cacheKey, {
        response,
        expiresAt: getTimestamp() + searchRuntimeConfig.searchResponseCacheTtlMs,
      });
    }

    return response;
  } finally {
    inFlightSearchRequests.delete(cacheKey);
  }
}
