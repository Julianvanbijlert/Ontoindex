import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ToggleFavoriteInput {
  entityId: string;
  entityType: "definition" | "ontology";
  liked: boolean;
  userId: string;
}

export interface FavoriteListItem {
  favoriteId: string;
  entityId: string;
  entityType: "definition" | "ontology";
  title: string;
  description: string;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  tags: string[];
  ontologyId: string | null;
  ontologyTitle: string | null;
}

export interface FavoriteFilters {
  type: "all" | "definition" | "ontology";
  ontologyId: string;
  tag: string;
  status: string;
  sortBy: "liked_recent" | "updated_recent" | "alphabetical" | "most_viewed" | "workflow_status";
}

export async function toggleFavorite(
  client: AppSupabaseClient,
  { entityId, entityType, liked, userId }: ToggleFavoriteInput,
) {
  const column = entityType === "definition" ? "definition_id" : "ontology_id";

  if (!liked) {
    return client
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq(column, entityId);
  }

  const payload =
    entityType === "definition"
      ? { user_id: userId, definition_id: entityId }
      : { user_id: userId, ontology_id: entityId };

  return client.from("favorites").upsert(payload, {
    onConflict: entityType === "definition" ? "user_id,definition_id" : "user_id,ontology_id",
    ignoreDuplicates: false,
  });
}

export async function fetchFavoriteItems(client: AppSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("favorites")
    .select("id, created_at, definition_id, ontology_id, definitions(id, title, description, status, updated_at, view_count, tags, ontology_id, ontologies(id, title)), ontologies(id, title, description, status, updated_at, view_count, tags)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const items: FavoriteListItem[] = (data || [])
    .map((favorite: any) => {
      if (favorite.definitions) {
        return {
          favoriteId: favorite.id,
          entityId: favorite.definitions.id,
          entityType: "definition" as const,
          title: favorite.definitions.title,
          description: favorite.definitions.description || "",
          status: favorite.definitions.status,
          createdAt: favorite.created_at,
          updatedAt: favorite.definitions.updated_at,
          viewCount: favorite.definitions.view_count || 0,
          tags: favorite.definitions.tags || [],
          ontologyId: favorite.definitions.ontology_id || favorite.definitions.ontologies?.id || null,
          ontologyTitle: favorite.definitions.ontologies?.title || null,
        };
      }

      if (favorite.ontologies) {
        return {
          favoriteId: favorite.id,
          entityId: favorite.ontologies.id,
          entityType: "ontology" as const,
          title: favorite.ontologies.title,
          description: favorite.ontologies.description || "",
          status: favorite.ontologies.status,
          createdAt: favorite.created_at,
          updatedAt: favorite.ontologies.updated_at,
          viewCount: favorite.ontologies.view_count || 0,
          tags: favorite.ontologies.tags || [],
          ontologyId: favorite.ontologies.id,
          ontologyTitle: favorite.ontologies.title,
        };
      }

      return null;
    })
    .filter(Boolean) as FavoriteListItem[];

  return items;
}

export function filterAndSortFavorites(items: FavoriteListItem[], filters: FavoriteFilters) {
  const filtered = items.filter((item) => {
    if (filters.type !== "all" && item.entityType !== filters.type) {
      return false;
    }

    if (filters.ontologyId !== "all" && item.ontologyId !== filters.ontologyId) {
      return false;
    }

    if (filters.tag !== "all" && !item.tags.includes(filters.tag)) {
      return false;
    }

    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    switch (filters.sortBy) {
      case "updated_recent":
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      case "alphabetical":
        return left.title.localeCompare(right.title);
      case "most_viewed":
        return right.viewCount - left.viewCount;
      case "workflow_status":
        return (left.status || "").localeCompare(right.status || "");
      case "liked_recent":
      default:
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
  });
}
