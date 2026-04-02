import type cytoscape from "cytoscape";

import type { GraphModel, GraphNode } from "@/lib/graph/model";

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 56;

function getNodeStatus(node: GraphNode) {
  const status = node.properties?.status;
  return typeof status === "string" && status ? status : "draft";
}

function getNodeLabel(node: GraphNode) {
  return node.secondaryLabel ? `${node.label}\n${node.secondaryLabel}` : node.label;
}

function hasNumericPosition(node: GraphNode) {
  return typeof node.visual?.x === "number" && typeof node.visual?.y === "number";
}

export interface CytoscapeGraphDefinition {
  elements: cytoscape.ElementDefinition[];
  hasCompleteNodePositions: boolean;
}

export function graphModelToCytoscape(model: GraphModel): CytoscapeGraphDefinition {
  const hasCompleteNodePositions = model.nodes.every(hasNumericPosition);

  return {
    hasCompleteNodePositions,
    elements: [
      ...model.nodes.map<cytoscape.ElementDefinition>((node) => ({
        group: "nodes",
        data: {
          id: node.id,
          kind: node.kind,
          label: node.label,
          displayLabel: getNodeLabel(node),
          status: getNodeStatus(node),
          width: node.visual?.width ?? DEFAULT_NODE_WIDTH,
          height: node.visual?.height ?? DEFAULT_NODE_HEIGHT,
        },
        ...(hasNumericPosition(node)
          ? {
              position: {
                x: node.visual!.x!,
                y: node.visual!.y!,
              },
            }
          : {}),
      })),
      ...model.edges.map<cytoscape.ElementDefinition>((edge) => ({
        group: "edges",
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
          label: edge.label,
        },
      })),
    ],
  };
}
