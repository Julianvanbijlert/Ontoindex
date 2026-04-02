import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { applyPersistedPositions } from "@/lib/graph/persistence/apply-persisted-positions";

describe("applyPersistedPositions", () => {
  it("applies saved positions by node id without mutating the input model", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [
        { id: "node-1", kind: "definition", label: "Node 1", visual: { x: 10, y: 20 } },
        { id: "node-2", kind: "definition", label: "Node 2", visual: { x: 30, y: 40 } },
      ],
      edges: [],
    };

    const result = applyPersistedPositions(model, {
      graphKey: "ontology:onto-1",
      nodes: [{ id: "node-2", x: 300, y: 400 }],
    });

    expect(result).not.toBe(model);
    expect(result.nodes[0].visual).toEqual({ x: 10, y: 20 });
    expect(result.nodes[1].visual).toEqual({ x: 300, y: 400 });
    expect(model.nodes[1].visual).toEqual({ x: 30, y: 40 });
  });

  it("returns the original model when there are no persisted positions", () => {
    const model: GraphModel = {
      kind: "property-graph",
      nodes: [{ id: "node-1", kind: "entity", label: "Node 1" }],
      edges: [],
    };

    expect(applyPersistedPositions(model, null)).toBe(model);
  });
});
