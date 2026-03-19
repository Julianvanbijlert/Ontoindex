import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MOCK_DEFINITIONS, MOCK_ONTOLOGIES } from "./mock-data";

type AppSupabaseClient = SupabaseClient<Database>;

export interface SearchHistoryEntry {
  id: string;
  query: string;
  created_at: string;
  filters?: Record<string, unknown> | null;
}

export interface SearchFilters {
  ontologyId: string;
  tag: string;
  status: string;
  type: "all" | "definition" | "ontology";
}

export type SearchSort = "relevance" | "recent" | "views" | "title";

export interface SearchResultItem {
  id: string;
  type: "definition" | "ontology";
  title: string;
  description: string;
  status: string | null;
  updatedAt: string;
  viewCount: number;
  tags: string[];
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  priority?: string | null;
  relevance: number;
}

function buildRelevanceScore(value: {
  title: string;
  description: string;
  tags: string[];
  ontologyTitle?: string | null;
}, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  const title = value.title.toLowerCase();
  const description = value.description.toLowerCase();
  const ontologyTitle = (value.ontologyTitle || "").toLowerCase();
  const tags = value.tags.map((tag) => tag.toLowerCase());

  if (title === normalizedQuery) {
    score += 100;
  } else if (title.startsWith(normalizedQuery)) {
    score += 75;
  } else if (title.includes(normalizedQuery)) {
    score += 50;
  }

  if (description.includes(normalizedQuery)) {
    score += 20;
  }

  if (ontologyTitle.includes(normalizedQuery)) {
    score += 15;
  }

  if (tags.some((tag) => tag.includes(normalizedQuery))) {
    score += 25;
  }

  return score;
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
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
  return [...results].sort((left, right) => {
    switch (sortBy) {
      case "views":
        return right.viewCount - left.viewCount;
      case "recent":
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      case "title":
        return left.title.localeCompare(right.title);
      case "relevance":
      default: {
        if (right.relevance !== left.relevance) {
          return right.relevance - left.relevance;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
    }
  });
}

export function filterAndSortSearchResults(
  definitions: any[],
  ontologies: any[],
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
) {
  const normalizedQuery = normalizeSearchQuery(query);

  const definitionResults: SearchResultItem[] = definitions
    .filter((definition) => {
      if (filters.status !== "all" && definition.status !== filters.status) {
        return false;
      }

      if (filters.ontologyId !== "all" && definition.ontology_id !== filters.ontologyId) {
        return false;
      }

      if (filters.tag !== "all" && !(definition.tags || []).includes(filters.tag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        definition.title,
        definition.description,
        definition.content,
        definition.ontologies?.title,
        ...(definition.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .map((definition) => ({
      id: definition.id,
      type: "definition" as const,
      title: definition.title,
      description: definition.description || definition.content || "",
      status: definition.status,
      updatedAt: definition.updated_at,
      viewCount: definition.view_count || 0,
      tags: definition.tags || [],
      ontologyId: definition.ontology_id,
      ontologyTitle: definition.ontologies?.title || null,
      priority: definition.priority,
      relevance: buildRelevanceScore(
        {
          title: definition.title,
          description: definition.description || definition.content || "",
          tags: definition.tags || [],
          ontologyTitle: definition.ontologies?.title || null,
        },
        normalizedQuery,
      ),
    }));

  const ontologyResults: SearchResultItem[] = ontologies
    .filter((ontology) => {
      if (filters.status !== "all" && ontology.status !== filters.status) {
        return false;
      }

      if (filters.ontologyId !== "all" && ontology.id !== filters.ontologyId) {
        return false;
      }

      if (filters.tag !== "all" && !(ontology.tags || []).includes(filters.tag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [ontology.title, ontology.description, ...(ontology.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .map((ontology) => ({
      id: ontology.id,
      type: "ontology" as const,
      title: ontology.title,
      description: ontology.description || "",
      status: ontology.status,
      updatedAt: ontology.updated_at,
      viewCount: ontology.view_count || 0,
      tags: ontology.tags || [],
      ontologyId: ontology.id,
      ontologyTitle: ontology.title,
      relevance: buildRelevanceScore(
        {
          title: ontology.title,
          description: ontology.description || "",
          tags: ontology.tags || [],
        },
        normalizedQuery,
      ),
    }));

  const filteredByType =
    filters.type === "definition"
      ? definitionResults
      : filters.type === "ontology"
        ? ontologyResults
        : [...definitionResults, ...ontologyResults];

  return sortSearchResults(filteredByType, sortBy);
}

export async function fetchSearchOptions(client: AppSupabaseClient) {
  const [ontologiesResponse, definitionsResponse] = await Promise.all([
    client.from("ontologies").select("id, title, tags").order("title"),
    client.from("definitions").select("tags").eq("is_deleted", false),
  ]);

  const ontologies = ontologiesResponse.data || MOCK_ONTOLOGIES;
  const tagSet = new Set<string>();

  ontologies.forEach((ontology) => {
    (ontology.tags || []).forEach((tag: string) => tagSet.add(tag));
  });

  const definitions = [...(definitionsResponse.data || MOCK_DEFINITIONS)];
  
  // Merge localStorage definitions for the demo
  try {
    const localGlobal = JSON.parse(localStorage.getItem("mock_db_definitions_global") || "[]");
    if (Array.isArray(localGlobal)) {
      definitions.push(...localGlobal);
    }
  } catch (e) {
    console.warn("Failed to merge local definitions into search", e);
  }

  definitions.forEach((definition) => {
    (definition.tags || []).forEach((tag: string) => tagSet.add(tag));
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

  const { data, error } = await client.rpc("save_search_history", {
    _query: query.trim(),
    _filters: filters as any,
  });

  if (error) {
    throw error;
  }

  return data as any as SearchHistoryEntry | null;
}

export async function searchEntities(
  client: AppSupabaseClient,
  query: string,
  filters: SearchFilters,
  sortBy: SearchSort,
) {
  const [definitionsResponse, ontologiesResponse] = await Promise.all([
    client
      .from("definitions")
      .select("id, title, description, content, ontology_id, priority, status, tags, updated_at, view_count, ontologies(id, title)")
      .eq("is_deleted", false),
    client
      .from("ontologies")
      .select("id, title, description, status, tags, updated_at, view_count"),
  ]);

  const definitions = definitionsResponse.data && definitionsResponse.data.length > 0
    ? definitionsResponse.data
    : MOCK_DEFINITIONS.map(d => ({
        ...d,
        ontologies: MOCK_ONTOLOGIES.find(o => o.id === d.ontology_id)
      }));

  const ontologies = ontologiesResponse.data && ontologiesResponse.data.length > 0
    ? ontologiesResponse.data
    : MOCK_ONTOLOGIES;

  return filterAndSortSearchResults(
    definitions as any[],
    ontologies as any[],
    query,
    filters,
    sortBy,
  );
}
