import { describe, expect, it } from "vitest";

import { resolveGraphPersistenceKey } from "@/lib/graph/persistence/resolve-graph-key";

describe("resolveGraphPersistenceKey", () => {
  it("prefers an explicit graph key when one is provided", () => {
    expect(
      resolveGraphPersistenceKey(
        {
          kind: "ontology",
          metadata: { ontologyId: "onto-1" },
          nodes: [],
          edges: [],
        },
        "custom-key",
      ),
    ).toBe("custom-key");
  });

  it("falls back to the ontology id for persistable graph kinds", () => {
    expect(
      resolveGraphPersistenceKey({
        kind: "ontology",
        metadata: { ontologyId: "onto-2" },
        nodes: [],
        edges: [],
      }),
    ).toBe("ontology:onto-2");
  });

  it("does not derive graph keys from weaker metadata when ontology id is missing", () => {
    expect(
      resolveGraphPersistenceKey({
        kind: "knowledge-graph",
        metadata: { sourceFormat: "json" },
        nodes: [],
        edges: [],
      }),
    ).toBeNull();
  });
});
