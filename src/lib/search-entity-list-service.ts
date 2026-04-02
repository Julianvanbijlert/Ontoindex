import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { normalizeSearchQuery, searchEntities, type SearchFilters, type SearchResultItem } from "@/lib/search-service";

type AppSupabaseClient = SupabaseClient<Database>;

export interface DefinitionListItem {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  ontology_id: string | null;
  priority: string | null;
  status: string | null;
  tags: string[] | null;
  updated_at: string;
  view_count: number | null;
  version?: number | null;
  created_by?: string | null;
  ontologies?: {
    id: string;
    title: string;
  } | null;
  relationships?: Array<{
    id: string;
    type?: string | null;
    label?: string | null;
    target?: {
      id: string;
      title: string;
    } | null;
  }> | null;
}

export interface OntologyListItem {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  tags: string[] | null;
  updated_at: string;
  view_count: number | null;
  created_by?: string | null;
}

function orderRecordsByIds<T extends { id: string }>(
  ids: string[],
  records: T[],
) {
  const recordMap = new Map(records.map((record) => [record.id, record]));
  return ids.map((id) => recordMap.get(id)).filter(Boolean) as T[];
}

function mapOntologyResultToListItem(result: SearchResultItem): OntologyListItem {
  return {
    id: result.id,
    title: result.title,
    description: result.description || null,
    status: result.status,
    tags: result.tags,
    updated_at: result.updatedAt,
    view_count: result.viewCount,
    created_by: null,
  };
}

export async function fetchDefinitionsForBrowsePage(
  client: AppSupabaseClient,
  input: {
    query: string;
    statusFilter: string;
    ontologyFilter: string;
    currentUserId?: string | null;
  },
) {
  const normalizedQuery = normalizeSearchQuery(input.query);

  if (!normalizedQuery) {
    let query = client
      .from("definitions")
      .select("*, ontologies(id, title), relationships!relationships_source_id_fkey(id, type, label, target:target_id(id, title))")
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false });

    if (input.statusFilter !== "all") {
      query = query.eq("status", input.statusFilter as never);
    }

    if (input.ontologyFilter !== "all") {
      query = query.eq("ontology_id", input.ontologyFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []) as unknown as DefinitionListItem[];
  }

  const filters: SearchFilters = {
    ontologyId: input.ontologyFilter,
    tag: "all",
    status: input.statusFilter,
    type: "definition",
    ownership: "all",
  };

  const searchResults = await searchEntities(
    client,
    input.query,
    filters,
    "relevance",
    input.currentUserId,
  );

  const definitionIds = searchResults
    .filter((result) => result.type === "definition")
    .map((result) => result.id);

  if (definitionIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("definitions")
    .select("*, ontologies(id, title), relationships!relationships_source_id_fkey(id, type, label, target:target_id(id, title))")
    .in("id", definitionIds)
    .eq("is_deleted", false);

  if (error) {
    throw error;
  }

  return orderRecordsByIds(definitionIds, (data || []) as unknown as DefinitionListItem[]);
}

export async function fetchOntologiesForBrowsePage(
  client: AppSupabaseClient,
  input: {
    query: string;
    currentUserId?: string | null;
  },
) {
  const normalizedQuery = normalizeSearchQuery(input.query);

  if (!normalizedQuery) {
    const { data, error } = await client
      .from("ontologies")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []) as OntologyListItem[];
  }

  const searchResults = await searchEntities(
    client,
    input.query,
    {
      ontologyId: "all",
      tag: "all",
      status: "all",
      type: "ontology",
      ownership: "all",
    },
    "relevance",
    input.currentUserId,
  );

  const ontologyIds = searchResults
    .filter((result) => result.type === "ontology")
    .map((result) => result.id);

  if (ontologyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("ontologies")
    .select("*")
    .in("id", ontologyIds);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return searchResults
      .filter((result) => result.type === "ontology")
      .map(mapOntologyResultToListItem);
  }

  return orderRecordsByIds(ontologyIds, data as OntologyListItem[]);
}
