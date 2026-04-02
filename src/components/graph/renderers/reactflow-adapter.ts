import type { Edge, Node } from "@xyflow/react";

import type { GraphEdge, GraphNode } from "@/lib/graph/model";
import { getWorkflowNodeStyle } from "@/lib/workflow-status";

function getNodeStatus(node: GraphNode) {
  const status = node.properties?.status;
  return typeof status === "string" && status ? status : "draft";
}

export function toReactFlowNodes(nodes: GraphNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    position: {
      x: node.visual?.x ?? 0,
      y: node.visual?.y ?? 0,
    },
    data: {
      label: node.label,
    },
    style: {
      ...getWorkflowNodeStyle(getNodeStatus(node)),
      borderRadius: "8px",
      padding: "12px 16px",
      fontSize: "13px",
      fontWeight: 500,
      width: node.visual?.width,
      height: node.visual?.height,
    },
  }));
}

export function toReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    style: { stroke: "hsl(var(--primary))" },
    labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  }));
}
