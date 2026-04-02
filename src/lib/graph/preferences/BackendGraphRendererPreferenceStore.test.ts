import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { createBackendGraphRendererPreferenceStore } from "@/lib/graph/preferences/BackendGraphRendererPreferenceStore";
import type { GraphRendererPreferenceStore } from "@/lib/graph/preferences/types";

const LOAD_COLUMNS = "scope, renderer_id, updated_at";

function createGraphRendererPreferenceClientDouble(options?: {
  loadResult?: { data: unknown | null; error: Error | null };
  upsertResult?: { error: Error | null };
  deleteResult?: { error: Error | null };
}) {
  const maybeSingle = vi.fn().mockResolvedValue(options?.loadResult ?? { data: null, error: null });
  const scopeEq = vi.fn().mockReturnValue({ maybeSingle });
  const userEq = vi.fn().mockReturnValue({ eq: scopeEq });
  const select = vi.fn((columns: string) => {
    if (columns !== LOAD_COLUMNS) {
      throw new Error(`Unexpected select columns: ${columns}`);
    }

    return { eq: userEq };
  });
  const upsert = vi.fn().mockResolvedValue(options?.upsertResult ?? { error: null });
  const deleteScopeEq = vi.fn().mockResolvedValue(options?.deleteResult ?? { error: null });
  const deleteUserEq = vi.fn().mockReturnValue({ eq: deleteScopeEq });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteUserEq });
  const from = vi.fn().mockReturnValue({
    delete: deleteFn,
    select,
    upsert,
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    mocks: {
      deleteFn,
      deleteScopeEq,
      deleteUserEq,
      from,
      maybeSingle,
      scopeEq,
      select,
      upsert,
      userEq,
    },
  };
}

describe("createBackendGraphRendererPreferenceStore", () => {
  it("loads a stored renderer preference by scope", async () => {
    const { client, mocks } = createGraphRendererPreferenceClientDouble({
      loadResult: {
        data: {
          user_id: "user-1",
          scope: "interactive",
          renderer_id: "cytoscape",
          updated_at: "2026-04-01T10:00:00.000Z",
        },
        error: null,
      },
    });

    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
    });

    await expect(store.get("interactive")).resolves.toBe("cytoscape");
    expect(mocks.from).toHaveBeenCalledWith("graph_renderer_preferences");
    expect(mocks.userEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.scopeEq).toHaveBeenCalledWith("scope", "interactive");
  });

  it("returns null for invalid stored renderer ids", async () => {
    const { client } = createGraphRendererPreferenceClientDouble({
      loadResult: {
        data: {
          user_id: "user-1",
          scope: "interactive",
          renderer_id: "",
          updated_at: "2026-04-01T10:00:00.000Z",
        },
        error: null,
      },
    });

    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
    });

    await expect(store.get("interactive")).resolves.toBeNull();
  });

  it("falls back on load failure when a secondary store is provided", async () => {
    const { client } = createGraphRendererPreferenceClientDouble({
      loadResult: {
        data: null,
        error: new Error("backend unavailable"),
      },
    });
    const fallbackStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockResolvedValue("react-flow"),
      set: vi.fn(),
    };

    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
      fallbackStore,
    });

    await expect(store.get("interactive")).resolves.toBe("react-flow");
    expect(fallbackStore.get).toHaveBeenCalledWith("interactive");
  });

  it("saves the renderer preference for the configured user and scope", async () => {
    const { client, mocks } = createGraphRendererPreferenceClientDouble();
    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
    });

    await expect(store.set("interactive", "cytoscape")).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        scope: "interactive",
        renderer_id: "cytoscape",
        updated_at: expect.any(String),
      },
      { onConflict: "user_id,scope" },
    );
  });

  it("falls back on save failure when a secondary store is provided", async () => {
    const { client } = createGraphRendererPreferenceClientDouble({
      upsertResult: {
        error: new Error("write failed"),
      },
    });
    const fallbackStore: GraphRendererPreferenceStore = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
      fallbackStore,
    });

    await expect(store.set("interactive", "react-flow")).resolves.toBeUndefined();
    expect(fallbackStore.set).toHaveBeenCalledWith("interactive", "react-flow");
  });

  it("clears the stored renderer preference", async () => {
    const { client, mocks } = createGraphRendererPreferenceClientDouble();
    const store = createBackendGraphRendererPreferenceStore({
      client,
      userId: "user-1",
    });

    await expect(store.clear?.("interactive")).resolves.toBeUndefined();
    expect(mocks.deleteUserEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.deleteScopeEq).toHaveBeenCalledWith("scope", "interactive");
  });
});
