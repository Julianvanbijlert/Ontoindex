export {
  analyzeSearchQuery,
  normalizeSearchQuery,
  searchQueryUnderstanding,
  shouldAttemptDenseRetrieval,
  type SearchAmbiguityFlag,
  type SearchAmbiguityLevel,
  type SearchConfidence,
  type SearchDenseGateReason,
  type SearchQueryUnderstandingInput,
  type SearchIntent,
  type SearchQueryAnalysis,
  type SearchQueryDebugInfo,
  type SearchQuerySessionContext,
  type SearchQueryUnderstanding,
  type SearchRewriteMode,
  type SearchRewriteCandidate,
  type SearchRewriteStrategy,
} from "@/lib/search-query-understanding";
export type {
  RetrievalPlan,
  SearchDenseRetrievalGate,
  SearchRewriteMode,
} from "@/lib/search-query-planning";

import type { SearchConfidence, SearchQueryAnalysis } from "@/lib/search-query-understanding";

export function buildSearchFailureBucket(input: {
  analysis: SearchQueryAnalysis;
  resultCount: number;
  fallbackUsed: boolean;
  topConfidence?: SearchConfidence | null;
}) {
  if (input.fallbackUsed) {
    return "legacy_fallback";
  }

  if (input.resultCount === 0 && input.analysis.ambiguityLevel === "high") {
    return "ambiguous_zero_results";
  }

  if (input.resultCount === 0 && input.analysis.exactMatchSensitive) {
    return "exact_match_miss";
  }

  if (input.resultCount > 0 && input.topConfidence === "weak") {
    return "weak_evidence";
  }

  return null;
}

export function buildLegacyConfidence(relevance: number, analysis: SearchQueryAnalysis): SearchConfidence {
  if (analysis.exactMatchSensitive && relevance >= 75) {
    return "strong";
  }

  if (relevance >= 60) {
    return "strong";
  }

  if (relevance >= 25) {
    return "medium";
  }

  return "weak";
}
