import type { GraphModel } from "@/lib/graph/model";
import type { PersistedGraphPositions } from "@/lib/graph/persistence/types";

export function applyPersistedPositions(model: GraphModel, persisted: PersistedGraphPositions | null) {
  if (!persisted || persisted.nodes.length === 0) {
    return model;
  }

  const positionMap = new Map(
    persisted.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const persistedPosition = positionMap.get(node.id);

      if (!persistedPosition) {
        return node;
      }

      return {
        ...node,
        visual: {
          ...node.visual,
          x: persistedPosition.x,
          y: persistedPosition.y,
        },
      };
    }),
  };
}
