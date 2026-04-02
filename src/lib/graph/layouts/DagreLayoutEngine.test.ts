import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { dagreLayoutEngine } from "@/lib/graph/layouts/DagreLayoutEngine";

function buildModel(): GraphModel {
  return {
    kind: "ontology",
    nodes: [
      { id: "a", kind: "definition", label: "A" },
      { id: "b", kind: "definition", label: "B" },
      { id: "c", kind: "definition", label: "C" },
    ],
    edges: [
      { id: "ab", source: "a", target: "b", kind: "related_to", label: "related" },
      { id: "bc", source: "b", target: "c", kind: "related_to", label: "related" },
    ],
  };
}

describe("dagreLayoutEngine", () => {
  it("adds stable positions to supported graph kinds", () => {
    const first = dagreLayoutEngine.layout(buildModel(), { direction: "LR" });
    const second = dagreLayoutEngine.layout(buildModel(), { direction: "LR" });

    expect(first.nodes).toHaveLength(3);
    first.nodes.forEach((node) => {
      expect(typeof node.visual?.x).toBe("number");
      expect(typeof node.visual?.y).toBe("number");
    });
    expect(first.nodes.map((node) => node.visual)).toEqual(second.nodes.map((node) => node.visual));
  });

  it("supports the interactive graph kinds only", () => {
    expect(dagreLayoutEngine.supports("ontology")).toBe(true);
    expect(dagreLayoutEngine.supports("knowledge-graph")).toBe(true);
    expect(dagreLayoutEngine.supports("property-graph")).toBe(true);
    expect(dagreLayoutEngine.supports("uml-class")).toBe(false);
    expect(dagreLayoutEngine.supports("er")).toBe(false);
  });
});
