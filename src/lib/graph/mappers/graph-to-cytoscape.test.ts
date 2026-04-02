import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { graphModelToCytoscape } from "@/lib/graph/mappers/graph-to-cytoscape";

describe("graphModelToCytoscape", () => {
  it("maps graph nodes and edges into Cytoscape elements while preserving positions", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [
        {
          id: "node-1",
          kind: "definition",
          label: "Access Policy",
          secondaryLabel: "approved",
          properties: { status: "approved" },
          visual: { x: 120, y: 240, width: 220, height: 72 },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          kind: "related_to",
          label: "related to",
        },
      ],
    };

    const mapped = graphModelToCytoscape(model);

    expect(mapped.hasCompleteNodePositions).toBe(true);
    expect(mapped.elements).toEqual([
      {
        group: "nodes",
        data: {
          id: "node-1",
          kind: "definition",
          label: "Access Policy",
          displayLabel: "Access Policy\napproved",
          status: "approved",
          width: 220,
          height: 72,
        },
        position: {
          x: 120,
          y: 240,
        },
      },
      {
        group: "edges",
        data: {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          kind: "related_to",
          label: "related to",
        },
      },
    ]);
  });

  it("marks positions as incomplete when any node lacks coordinates", () => {
    const model: GraphModel = {
      kind: "knowledge-graph",
      nodes: [
        {
          id: "node-1",
          kind: "entity",
          label: "Node 1",
          visual: { x: 10, y: 20 },
        },
        {
          id: "node-2",
          kind: "entity",
          label: "Node 2",
        },
      ],
      edges: [],
    };

    const mapped = graphModelToCytoscape(model);

    expect(mapped.hasCompleteNodePositions).toBe(false);
    expect(mapped.elements[0]).toMatchObject({
      group: "nodes",
      position: { x: 10, y: 20 },
    });
    expect(mapped.elements[1]).toMatchObject({
      group: "nodes",
      data: expect.objectContaining({
        width: 180,
        height: 56,
        status: "draft",
      }),
    });
    expect(mapped.elements[1]).not.toHaveProperty("position");
  });
});
