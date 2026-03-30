import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { SearchRetrievalDiagnostics } from "@/lib/search-diagnostics-logger";
import type { SearchContext } from "@/lib/search/context/types";
import type { SearchQueryAnalysis } from "@/lib/search-query-understanding";
import type { SearchSimilaritySignal } from "@/lib/search-similarity-expansion";
import type { SearchFilters, SearchHistoryEntry, SearchResultItem, SearchSort } from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;
type SearchHybridArgs = Database["public"]["Functions"]["search_entities_hybrid"]["Args"];
type SearchHybridReturns = Database["public"]["Functions"]["search_entities_hybrid"]["Returns"];
type LogSearchArgs = Database["public"]["Functions"]["log_search_query"]["Args"];
type SaveSearchHistoryArgs = Database["public"]["Functions"]["save_search_history"]["Args"];

function serializeSearchFilters(filters: SearchFilters): SearchHybridArgs["_filters"] {
  return {
    ontologyId: filters.ontologyId,
    tag: filters.tag,
    status: filters.status,
    type: filters.type,
    ownership: filters.ownership,
  };
}

function serializeSearchAnalysis(
  analysis: SearchQueryAnalysis,
  input?: {
    queryVariants?: string[];
    similaritySignals?: SearchSimilaritySignal[];
  },
): SearchHybridArgs["_analysis"] {
  return {
    originalQuery: analysis.originalQuery,
    normalizedQuery: analysis.normalizedQuery,
    rewrittenQueries: analysis.rewrittenQueries,
    rewriteCandidates: analysis.rewriteCandidates.map((candidate) => ({
      query: candidate.query,
      normalizedQuery: candidate.normalizedQuery,
      strategy: candidate.strategy,
      confidence: candidate.confidence,
    })),
    rewriteConfidence: analysis.rewriteConfidence,
    intent: analysis.intent,
    ambiguityLevel: analysis.ambiguityLevel,
    ambiguityFlags: analysis.ambiguityFlags,
    exactMatchSensitive: analysis.exactMatchSensitive,
    tokenCount: analysis.tokenCount,
    hasQuotedPhrase: analysis.hasQuotedPhrase,
    looksIdentifierLike: analysis.looksIdentifierLike,
    shouldAttemptDense: analysis.shouldAttemptDense,
    retrievalPlan: analysis.retrievalPlan,
    debug: analysis.debug,
    retrievalVariants: {
      queryVariants: input?.queryVariants || [],
      similaritySignals: input?.similaritySignals || [],
    },
  };
}

function normalizeContextSessionId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function serializeSearchContext(context: SearchContext | null | undefined): SearchHybridArgs["_context_json"] {
  if (!context) {
    return {};
  }

  return {
    scope: {
      routePath: context.scope.routePath,
      page: context.scope.page,
      ontologyId: context.scope.ontologyId,
      ontologyLabel: context.scope.ontologyLabel || null,
      entityType: context.scope.entityType,
      status: context.scope.status,
      tag: context.scope.tag,
      ownership: context.scope.ownership,
    },
    session: {
      sessionId: context.session.sessionId,
      activeQuery: context.session.activeQuery,
      recentQueries: context.session.recentQueries.slice(0, 5),
      recentEntities: context.session.recentEntities.slice(0, 5).map((entity) => ({
        id: entity.id,
        type: entity.type,
        ontologyId: entity.ontologyId || null,
        title: entity.title || null,
      })),
    },
    user: {
      userId: context.user.userId,
      role: context.user.role,
      language: context.user.language,
      preferences: {
        contextualSearchOptIn: context.user.preferences.contextualSearchOptIn,
        viewPreference: context.user.preferences.viewPreference || null,
        formatPreference: context.user.preferences.formatPreference || null,
        sortPreference: context.user.preferences.sortPreference || null,
        groupByPreference: context.user.preferences.groupByPreference || null,
      },
    },
    retrievalPlan: context.retrievalPlan,
    contextHash: context.contextHash,
    debug: context.debug,
  };
}

export async function callHybridSearchRpc(
  client: AppSupabaseClient,
  input: {
    query: string;
    filters: SearchFilters;
    sortBy: SearchSort;
    analysis: SearchQueryAnalysis;
    queryEmbedding: string | null;
    candidateLimit: number;
    context?: SearchContext | null;
    queryVariants?: string[];
    similaritySignals?: SearchSimilaritySignal[];
  },
) {
  const args: SearchHybridArgs = {
    _query: input.query,
    _filters: serializeSearchFilters(input.filters),
    _sort_by: input.sortBy,
    _analysis: serializeSearchAnalysis(input.analysis, {
      queryVariants: input.queryVariants,
      similaritySignals: input.similaritySignals,
    }),
    _query_embedding: input.queryEmbedding,
    _candidate_limit: input.candidateLimit,
    _context_json: serializeSearchContext(input.context),
    _session_id: normalizeContextSessionId(input.context?.session.sessionId),
  };

  return client.rpc("search_entities_hybrid", args) as Promise<{
    data: SearchHybridReturns | null;
    error: Error | null;
  }>;
}

function serializeLogAnalysis(
  analysis: SearchQueryAnalysis,
  diagnostics: SearchRetrievalDiagnostics,
) {
  return {
    ...serializeSearchAnalysis(analysis),
    observability: {
      queryType: diagnostics.queryType,
      retrievalConfidence: diagnostics.retrievalConfidence,
      fallbackUsed: diagnostics.fallbackUsed,
      cacheHit: diagnostics.cacheHit,
      context: diagnostics.context,
      failure: diagnostics.failure,
      debug: diagnostics.debug,
    },
  };
}

function serializeTopResults(results: SearchResultItem[]): NonNullable<LogSearchArgs["_top_results"]> {
  return results.slice(0, 5).map((result) => ({
    id: result.id,
    type: result.type,
    confidence: result.confidence || "weak",
    retrievalStrategy: result.retrievalStrategy || "hybrid",
    matchReasons: result.matchReasons || [],
    scoreBreakdown: result.scoreBreakdown || null,
  }));
}

function serializeStageTimings(diagnostics: SearchRetrievalDiagnostics): NonNullable<LogSearchArgs["_stage_timings"]> {
  return {
    ...diagnostics.stageTimings,
    queryType: diagnostics.queryType,
    retrievalConfidence: diagnostics.retrievalConfidence,
    fallbackUsed: diagnostics.fallbackUsed,
    cacheHit: diagnostics.cacheHit,
    context: diagnostics.context,
    sourceContributions: diagnostics.sourceContributions,
  };
}

export async function logSearchQueryRpc(
  client: AppSupabaseClient,
  input: {
    query: string;
    filters: SearchFilters;
    analysis: SearchQueryAnalysis;
    diagnostics: SearchRetrievalDiagnostics;
    results: SearchResultItem[];
  },
) {
  const args: LogSearchArgs = {
    _query: input.query,
    _filters: serializeSearchFilters(input.filters),
    _analysis: serializeLogAnalysis(input.analysis, input.diagnostics),
    _strategy: input.diagnostics.fallbackUsed ? "legacy" : "hybrid",
    _result_count: input.results.length,
    _top_results: serializeTopResults(input.results),
    _stage_timings: serializeStageTimings(input.diagnostics),
    _weak_evidence: input.diagnostics.failure.weakEvidence,
    _failure_bucket: input.diagnostics.failure.bucket,
    _fallback_used: input.diagnostics.fallbackUsed,
  };

  return client.rpc("log_search_query", args);
}

export async function saveSearchHistoryRpc(
  client: AppSupabaseClient,
  query: string,
  filters: Record<string, unknown>,
) {
  const args: SaveSearchHistoryArgs = {
    _query: query.trim(),
    _filters: filters,
  };

  return client.rpc("save_search_history", args) as Promise<{
    data: SearchHistoryEntry | null;
    error: Error | null;
  }>;
}
