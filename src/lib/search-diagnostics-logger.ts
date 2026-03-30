import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { SearchContextRolloutMode } from "@/lib/search-context-rollout";
import { buildSearchFailureBucket } from "@/lib/search-query";
import { logSearchQueryRpc } from "@/lib/search-rpc";
import type {
  SearchAmbiguityFlag,
  SearchConfidence,
  SearchIntent,
  SearchQueryAnalysis,
} from "@/lib/search-query-understanding";
import type { SearchFilters, SearchResultItem } from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;

export type SearchQueryType =
  | "identifier_lookup"
  | "exact_lookup"
  | "short_lookup"
  | "informational"
  | "exploratory";

export type SearchFailureCategory =
  | "fallback"
  | "query_understanding"
  | "retrieval"
  | "evidence"
  | "none";

export interface SearchFailureTaxonomy {
  bucket: string | null;
  category: SearchFailureCategory;
  reasons: string[];
  zeroResults: boolean;
  weakEvidence: boolean;
  fallbackUsed: boolean;
}

export interface SearchDebugInspection {
  query: string;
  queryType: SearchQueryType;
  intent: SearchIntent;
  ambiguityLevel: SearchQueryAnalysis["ambiguityLevel"];
  ambiguityFlags: SearchAmbiguityFlag[];
  exactMatchSensitive: boolean;
  rewrittenQueries: string[];
  rewriteConfidence: number;
  rewriteMode: SearchQueryAnalysis["retrievalPlan"]["rewriteMode"];
  shouldAttemptDense: boolean;
  denseRetrievalGate: SearchQueryAnalysis["retrievalPlan"]["denseRetrievalGate"];
  requestedContextUse: SearchQueryAnalysis["retrievalPlan"]["contextUse"];
  effectiveContextUse: SearchQueryAnalysis["retrievalPlan"]["contextUse"];
  driftDetected: boolean;
  retrievalConfidence: SearchConfidence | null;
  topResultIds: string[];
  topMatchReasons: string[][];
}

export interface SearchRetrievalDiagnostics {
  fallbackUsed: boolean;
  cacheHit: boolean;
  queryType: SearchQueryType;
  retrievalConfidence: SearchConfidence | null;
  stageTimings: {
    analysisMs: number;
    understandingMs: number;
    cacheMs: number;
    embeddingMs: number;
    retrievalMs: number;
    rpcMs: number;
    rerankMs: number;
    fallbackMs: number;
    totalMs: number;
  };
  sourceContributions: {
    lexicalResultCount: number;
    denseResultCount: number;
    contextBoostedResultCount: number;
    lexicalTopScore: number;
    denseTopScore: number;
    fusionTopScore: number;
    rerankTopScore: number;
    contextTopScore: number;
  };
  context: {
    requestedUse: SearchQueryAnalysis["retrievalPlan"]["contextUse"];
    effectiveUse: SearchQueryAnalysis["retrievalPlan"]["contextUse"];
    rewriteMode: SearchQueryAnalysis["retrievalPlan"]["rewriteMode"];
    driftDetected: boolean;
    rolloutMode: SearchContextRolloutMode;
    pipelineFallbackUsed: boolean;
    pipelineFailureReason: string | null;
  };
  failure: SearchFailureTaxonomy;
  debug: SearchDebugInspection;
}

export interface SearchObservabilityEvent {
  analysis: SearchQueryAnalysis;
  debug: SearchDebugInspection;
  diagnostics: SearchRetrievalDiagnostics;
  filters: SearchFilters;
  query: string;
  results: SearchResultItem[];
}

function resolveQueryType(analysis: SearchQueryAnalysis): SearchQueryType {
  if (analysis.looksIdentifierLike) {
    return "identifier_lookup";
  }

  if (analysis.exactMatchSensitive && analysis.hasQuotedPhrase) {
    return "exact_lookup";
  }

  if (analysis.exactMatchSensitive && analysis.tokenCount <= 2) {
    return "short_lookup";
  }

  if (analysis.intent === "informational") {
    return "informational";
  }

  return "exploratory";
}

function buildFailureReasons(input: {
  analysis: SearchQueryAnalysis;
  bucket: string | null;
  fallbackUsed: boolean;
  resultCount: number;
  retrievalConfidence: SearchConfidence | null;
}) {
  const reasons: string[] = [];

  if (input.fallbackUsed) {
    reasons.push("backend_unavailable");
  }

  if (input.resultCount === 0) {
    reasons.push("zero_results");
  }

  if (input.analysis.ambiguityFlags.length > 0) {
    reasons.push(...input.analysis.ambiguityFlags.map((flag) => `ambiguity:${flag}`));
  }

  if (input.analysis.exactMatchSensitive) {
    reasons.push("exact_match_sensitive");
  }

  if (input.retrievalConfidence === "weak") {
    reasons.push("weak_retrieval_confidence");
  }

  if (input.bucket === "exact_match_miss") {
    reasons.push("exact_match_missed");
  }

  return [...new Set(reasons)];
}

export function buildSearchFailureTaxonomy(input: {
  analysis: SearchQueryAnalysis;
  fallbackUsed: boolean;
  resultCount: number;
  retrievalConfidence: SearchConfidence | null;
}) {
  const bucket = buildSearchFailureBucket({
    analysis: input.analysis,
    resultCount: input.resultCount,
    fallbackUsed: input.fallbackUsed,
    topConfidence: input.retrievalConfidence,
  });

  let category: SearchFailureCategory = "none";

  if (bucket === "legacy_fallback") {
    category = "fallback";
  } else if (bucket === "ambiguous_zero_results") {
    category = "query_understanding";
  } else if (bucket === "exact_match_miss") {
    category = "retrieval";
  } else if (bucket === "weak_evidence") {
    category = "evidence";
  } else if (input.resultCount === 0) {
    category = "retrieval";
  }

  return {
    bucket,
    category,
    reasons: buildFailureReasons({
      analysis: input.analysis,
      bucket,
      fallbackUsed: input.fallbackUsed,
      resultCount: input.resultCount,
      retrievalConfidence: input.retrievalConfidence,
    }),
    zeroResults: input.resultCount === 0,
    weakEvidence: input.retrievalConfidence === "weak",
    fallbackUsed: input.fallbackUsed,
  } satisfies SearchFailureTaxonomy;
}

export function buildSearchQueryInspection(
  analysis: SearchQueryAnalysis,
  diagnostics: Pick<SearchRetrievalDiagnostics, "queryType" | "retrievalConfidence" | "context">,
  results: SearchResultItem[],
): SearchDebugInspection {
  return {
    query: analysis.originalQuery,
    queryType: diagnostics.queryType,
    intent: analysis.intent,
    ambiguityLevel: analysis.ambiguityLevel,
    ambiguityFlags: analysis.ambiguityFlags,
    exactMatchSensitive: analysis.exactMatchSensitive,
    rewrittenQueries: analysis.rewrittenQueries,
    rewriteConfidence: analysis.rewriteConfidence,
    rewriteMode: analysis.retrievalPlan.rewriteMode,
    shouldAttemptDense: analysis.shouldAttemptDense,
    denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
    requestedContextUse: diagnostics.context.requestedUse,
    effectiveContextUse: diagnostics.context.effectiveUse,
    driftDetected: analysis.debug.rewriteGuardrails.driftDetected,
    retrievalConfidence: diagnostics.retrievalConfidence,
    topResultIds: results.slice(0, 5).map((result) => result.id),
    topMatchReasons: results.slice(0, 5).map((result) => result.matchReasons || []),
  };
}

export function buildSearchRetrievalDiagnostics(
  results: SearchResultItem[],
  stageTimings: SearchRetrievalDiagnostics["stageTimings"],
  fallbackUsed: boolean,
  analysis: SearchQueryAnalysis,
  cacheHit = false,
  contextInput: Partial<SearchRetrievalDiagnostics["context"]> = {},
): SearchRetrievalDiagnostics {
  const retrievalConfidence = results[0]?.confidence || null;
  const queryType = resolveQueryType(analysis);
  const failure = buildSearchFailureTaxonomy({
    analysis,
    fallbackUsed,
    resultCount: results.length,
    retrievalConfidence,
  });
  const baseDiagnostics = {
    fallbackUsed,
    cacheHit,
    queryType,
    retrievalConfidence,
    stageTimings,
    sourceContributions: {
      lexicalResultCount: results.filter((result) => (result.scoreBreakdown?.lexical || 0) > 0).length,
      denseResultCount: results.filter((result) => (result.scoreBreakdown?.dense || 0) > 0).length,
      contextBoostedResultCount: results.filter((result) => (result.scoreBreakdown?.context || 0) > 0).length,
      lexicalTopScore: Math.max(0, ...results.map((result) => result.scoreBreakdown?.lexical || 0)),
      denseTopScore: Math.max(0, ...results.map((result) => result.scoreBreakdown?.dense || 0)),
      fusionTopScore: Math.max(0, ...results.map((result) => result.scoreBreakdown?.fusion || 0)),
      rerankTopScore: Math.max(0, ...results.map((result) => result.scoreBreakdown?.rerank || result.relevance || 0)),
      contextTopScore: Math.max(0, ...results.map((result) => result.scoreBreakdown?.context || 0)),
    },
    context: {
      requestedUse: contextInput.requestedUse || analysis.retrievalPlan.contextUse,
      effectiveUse: contextInput.effectiveUse || analysis.retrievalPlan.contextUse,
      rewriteMode: contextInput.rewriteMode || analysis.retrievalPlan.rewriteMode,
      driftDetected: contextInput.driftDetected ?? analysis.debug.rewriteGuardrails.driftDetected,
      rolloutMode: contextInput.rolloutMode || "full",
      pipelineFallbackUsed: contextInput.pipelineFallbackUsed ?? false,
      pipelineFailureReason: contextInput.pipelineFailureReason || null,
    },
    failure,
  };

  return {
    ...baseDiagnostics,
    debug: buildSearchQueryInspection(analysis, baseDiagnostics, results),
  };
}

export function buildSearchObservabilityEvent(input: {
  analysis: SearchQueryAnalysis;
  diagnostics: SearchRetrievalDiagnostics;
  filters: SearchFilters;
  query: string;
  results: SearchResultItem[];
}): SearchObservabilityEvent {
  return {
    analysis: input.analysis,
    debug: input.diagnostics.debug,
    diagnostics: input.diagnostics,
    filters: input.filters,
    query: input.query,
    results: input.results,
  };
}

export async function logSearchDiagnostics(
  client: AppSupabaseClient,
  input: {
    analysis: SearchQueryAnalysis;
    diagnostics: SearchRetrievalDiagnostics;
    filters: SearchFilters;
    query: string;
    results: SearchResultItem[];
  },
) {
  const event = buildSearchObservabilityEvent(input);

  await logSearchQueryRpc(client, {
    query: event.query,
    filters: event.filters,
    analysis: event.analysis,
    diagnostics: event.diagnostics,
    results: event.results,
  }).catch(() => null);
}
