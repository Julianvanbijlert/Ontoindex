import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  isInteractiveGraphRendererId,
  type GraphRendererPreferenceStore,
} from "@/lib/graph/preferences/types";

type AppSupabaseClient = SupabaseClient<Database>;

const GRAPH_RENDERER_PREFERENCES_TABLE = "graph_renderer_preferences";
const LOAD_COLUMNS = "scope, renderer_id, updated_at";

type GraphRendererPreferenceRow = Database["public"]["Tables"]["graph_renderer_preferences"]["Row"];
type GraphRendererPreferenceInsert = Database["public"]["Tables"]["graph_renderer_preferences"]["Insert"];

interface CreateBackendGraphRendererPreferenceStoreOptions {
  client: AppSupabaseClient;
  userId: string;
  fallbackStore?: GraphRendererPreferenceStore;
}

export function createBackendGraphRendererPreferenceStore(
  options: CreateBackendGraphRendererPreferenceStoreOptions,
): GraphRendererPreferenceStore {
  return {
    async get(scope) {
      try {
        const { data, error } = await options.client
          .from(GRAPH_RENDERER_PREFERENCES_TABLE)
          .select(LOAD_COLUMNS)
          .eq("user_id", options.userId)
          .eq("scope", scope)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const rendererId = (data as GraphRendererPreferenceRow | null)?.renderer_id;
        return rendererId && isInteractiveGraphRendererId(rendererId) ? rendererId : null;
      } catch {
        return (await options.fallbackStore?.get(scope)) ?? null;
      }
    },
    async set(scope, rendererId) {
      try {
        const row: GraphRendererPreferenceInsert = {
          user_id: options.userId,
          scope,
          renderer_id: rendererId,
          updated_at: new Date().toISOString(),
        };
        const { error } = await options.client
          .from(GRAPH_RENDERER_PREFERENCES_TABLE)
          .upsert(row, { onConflict: "user_id,scope" });

        if (error) {
          throw error;
        }
      } catch {
        await options.fallbackStore?.set(scope, rendererId);
      }
    },
    async clear(scope) {
      try {
        const { error } = await options.client
          .from(GRAPH_RENDERER_PREFERENCES_TABLE)
          .delete()
          .eq("user_id", options.userId)
          .eq("scope", scope);

        if (error) {
          throw error;
        }
      } catch {
        await options.fallbackStore?.clear?.(scope);
      }
    },
  };
}
