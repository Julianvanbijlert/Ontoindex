import { beforeEach, describe, expect, it } from "vitest";

import {
  buildGraphPositionStorageKey,
  localStorageGraphPositionStore,
} from "@/lib/graph/persistence/LocalStorageGraphPositionStore";

describe("localStorageGraphPositionStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and loads graph positions with a stable storage key", () => {
    localStorageGraphPositionStore.save({
      graphKey: "ontology:onto-1",
      nodes: [{ id: "node-1", x: 42, y: 24 }],
      savedAt: "2026-03-31T10:00:00.000Z",
    });

    expect(window.localStorage.getItem(buildGraphPositionStorageKey("ontology:onto-1"))).toContain("node-1");
    expect(localStorageGraphPositionStore.load("ontology:onto-1")).toEqual({
      graphKey: "ontology:onto-1",
      nodes: [{ id: "node-1", x: 42, y: 24 }],
      savedAt: "2026-03-31T10:00:00.000Z",
    });
  });

  it("returns null for missing or invalid stored data", () => {
    expect(localStorageGraphPositionStore.load("missing")).toBeNull();

    window.localStorage.setItem(buildGraphPositionStorageKey("broken"), "{not-json");
    expect(localStorageGraphPositionStore.load("broken")).toBeNull();
  });

  it("can clear a persisted graph layout", () => {
    localStorageGraphPositionStore.save({
      graphKey: "ontology:onto-2",
      nodes: [{ id: "node-1", x: 1, y: 2 }],
    });

    localStorageGraphPositionStore.clear?.("ontology:onto-2");

    expect(localStorageGraphPositionStore.load("ontology:onto-2")).toBeNull();
  });
});
