import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { GraphPositionStore, PersistedGraphPositions } from "@/lib/graph/persistence/types";

type AppSupabaseClient = SupabaseClient<Database>;

const GRAPH_NODE_POSITIONS_TABLE = "graph_node_positions";

interface GraphNodePositionRow {
  graph_key: string;
  node_id: string;
  x: number;
  y: number;
  updated_at: string;
}

interface CreateBackendGraphPositionStoreOptions {
  client: AppSupabaseClient;
  fallbackStore?: GraphPositionStore;
}

function mapRowsToPersistedPositions(graphKey: string, rows: GraphNodePositionRow[]): PersistedGraphPositions | null {
  if (rows.length === 0) {
    return null;
  }

  const savedAt = rows.reduce<string | undefined>(
    (latest, row) => {
      if (!latest || row.updated_at > latest) {
        return row.updated_at;
      }

      return latest;
    },
    undefined,
  );

  return {
    graphKey,
    nodes: rows.map((row) => ({
      id: row.node_id,
      x: row.x,
      y: row.y,
    })),
    savedAt,
  };
}

export function createBackendGraphPositionStore(
  options: CreateBackendGraphPositionStoreOptions,
): GraphPositionStore {
  return {
    async load(graphKey) {
      try {
        const { data, error } = await options.client
          .from(GRAPH_NODE_POSITIONS_TABLE)
          .select("graph_key, node_id, x, y, updated_at")
          .eq("graph_key", graphKey)
          .order("node_id", { ascending: true });

        if (error) {
          throw error;
        }

        return mapRowsToPersistedPositions(graphKey, (data ?? []) as GraphNodePositionRow[]);
      } catch {
        return (await options.fallbackStore?.load(graphKey)) ?? null;
      }
    },
    async save(positions) {
      try {
        const timestamp = positions.savedAt ?? new Date().toISOString();
        const nextNodeIds = new Set(positions.nodes.map((node) => node.id));
        const { data: existingRows, error: existingRowsError } = await options.client
          .from(GRAPH_NODE_POSITIONS_TABLE)
          .select("node_id")
          .eq("graph_key", positions.graphKey);

        if (existingRowsError) {
          throw existingRowsError;
        }

        const rows = positions.nodes.map((node) => ({
          graph_key: positions.graphKey,
          node_id: node.id,
          x: node.x,
          y: node.y,
          updated_at: timestamp,
        }));

        if (rows.length > 0) {
          const { error } = await options.client
            .from(GRAPH_NODE_POSITIONS_TABLE)
            .upsert(rows, { onConflict: "graph_key,node_id" });

          if (error) {
            throw error;
          }
        }

        const staleNodeIds = (existingRows ?? [])
          .map((row) => row.node_id)
          .filter((nodeId) => !nextNodeIds.has(nodeId));

        if (staleNodeIds.length > 0) {
          const { error } = await options.client
            .from(GRAPH_NODE_POSITIONS_TABLE)
            .delete()
            .eq("graph_key", positions.graphKey)
            .in("node_id", staleNodeIds);

          if (error) {
            throw error;
          }
        }
      } catch {
        await options.fallbackStore?.save(positions);
      }
    },
    async clear(graphKey) {
      try {
        const { error } = await options.client
          .from(GRAPH_NODE_POSITIONS_TABLE)
          .delete()
          .eq("graph_key", graphKey);

        if (error) {
          throw error;
        }
      } catch {
        await options.fallbackStore?.clear?.(graphKey);
      }
    },
  };
}
