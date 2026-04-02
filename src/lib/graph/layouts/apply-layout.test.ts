import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { applyGraphLayout } from "@/lib/graph/layouts/apply-layout";
import { dagreLayoutEngine } from "@/lib/graph/layouts/DagreLayoutEngine";
import { ontologyLayoutEngine } from "@/lib/graph/layouts/OntologyLayoutEngine";

describe("applyGraphLayout", () => {
  it("returns the original model for unsupported graph kinds", () => {
    const model: GraphModel = {
      kind: "er",
      nodes: [{ id: "customer", kind: "entity", label: "Customer" }],
      edges: [],
    };

    expect(applyGraphLayout(model)).toBe(model);
  });

  it("returns the original model when nodes already have positions and relayout is not forced", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [{ id: "node-1", kind: "definition", label: "Node 1", visual: { x: 10, y: 20 } }],
      edges: [],
    };

    expect(applyGraphLayout(model)).toBe(model);
  });

  it("relayouts supported graph kinds when positions are missing", () => {
    const model: GraphModel = {
      kind: "property-graph",
      nodes: [
        { id: "node-1", kind: "entity", label: "Node 1" },
        { id: "node-2", kind: "entity", label: "Node 2" },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "connects", label: "connects" }],
    };

    const layouted = applyGraphLayout(model);

    expect(layouted).not.toBe(model);
    layouted.nodes.forEach((node) => {
      expect(typeof node.visual?.x).toBe("number");
      expect(typeof node.visual?.y).toBe("number");
    });
  });

  it("uses the ontology-aware engine for ontology graphs", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [
        { id: "animal", kind: "definition", label: "Animal" },
        { id: "mammal", kind: "definition", label: "Mammal" },
        { id: "dog", kind: "definition", label: "Dog" },
      ],
      edges: [
        { id: "mammal-is-a-animal", source: "mammal", target: "animal", kind: "is_a", label: "is a" },
        { id: "dog-is-a-mammal", source: "dog", target: "mammal", kind: "is_a", label: "is a" },
      ],
    };

    const layouted = applyGraphLayout(model);
    const expected = ontologyLayoutEngine.layout(model);

    expect(layouted.nodes.map((node) => node.visual)).toEqual(expected.nodes.map((node) => node.visual));
  });

  it("keeps using the generic engine for non-ontology interactive graphs", () => {
    const model: GraphModel = {
      kind: "knowledge-graph",
      nodes: [
        { id: "node-1", kind: "concept", label: "Node 1" },
        { id: "node-2", kind: "concept", label: "Node 2" },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "related_to", label: "related" }],
    };

    const layouted = applyGraphLayout(model);
    const expected = dagreLayoutEngine.layout(model);

    expect(layouted.nodes.map((node) => node.visual)).toEqual(expected.nodes.map((node) => node.visual));
  });

  it("preserves existing positions while filling in missing ones", () => {
    const model: GraphModel = {
      kind: "property-graph",
      nodes: [
        { id: "node-1", kind: "entity", label: "Node 1", visual: { x: 100, y: 200 } },
        { id: "node-2", kind: "entity", label: "Node 2" },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "connects", label: "connects" }],
    };

    const layouted = applyGraphLayout(model);

    expect(layouted.nodes[0].visual).toMatchObject({ x: 100, y: 200 });
    expect(typeof layouted.nodes[1].visual?.x).toBe("number");
    expect(typeof layouted.nodes[1].visual?.y).toBe("number");
  });

  it("preserves existing ontology node positions while filling in missing ones", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [
        { id: "animal", kind: "definition", label: "Animal", visual: { x: 40, y: 10 } },
        { id: "mammal", kind: "definition", label: "Mammal" },
        { id: "dog", kind: "definition", label: "Dog" },
      ],
      edges: [
        { id: "mammal-is-a-animal", source: "mammal", target: "animal", kind: "is_a", label: "is a" },
        { id: "dog-is-a-mammal", source: "dog", target: "mammal", kind: "is_a", label: "is a" },
      ],
    };

    const layouted = applyGraphLayout(model);

    expect(layouted.nodes[0].visual).toMatchObject({ x: 40, y: 10 });
    expect(layouted.nodes[1].visual?.y).toBeGreaterThan(10);
    expect(layouted.nodes[2].visual?.y).toBeGreaterThan(layouted.nodes[1].visual?.y ?? 0);
  });

  it("can force relayout even when node positions already exist", () => {
    const model: GraphModel = {
      kind: "knowledge-graph",
      nodes: [
        { id: "node-1", kind: "concept", label: "Node 1", visual: { x: 0, y: 0 } },
        { id: "node-2", kind: "concept", label: "Node 2", visual: { x: 10, y: 0 } },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "related_to", label: "related" }],
    };

    const layouted = applyGraphLayout(model, { force: true });

    expect(layouted).not.toBe(model);
    expect(layouted.nodes.some((node) => node.visual?.x !== 0 || node.visual?.y !== 0)).toBe(true);
  });
});
