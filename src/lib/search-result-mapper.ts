import type { SearchQueryAnalysis } from "@/lib/search-query-understanding";
import type { SearchBackendRow, SearchResultItem } from "@/lib/search-types";
import { includesNormalizedText, normalizeSearchText } from "@/lib/search-normalization";

function toExplanationList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function buildLegacyMatchReasons(item: SearchResultItem, analysis: SearchQueryAnalysis) {
  if (!analysis.normalizedQuery) {
    return [];
  }

  const reasons: string[] = [];
  const normalizedTitle = normalizeSearchText(item.title);
  const normalizedDescription = normalizeSearchText(item.description);

  if (normalizedTitle === analysis.normalizedQuery) {
    reasons.push("Exact title match");
  } else if (normalizedTitle.includes(analysis.normalizedQuery)) {
    reasons.push("Matched title");
  }

  if (includesNormalizedText(item.ontologyTitle, analysis.normalizedQuery)) {
    reasons.push(`Matched ontology ${item.ontologyTitle}`);
  }

  if (item.tags.some((tag) => includesNormalizedText(tag, analysis.normalizedQuery))) {
    reasons.push("Matched tags");
  }

  if (reasons.length === 0 && normalizedDescription.includes(analysis.normalizedQuery)) {
    reasons.push("Matched description");
  }

  return reasons.slice(0, 3);
}

export function buildBackendMatchReasons(row: SearchBackendRow, analysis: SearchQueryAnalysis) {
  const reasons: string[] = [];
  const appliedBoosts = toExplanationList(row.applied_boosts);
  const appliedFilters = toExplanationList(row.applied_filters);

  if (row.exact_title_match) {
    reasons.push("Exact title match");
  } else if (row.title_match) {
    reasons.push("Matched title phrase");
  }

  if ((row.dense_score || 0) >= 0.78) {
    reasons.push("Strong semantic match");
  } else if ((row.dense_score || 0) >= 0.55) {
    reasons.push("Semantic match");
  }

  if ((row.token_coverage || 0) >= 0.75) {
    reasons.push("Strong keyword coverage");
  }

  if (appliedBoosts.includes("context:recent_session_activity")) {
    reasons.push("Boosted by recent activity");
  }

  if (appliedBoosts.includes("context:ontology_scope")) {
    reasons.push("Boosted within current ontology");
  }

  if (appliedBoosts.includes("context:authored_by_user")) {
    reasons.push("Boosted from your authored content");
  }

  if (appliedBoosts.includes("similarity:synonym_graph")) {
    reasons.push("Matched through a synonym");
  }

  if (appliedBoosts.includes("similarity:subset_query")) {
    reasons.push("Matched the core query subset");
  }

  if (appliedBoosts.includes("rewrite:heuristic_variant")) {
    reasons.push("Matched a normalized query variant");
  }

  if (appliedBoosts.includes("rewrite:llm_variant")) {
    reasons.push("Matched an expanded semantic variant");
  }

  if (appliedFilters.includes("context:ontology_scope")) {
    reasons.push("Scoped to current ontology");
  }

  if (
    reasons.length === 0
    && row.match_text
    && analysis.normalizedQuery
  ) {
    reasons.push("Matched supporting context");
  }

  return [...new Set(reasons)].slice(0, 3);
}

export function getBackendRankingScore(
  row: SearchBackendRow,
  input: {
    preferRerankScore: boolean;
  },
) {
  if (input.preferRerankScore && (row.rerank_score || 0) > 0) {
    return row.rerank_score || 0;
  }

  if ((row.fusion_score || 0) > 0) {
    return row.fusion_score || 0;
  }

  return Math.max(row.lexical_score || 0, row.dense_score || 0);
}

export function mapBackendRowToResult(
  row: SearchBackendRow,
  analysis: SearchQueryAnalysis,
  input: {
    preferRerankScore: boolean;
  } = {
    preferRerankScore: true,
  },
): SearchResultItem {
  const lexical = row.lexical_score || 0;
  const dense = row.dense_score || 0;
  const fusion = row.fusion_score || 0;
  const rerank = row.rerank_score || 0;
  const context = row.context_boost_score || 0;
  const appliedFilters = toExplanationList(row.applied_filters);
  const appliedBoosts = toExplanationList(row.applied_boosts);

  return {
    id: row.entity_id,
    type: row.entity_type,
    title: row.title,
    description: row.description || row.match_text || "",
    status: row.status,
    updatedAt: row.updated_at,
    viewCount: row.view_count || 0,
    tags: row.tags || [],
    ontologyId: row.ontology_id,
    ontologyTitle: row.ontology_title,
    priority: row.priority,
    relevance: getBackendRankingScore(row, input),
    confidence: row.retrieval_confidence || "weak",
    matchReasons: buildBackendMatchReasons(row, analysis),
    evidenceExcerpt: row.match_text,
    retrievalStrategy: "hybrid",
    scoreBreakdown: {
      lexical,
      dense,
      fusion,
      rerank,
      context,
    },
    explanation: {
      appliedFilters,
      appliedBoosts,
      contextUse: analysis.retrievalPlan.contextUse,
    },
  };
}
