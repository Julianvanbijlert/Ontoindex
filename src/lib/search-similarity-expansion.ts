import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { searchRuntimeConfig } from "@/lib/search-config";
import { expandQueryWithLLM } from "@/lib/search/query-expansion";
import { normalizeSearchLookupText, normalizeSearchText } from "@/lib/search-normalization";
import type { SearchQueryAnalysis } from "@/lib/search-query-understanding";
import type { SearchFilters } from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;

export type SearchSimilaritySignalSource =
  | "synonym_graph"
  | "query_subset"
  | "heuristic_rewrite"
  | "llm_expansion";

export interface SearchSimilaritySignal {
  source: SearchSimilaritySignalSource;
  originalTerm: string;
  expandedTerms: string[];
}

function dedupeVariants(values: string[]) {
  const deduped = new Map<string, string>();

  values.forEach((value) => {
    const normalized = normalizeSearchText(value);

    if (normalized && !deduped.has(normalized)) {
      deduped.set(normalized, value.trim().replace(/\s+/g, " "));
    }
  });

  return [...deduped.values()];
}

function buildSubsetSignals(query: string, analysis: SearchQueryAnalysis): SearchSimilaritySignal[] {
  const contentTokens = analysis.debug.tokens.filter((token) => token.length >= 3);

  if (analysis.exactMatchSensitive || contentTokens.length < 3) {
    return [];
  }

  const subsets = new Set<string>();
  subsets.add(contentTokens.slice(0, Math.min(contentTokens.length, 3)).join(" "));

  if (contentTokens.length >= 4) {
    subsets.add(contentTokens.slice(1, Math.min(contentTokens.length, 4)).join(" "));
  }

  const expandedTerms = [...subsets]
    .map((value) => value.trim())
    .filter((value) => value && value !== normalizeSearchText(query));

  if (expandedTerms.length === 0) {
    return [];
  }

  return [{
    source: "query_subset",
    originalTerm: query.trim(),
    expandedTerms,
  }];
}

async function buildLlmExpansionSignals(
  client: AppSupabaseClient,
  input: {
    query: string;
    analysis: SearchQueryAnalysis;
  },
) {
  if (
    !searchRuntimeConfig.enableLlmQueryExpansion
    || input.analysis.debug?.future?.llmRewriteEligible !== true
  ) {
    return [];
  }

  const expandedTerms = await expandQueryWithLLM(client, input.query);

  if (expandedTerms.length === 0) {
    return [];
  }

  return [{
    source: "llm_expansion" as const,
    originalTerm: input.query.trim(),
    expandedTerms: dedupeVariants(expandedTerms),
  }];
}

export async function resolveSearchSimilarityExpansion(
  client: AppSupabaseClient,
  input: {
    query: string;
    analysis: SearchQueryAnalysis;
    filters: SearchFilters;
  },
) {
  const normalizedQuery = normalizeSearchLookupText(input.query);
  const subsetSignals = buildSubsetSignals(input.query, input.analysis);
  const llmSignals = await buildLlmExpansionSignals(client, input);

  if (
    input.analysis.exactMatchSensitive
    || normalizedQuery.length < 3
  ) {
    return {
      signals: [...llmSignals, ...subsetSignals],
    };
  }

  if (input.analysis.tokenCount > 5) {
    return {
      signals: [...llmSignals, ...subsetSignals],
    };
  }

  const searchTerm = normalizedQuery.split(/\s+/).slice(0, 3).join(" ");
  let definitionQuery = client
    .from("definitions")
    .select("id, title")
    .eq("is_deleted", false)
    .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);

  if (input.filters.ontologyId !== "all") {
    definitionQuery = definitionQuery.eq("ontology_id", input.filters.ontologyId);
  }

  const definitionsResponse = await definitionQuery.limit(8);

  if (definitionsResponse.error || !definitionsResponse.data || definitionsResponse.data.length === 0) {
    return {
      signals: [...llmSignals, ...subsetSignals],
    };
  }

  const definitionIds = definitionsResponse.data.map((row) => row.id);
  const relationshipsResponse = await client
    .from("relationships")
    .select("source_id, target_id, type")
    .eq("type", "synonym_of")
    .or(`source_id.in.(${definitionIds.join(",")}),target_id.in.(${definitionIds.join(",")})`)
    .limit(16);

  if (relationshipsResponse.error || !relationshipsResponse.data || relationshipsResponse.data.length === 0) {
    return {
      signals: [...llmSignals, ...subsetSignals],
    };
  }

  const relatedIds = Array.from(new Set(
    relationshipsResponse.data.flatMap((relationship) => [relationship.source_id, relationship.target_id]),
  ));

  const relatedDefinitionsResponse = await client
    .from("definitions")
    .select("id, title")
    .in("id", relatedIds)
    .eq("is_deleted", false);

  if (relatedDefinitionsResponse.error || !relatedDefinitionsResponse.data) {
    return {
      signals: [...llmSignals, ...subsetSignals],
    };
  }

  const expandedTerms = relatedDefinitionsResponse.data
    .map((row) => row.title.trim())
    .filter((title) => title && normalizeSearchLookupText(title) !== normalizedQuery)
    .slice(0, 4);

  const dedupedExpandedTerms = dedupeVariants(expandedTerms);
  const signals = [...subsetSignals];

  if (dedupedExpandedTerms.length > 0) {
    signals.unshift({
      source: "synonym_graph",
      originalTerm: input.query.trim(),
      expandedTerms: dedupedExpandedTerms,
    });
  }

  if (llmSignals.length > 0) {
    signals.push(...llmSignals);
  }

  return {
    signals,
  };
}

export function buildSearchQueryVariants(
  query: string,
  analysis: SearchQueryAnalysis,
  signals: SearchSimilaritySignal[],
) {
  const variants: string[] = [query];

  analysis.rewriteCandidates
    .filter((candidate) => candidate.strategy !== "identity")
    .forEach((candidate) => {
      variants.push(candidate.query);
    });

  signals.forEach((signal) => {
    signal.expandedTerms.forEach((term) => {
      variants.push(term);
    });
  });

  return dedupeVariants(variants).slice(0, 8);
}
