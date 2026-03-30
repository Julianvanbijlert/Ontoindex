import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildSearchContextFromExperience, type SearchExperienceAdapterInput } from "@/lib/search/context/search-experience-adapter";
import type { SearchContext } from "@/lib/search/context/types";
import { filterAndSortSearchResults as filterLegacySearchResults, sortSearchResults as sortLegacySearchResults } from "@/lib/search-legacy-retrieval";
import { normalizeSearchText } from "@/lib/search-normalization";
import { normalizeSearchQuery as normalizeQuery } from "@/lib/search-query";
import { saveSearchHistoryRpc } from "@/lib/search-rpc";
import {
  searchWithRetrievalGateway,
  type SearchExecutionOptions as SearchGatewayExecutionOptions,
  type SearchRetrievalResponse,
} from "@/lib/search-retrieval-gateway";
import type {
  SearchFilters,
  SearchHistoryEntry,
  SearchResultItem,
  SearchSort,
} from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;

export type {
  SearchFilters,
  SearchHistoryEntry,
  SearchResultItem,
  SearchSort,
} from "@/lib/search-types";
export type { SearchRetrievalResponse } from "@/lib/search-retrieval-gateway";
export type { SearchContext } from "@/lib/search/context/types";
export type { SearchExperienceAdapterInput } from "@/lib/search/context/search-experience-adapter";

export interface SearchExecutionOptions extends SearchGatewayExecutionOptions {
  context?: SearchContext | null;
  experience?: SearchExperienceAdapterInput;
}

function resolveExecutionContext(options?: SearchExecutionOptions) {
  if (options?.context) {
    return options.context;
  }

  if (!options?.experience) {
    return null;
  }

  try {
    return buildSearchContextFromExperience(options.experience);
  } catch (error) {
    console.warn("Search context collection failed, continuing without context.", { error });
    return null;
  }
}

export function normalizeSearchQuery(query: string) {
  return normalizeSearchText(normalizeQuery(query));
}

export function dedupeSearchHistory(entries: SearchHistoryEntry[]) {
  const seen = new Set<string>();

  return [...entries]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .filter((entry) => {
      const normalized = normalizeSearchQuery(entry.query);
      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function filterSearchHistory(entries: SearchHistoryEntry[], input: string) {
  const normalized = normalizeSearchQuery(input);

  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => normalizeSearchQuery(entry.query).includes(normalized));
}

export function sortSearchResults(results: SearchResultItem[], sortBy: SearchSort) {
  return sortLegacySearchResults(results, sortBy);
}

export function filterAndSortSearchResults(
  definitions: any[],
  ontologies: any[],
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
) {
  return filterLegacySearchResults(
    definitions,
    ontologies,
    normalizeSearchQuery(query),
    filters,
    sortBy,
    currentUserId,
  );
}

export async function fetchSearchOptions(client: AppSupabaseClient) {
  const [ontologiesResponse, definitionsResponse] = await Promise.all([
    client.from("ontologies").select("id, title, tags").order("title"),
    client.from("definitions").select("tags").eq("is_deleted", false),
  ]);

  if (ontologiesResponse.error) {
    throw ontologiesResponse.error;
  }

  if (definitionsResponse.error) {
    throw definitionsResponse.error;
  }

  const ontologies = ontologiesResponse.data || [];
  const tagSet = new Set<string>();

  ontologies.forEach((ontology) => {
    (ontology.tags || []).forEach((tag) => tagSet.add(tag));
  });

  (definitionsResponse.data || []).forEach((definition) => {
    (definition.tags || []).forEach((tag) => tagSet.add(tag));
  });

  return {
    ontologies,
    tags: [...tagSet].sort((left, right) => left.localeCompare(right)),
  };
}

export async function fetchSearchHistory(client: AppSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("search_history")
    .select("id, query, filters, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return dedupeSearchHistory((data || []) as SearchHistoryEntry[]);
}

export async function saveSearchHistory(
  client: AppSupabaseClient,
  query: string,
  filters: Record<string, unknown>,
) {
  const normalized = normalizeSearchQuery(query);

  if (!normalized) {
    return null;
  }

  const { data, error } = await saveSearchHistoryRpc(client, query, filters);

  if (error) {
    throw error;
  }

  return data as SearchHistoryEntry | null;
}

export async function searchEntitiesWithMeta(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
  options?: SearchExecutionOptions,
) {
  const context = resolveExecutionContext(options);

  return searchWithRetrievalGateway(client, query, filters, sortBy, currentUserId, {
    signal: options?.signal,
    bypassCache: options?.bypassCache,
    context,
  });
}

export async function searchEntities(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
) {
  const response = await searchEntitiesWithMeta(client, query, filters, sortBy, currentUserId);
  return response.results;
}

export async function fetchRecentFinds(client: AppSupabaseClient, userId: string) {
  const { data: activity, error: activityError } = await client
    .from("activity_events")
    .select("entity_id, entity_type, created_at")
    .eq("user_id", userId)
    .in("entity_type", ["definition", "ontology"])
    .not("entity_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  if (activityError) {
    throw activityError;
  }

  const orderedKeys: string[] = [];
  const latestByKey = new Map<string, string>();

  (activity || []).forEach((event) => {
    if (!event.entity_id) {
      return;
    }

    const key = `${event.entity_type}:${event.entity_id}`;

    if (!latestByKey.has(key)) {
      orderedKeys.push(key);
      latestByKey.set(key, event.created_at);
    }
  });

  const definitionIds = orderedKeys
    .filter((key) => key.startsWith("definition:"))
    .map((key) => key.replace("definition:", ""));
  const ontologyIds = orderedKeys
    .filter((key) => key.startsWith("ontology:"))
    .map((key) => key.replace("ontology:", ""));

  const [definitionsResponse, ontologiesResponse] = await Promise.all([
    definitionIds.length > 0
      ? client
          .from("definitions")
          .select("id, title, description, content, ontology_id, priority, status, tags, updated_at, view_count, ontologies(id, title)")
          .in("id", definitionIds)
          .eq("is_deleted", false)
      : Promise.resolve({ data: [], error: null }),
    ontologyIds.length > 0
      ? client
          .from("ontologies")
          .select("id, title, description, status, tags, updated_at, view_count")
          .in("id", ontologyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (definitionsResponse.error) {
    throw definitionsResponse.error;
  }

  if (ontologiesResponse.error) {
    throw ontologiesResponse.error;
  }

  const itemMap = new Map<string, SearchResultItem>();

  (definitionsResponse.data || []).forEach((definition: any) => {
    itemMap.set(`definition:${definition.id}`, {
      id: definition.id,
      type: "definition",
      title: definition.title,
      description: definition.description || definition.content || "",
      status: definition.status,
      updatedAt: definition.updated_at,
      viewCount: definition.view_count || 0,
      tags: definition.tags || [],
      ontologyId: definition.ontology_id,
      ontologyTitle: definition.ontologies?.title || null,
      priority: definition.priority,
      relevance: 0,
    });
  });

  (ontologiesResponse.data || []).forEach((ontology: any) => {
    itemMap.set(`ontology:${ontology.id}`, {
      id: ontology.id,
      type: "ontology",
      title: ontology.title,
      description: ontology.description || "",
      status: ontology.status,
      updatedAt: ontology.updated_at,
      viewCount: ontology.view_count || 0,
      tags: ontology.tags || [],
      ontologyId: ontology.id,
      ontologyTitle: ontology.title,
      relevance: 0,
    });
  });

  return orderedKeys
    .map((key) => itemMap.get(key))
    .filter(Boolean) as SearchResultItem[];
}
