import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { chatRuntimeConfig } from "@/lib/chat/chat-config";
import type { ChatEvidenceItem, ChatExpansionSignal } from "@/lib/chat/types";
import type { SearchRetrievalResponse } from "@/lib/search-retrieval-gateway";

type AppSupabaseClient = SupabaseClient<Database>;

function truncateSnippet(value: string | null | undefined, maxLength = 320) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "No grounded snippet was available for this result.";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

export async function buildChatEvidencePack(
  client: AppSupabaseClient,
  input: {
    retrieval: SearchRetrievalResponse;
    synonymSignals: ChatExpansionSignal[];
    maxItems?: number;
  },
) {
  const selectedResults = input.retrieval.results.slice(0, input.maxItems || chatRuntimeConfig.maxEvidenceItems);
  const definitionIds = selectedResults
    .filter((result) => result.type === "definition")
    .map((result) => result.id);
  const ontologyIds = selectedResults
    .filter((result) => result.type === "ontology")
    .map((result) => result.id);

  const [definitionsResponse, ontologiesResponse, tombstonesResponse] = await Promise.all([
    definitionIds.length > 0
      ? client
        .from("definitions")
        .select("id, title, description, content, ontology_id, ontologies(title)")
        .in("id", definitionIds)
        .eq("status", "approved")
        .eq("is_deleted", false)
      : Promise.resolve({ data: [], error: null }),
    ontologyIds.length > 0
      ? client
        .from("ontologies")
        .select("id, title, description")
        .in("id", ontologyIds)
        .eq("status", "approved")
      : Promise.resolve({ data: [], error: null }),
    selectedResults.length > 0
      ? client
        .from("activity_events")
        .select("entity_id")
        .eq("is_tombstone", true)
        .in("entity_id", selectedResults.map((result) => result.id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (definitionsResponse.error) {
    throw definitionsResponse.error;
  }

  if (ontologiesResponse.error) {
    throw ontologiesResponse.error;
  }

  if (tombstonesResponse.error) {
    throw tombstonesResponse.error;
  }

  const definitionMap = new Map((definitionsResponse.data || []).map((row) => [row.id, row]));
  const ontologyMap = new Map((ontologiesResponse.data || []).map((row) => [row.id, row]));
  const tombstoneIds = new Set((tombstonesResponse.data || []).map((row) => row.entity_id).filter(Boolean));

  const evidencePack = selectedResults
    .map<ChatEvidenceItem | null>((result, index) => {
      const tombstoneDetected = tombstoneIds.has(result.id);
      const definition = result.type === "definition" ? definitionMap.get(result.id) : null;
      const ontology = result.type === "ontology" ? ontologyMap.get(result.id) : null;
      const entityMissing = result.type === "definition" ? !definition : !ontology;

      if (entityMissing || tombstoneDetected) {
        return null;
      }

      const snippet = truncateSnippet(
        result.evidenceExcerpt
          || (result.type === "definition"
            ? definition?.description || definition?.content
            : ontology?.description || result.description),
      );

      return {
        citationId: `E${index + 1}`,
        entityId: result.id,
        entityType: result.type,
        title: result.title,
        snippet,
        href: result.type === "ontology" ? `/ontologies/${result.id}` : `/definitions/${result.id}`,
        ontologyId: result.ontologyId || null,
        ontologyTitle: result.ontologyTitle || (definition?.ontologies?.title ?? null),
        score: result.relevance,
        scores: {
          lexical: result.scoreBreakdown?.lexical,
          dense: result.scoreBreakdown?.dense,
          fusion: result.scoreBreakdown?.fusion,
          rerank: result.scoreBreakdown?.rerank,
          context: result.scoreBreakdown?.context,
        },
        provenance: {
          retrievalStrategy: result.retrievalStrategy || "hybrid",
          matchReasons: result.matchReasons || [],
          appliedFilters: result.explanation?.appliedFilters || [],
          appliedBoosts: result.explanation?.appliedBoosts || [],
          synonymExpansion: input.synonymSignals.flatMap((signal) => signal.expandedTerms),
          relationPath: null,
        },
        safety: {
          isDeleted: false,
          tombstoneDetected: false,
        },
      };
    })
    .filter(Boolean) as ChatEvidenceItem[];

  return {
    evidencePack,
    excludedResultCount: selectedResults.length - evidencePack.length,
  };
}
