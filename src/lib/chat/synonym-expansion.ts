import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ChatExpansionSignal, ChatSessionSettings } from "@/lib/chat/types";
import { normalizeSearchLookupText, normalizeSearchText } from "@/lib/search-normalization";
import type { SearchQueryAnalysis } from "@/lib/search-query-understanding";

type AppSupabaseClient = SupabaseClient<Database>;

function normalizeToken(value: string) {
  return normalizeSearchLookupText(value);
}

function buildExpandedQuery(query: string, signals: ChatExpansionSignal[]) {
  const expansions = signals.flatMap((signal) => signal.expandedTerms).filter(Boolean);

  if (expansions.length === 0) {
    return query;
  }

  return `${query} ${Array.from(new Set(expansions)).join(" ")}`.trim();
}

export async function resolveChatSynonymExpansion(
  client: AppSupabaseClient,
  input: {
    query: string;
    analysis: SearchQueryAnalysis;
    settings: ChatSessionSettings;
  },
) {
  const normalizedQuery = normalizeToken(input.query);

  if (
    !input.settings.similarityExpansion
    || input.analysis.exactMatchSensitive
    || input.analysis.tokenCount > 4
    || normalizedQuery.length < 3
  ) {
    return {
      expandedQuery: input.query,
      signals: [] as ChatExpansionSignal[],
    };
  }

  const searchTerm = normalizedQuery.split(/\s+/).slice(0, 2).join(" ");
  const definitionsResponse = await client
    .from("definitions")
    .select("id, title")
    .eq("is_deleted", false)
    .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`)
    .limit(8);

  if (definitionsResponse.error || !definitionsResponse.data || definitionsResponse.data.length === 0) {
    return {
      expandedQuery: input.query,
      signals: [] as ChatExpansionSignal[],
    };
  }

  const definitionIds = definitionsResponse.data.map((row) => row.id);
  const relationshipsResponse = await client
    .from("relationships")
    .select("source_id, target_id, type")
    .eq("type", "synonym_of")
    .or(`source_id.in.(${definitionIds.join(",")}),target_id.in.(${definitionIds.join(",")})`)
    .limit(12);

  if (relationshipsResponse.error || !relationshipsResponse.data || relationshipsResponse.data.length === 0) {
    return {
      expandedQuery: input.query,
      signals: [] as ChatExpansionSignal[],
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
      expandedQuery: input.query,
      signals: [] as ChatExpansionSignal[],
    };
  }

  const expandedTerms = relatedDefinitionsResponse.data
    .map((row) => row.title.trim())
    .filter((title) => title && normalizeToken(title) !== normalizedQuery)
    .slice(0, 3);

  const dedupedExpandedTerms = Array.from(new Map(
    expandedTerms.map((title) => [normalizeSearchText(title), title]),
  ).values());

  if (dedupedExpandedTerms.length === 0) {
    return {
      expandedQuery: input.query,
      signals: [] as ChatExpansionSignal[],
    };
  }

  const signals: ChatExpansionSignal[] = [
    {
      source: "synonym_graph",
      originalTerm: input.query.trim(),
      expandedTerms: dedupedExpandedTerms,
    },
  ];

  return {
    expandedQuery: buildExpandedQuery(input.query, signals),
    signals,
  };
}
