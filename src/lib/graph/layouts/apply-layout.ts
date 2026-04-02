import type { GraphModel } from "@/lib/graph/model";
import { availableGraphLayoutEngines } from "@/lib/graph/layouts/layout-registry";
import type { GraphLayoutRequest } from "@/lib/graph/layouts/types";

function hasPosition(model: GraphModel) {
  return model.nodes.every((node) => typeof node.visual?.x === "number" && typeof node.visual?.y === "number");
}

function resolveLayoutEngine(model: GraphModel, engineId?: string) {
  if (engineId) {
    return availableGraphLayoutEngines.find((engine) => engine.id === engineId && engine.supports(model.kind)) ?? null;
  }

  return availableGraphLayoutEngines.find((engine) => engine.supports(model.kind)) ?? null;
}

export function applyGraphLayout(model: GraphModel, request?: GraphLayoutRequest) {
  const engine = resolveLayoutEngine(model, request?.engineId);

  if (!engine) {
    return model;
  }

  if (!request?.force && hasPosition(model)) {
    return model;
  }

  const layoutedModel = engine.layout(model, request);

  if (request?.force) {
    return layoutedModel;
  }

  return {
    ...layoutedModel,
    nodes: layoutedModel.nodes.map((layoutedNode, index) => {
      const originalNode = model.nodes[index];
      const hasOriginalPosition =
        typeof originalNode?.visual?.x === "number" && typeof originalNode?.visual?.y === "number";

      if (!originalNode || !hasOriginalPosition) {
        return layoutedNode;
      }

      return {
        ...layoutedNode,
        visual: {
          ...layoutedNode.visual,
          ...originalNode.visual,
        },
      };
    }),
  };
}
