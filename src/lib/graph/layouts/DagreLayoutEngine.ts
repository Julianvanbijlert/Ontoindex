import dagre from "dagre";

import type { GraphModel, GraphNode } from "@/lib/graph/model";
import type { GraphLayoutEngine, GraphLayoutOptions } from "@/lib/graph/layouts/types";

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 56;

function getNodeSize(node: GraphNode) {
  return {
    width: node.visual?.width ?? DEFAULT_NODE_WIDTH,
    height: node.visual?.height ?? DEFAULT_NODE_HEIGHT,
  };
}

function withNodePosition(node: GraphNode, position: { x: number; y: number }) {
  return {
    ...node,
    visual: {
      ...node.visual,
      x: position.x,
      y: position.y,
    },
  };
}

export const dagreLayoutEngine: GraphLayoutEngine = {
  id: "dagre",
  supports: (kind) => kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
  layout: (model, options) => {
    const graph = new dagre.graphlib.Graph();

    graph.setGraph({
      rankdir: options?.direction ?? "LR",
      nodesep: options?.nodeSpacing ?? 56,
      ranksep: options?.rankSpacing ?? 96,
    });
    graph.setDefaultEdgeLabel(() => ({}));

    model.nodes.forEach((node) => {
      const { width, height } = getNodeSize(node);
      graph.setNode(node.id, { width, height });
    });

    model.edges.forEach((edge) => {
      graph.setEdge(edge.source, edge.target);
    });

    dagre.layout(graph);

    return {
      ...model,
      nodes: model.nodes.map((node) => {
        const size = getNodeSize(node);
        const position = graph.node(node.id) as { x: number; y: number } | undefined;

        if (!position) {
          return node;
        }

        return withNodePosition(node, {
          x: position.x - size.width / 2,
          y: position.y - size.height / 2,
        });
      }),
    };
  },
};
