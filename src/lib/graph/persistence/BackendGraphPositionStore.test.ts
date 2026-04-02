import { describe, expect, it, vi } from "vitest";

import { createBackendGraphPositionStore } from "@/lib/graph/persistence/BackendGraphPositionStore";
import type { GraphPositionStore } from "@/lib/graph/persistence/types";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOAD_COLUMNS = "graph_key, node_id, x, y, updated_at";
const NODE_ID_COLUMNS = "node_id";

function createGraphPositionClientDouble(options?: {
  loadResult?: { data: unknown[] | null; error: Error | null };
  existingRowsResult?: { data: Array<{ node_id: string }> | null; error: Error | null };
  upsertResult?: { error: Error | null };
  deleteResult?: { error: Error | null };
}) {
  const order = vi.fn().mockResolvedValue(options?.loadResult ?? { data: [], error: null });
  const loadEq = vi.fn().mockReturnValue({ order });
  const existingEq = vi.fn().mockResolvedValue(options?.existingRowsResult ?? { data: [], error: null });
  const select = vi.fn((columns: string) => {
    if (columns === LOAD_COLUMNS) {
      return { eq: loadEq };
    }

    if (columns === NODE_ID_COLUMNS) {
      return { eq: existingEq };
    }

    throw new Error(`Unexpected select columns: ${columns}`);
  });
  const upsert = vi.fn().mockResolvedValue(options?.upsertResult ?? { error: null });
  const deleteIn = vi.fn().mockResolvedValue(options?.deleteResult ?? { error: null });
  const deleteEq = vi.fn().mockReturnValue({ in: deleteIn });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
  const from = vi.fn().mockReturnValue({
    select,
    upsert,
    delete: deleteFn,
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    mocks: {
      deleteEq,
      deleteFn,
      deleteIn,
      existingEq,
      from,
      loadEq,
      order,
      select,
      upsert,
    },
  };
}

describe("createBackendGraphPositionStore", () => {
  it("loads persisted node positions by graph key", async () => {
    const { client, mocks } = createGraphPositionClientDouble({
      loadResult: {
        data: [
          {
            graph_key: "ontology:onto-1",
            node_id: "node-1",
            x: 42,
            y: 24,
            updated_at: "2026-03-31T10:00:00.000Z",
          },
          {
            graph_key: "ontology:onto-1",
            node_id: "node-2",
            x: 80,
            y: 120,
            updated_at: "2026-03-31T10:05:00.000Z",
          },
        ],
        error: null,
      },
    });

    const store = createBackendGraphPositionStore({ client });

    await expect(store.load("ontology:onto-1")).resolves.toEqual({
      graphKey: "ontology:onto-1",
      nodes: [
        { id: "node-1", x: 42, y: 24 },
        { id: "node-2", x: 80, y: 120 },
      ],
      savedAt: "2026-03-31T10:05:00.000Z",
    });
    expect(mocks.from).toHaveBeenCalledWith("graph_node_positions");
    expect(mocks.loadEq).toHaveBeenCalledWith("graph_key", "ontology:onto-1");
  });

  it("falls back on load failure when a secondary store is provided", async () => {
    const { client } = createGraphPositionClientDouble({
      loadResult: {
        data: null,
        error: new Error("backend unavailable"),
      },
    });
    const fallbackStore: GraphPositionStore = {
      load: vi.fn().mockResolvedValue({
        graphKey: "ontology:onto-2",
        nodes: [{ id: "node-1", x: 9, y: 7 }],
        savedAt: "2026-03-31T10:10:00.000Z",
      }),
      save: vi.fn(),
    };
    const store = createBackendGraphPositionStore({ client, fallbackStore });

    await expect(store.load("ontology:onto-2")).resolves.toEqual({
      graphKey: "ontology:onto-2",
      nodes: [{ id: "node-1", x: 9, y: 7 }],
      savedAt: "2026-03-31T10:10:00.000Z",
    });
    expect(fallbackStore.load).toHaveBeenCalledWith("ontology:onto-2");
  });

  it("saves node positions and removes stale backend rows", async () => {
    const { client, mocks } = createGraphPositionClientDouble({
      existingRowsResult: {
        data: [{ node_id: "node-1" }, { node_id: "node-2" }],
        error: null,
      },
    });
    const store = createBackendGraphPositionStore({ client });

    await store.save({
      graphKey: "ontology:onto-3",
      nodes: [
        { id: "node-2", x: 222, y: 111 },
        { id: "node-3", x: 333, y: 444 },
      ],
      savedAt: "2026-03-31T10:15:00.000Z",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        {
          graph_key: "ontology:onto-3",
          node_id: "node-2",
          x: 222,
          y: 111,
          updated_at: "2026-03-31T10:15:00.000Z",
        },
        {
          graph_key: "ontology:onto-3",
          node_id: "node-3",
          x: 333,
          y: 444,
          updated_at: "2026-03-31T10:15:00.000Z",
        },
      ],
      { onConflict: "graph_key,node_id" },
    );
    expect(mocks.deleteEq).toHaveBeenCalledWith("graph_key", "ontology:onto-3");
    expect(mocks.deleteIn).toHaveBeenCalledWith("node_id", ["node-1"]);
  });

  it("falls back on save failure when a secondary store is provided", async () => {
    const { client } = createGraphPositionClientDouble({
      upsertResult: {
        error: new Error("write failed"),
      },
    });
    const fallbackStore: GraphPositionStore = {
      load: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const store = createBackendGraphPositionStore({ client, fallbackStore });
    const positions = {
      graphKey: "ontology:onto-4",
      nodes: [{ id: "node-1", x: 5, y: 6 }],
      savedAt: "2026-03-31T10:20:00.000Z",
    };

    await expect(store.save(positions)).resolves.toBeUndefined();
    expect(fallbackStore.save).toHaveBeenCalledWith(positions);
  });
});
