import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import {
  graphRendererManifests,
  resolveEnabledGraphRendererManifests,
  resolveEnabledGraphRenderers,
} from "@/lib/graph/renderer-registry";
import { getSupportedGraphRenderers, resolveGraphRendererId } from "@/lib/graph/renderers";

function createModel(kind: GraphModel["kind"]): GraphModel {
  return {
    kind,
    nodes: [],
    edges: [],
  };
}

describe("renderer manifest registry", () => {
  it("exposes manifest metadata and renderer adapters separately", () => {
    expect(graphRendererManifests.map((manifest) => manifest.id)).toEqual([
      "react-flow",
      "cytoscape",
      "mermaid",
    ]);
    expect(graphRendererManifests.map((manifest) => manifest.adapter.id)).toEqual([
      "react-flow",
      "cytoscape",
      "mermaid",
    ]);
  });

  it("filters renderers to enabled manifests", () => {
    const enabled = resolveEnabledGraphRenderers(graphRendererManifests, [
      { rendererId: "react-flow", installed: true, enabled: true },
      { rendererId: "cytoscape", installed: true, enabled: false },
      { rendererId: "mermaid", installed: true, enabled: true },
    ]);

    expect(enabled.map((renderer) => renderer.id)).toEqual([
      "react-flow",
      "mermaid",
    ]);
  });

  it("retains safe default behavior when installation state is missing", () => {
    const enabledManifests = resolveEnabledGraphRendererManifests(graphRendererManifests);

    expect(enabledManifests.map((manifest) => manifest.id)).toEqual([
      "react-flow",
      "cytoscape",
      "mermaid",
    ]);
  });

  it("falls back to another enabled renderer when a requested renderer is disabled", () => {
    const enabled = resolveEnabledGraphRenderers(graphRendererManifests, [
      { rendererId: "react-flow", installed: true, enabled: true },
      { rendererId: "cytoscape", installed: true, enabled: false },
      { rendererId: "mermaid", installed: true, enabled: true },
    ]);
    const supported = getSupportedGraphRenderers(createModel("ontology"), enabled);

    expect(resolveGraphRendererId(createModel("ontology"), supported, { explicitRendererId: "cytoscape" })).toBe("react-flow");
  });
});
