import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import {
  getSupportedGraphRenderers,
  resolveGraphRenderer,
  resolveGraphRendererId,
  type GraphRenderer,
} from "@/lib/graph/renderers";

const renderers: GraphRenderer[] = [
  {
    id: "react-flow",
    supports: (kind) => kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
    Component: (() => null) as GraphRenderer["Component"],
  },
  {
    id: "cytoscape",
    supports: (kind) => kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
    Component: (() => null) as GraphRenderer["Component"],
  },
  {
    id: "mermaid",
    supports: (kind) => kind === "uml-class" || kind === "er",
    Component: (() => null) as GraphRenderer["Component"],
  },
];

function createModel(kind: GraphModel["kind"]): GraphModel {
  return {
    kind,
    nodes: [],
    edges: [],
  };
}

describe("resolveGraphRenderer", () => {
  it("uses the default interactive renderer when no override is present", () => {
    expect(resolveGraphRendererId(createModel("ontology"), renderers)).toBe("react-flow");
  });

  it("uses an explicit renderer id ahead of stored preference", () => {
    expect(
      resolveGraphRendererId(createModel("ontology"), renderers, {
        explicitRendererId: "react-flow",
        preferredRendererId: "cytoscape",
      }),
    ).toBe("react-flow");
  });

  it("uses the stored preference when no explicit renderer id is provided", () => {
    expect(
      resolveGraphRendererId(createModel("ontology"), renderers, {
        preferredRendererId: "cytoscape",
      }),
    ).toBe("cytoscape");
  });

  it("falls back to Mermaid for UML and ER even when another renderer is requested", () => {
    expect(
      resolveGraphRenderer(createModel("uml-class"), renderers, {
        preferredRendererId: "cytoscape",
      })?.id,
    ).toBe("mermaid");
    expect(
      resolveGraphRenderer(createModel("er"), renderers, {
        explicitRendererId: "cytoscape",
      })?.id,
    ).toBe("mermaid");
  });

  it("returns both interactive renderers for switchable graph kinds", () => {
    expect(getSupportedGraphRenderers(createModel("property-graph"), renderers).map((renderer) => renderer.id)).toEqual([
      "react-flow",
      "cytoscape",
    ]);
  });

  it("returns Mermaid as the only supported renderer for UML graphs", () => {
    expect(getSupportedGraphRenderers(createModel("uml-class"), renderers).map((renderer) => renderer.id)).toEqual([
      "mermaid",
    ]);
  });

  it("keeps RDF visualization graph kinds on interactive renderers", () => {
    expect(getSupportedGraphRenderers(createModel("knowledge-graph"), renderers).map((renderer) => renderer.id)).toEqual([
      "react-flow",
      "cytoscape",
    ]);
  });
});
