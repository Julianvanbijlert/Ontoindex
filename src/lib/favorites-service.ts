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
    .select("id, created_at, definition_id, ontology_id, definitions(id, title, description, status), ontologies(id, title, description, status)")
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
        };
      }

      return null;
    })
    .filter(Boolean) as FavoriteListItem[];

  return items;
}

