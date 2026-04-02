import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { GraphRendererProps } from "@/lib/graph/renderers";
import { toReactFlowEdges, toReactFlowNodes } from "@/components/graph/renderers/reactflow-adapter";

export function ReactFlowRenderer({
  model,
  readOnly = false,
  className,
  onCreateEdge,
  onNodeDoubleClick,
  onNodePositionChange,
  onSelectionChange,
}: GraphRendererProps) {
  const mappedNodes = useMemo(() => toReactFlowNodes(model.nodes), [model.nodes]);
  const mappedEdges = useMemo(() => toReactFlowEdges(model.edges), [model.edges]);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(mappedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mappedEdges);

  useEffect(() => {
    setNodes(mappedNodes);
  }, [mappedNodes, setNodes]);

  useEffect(() => {
    setEdges(mappedEdges);
  }, [mappedEdges, setEdges]);

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChangeBase(changes);

    if (!onNodePositionChange) {
      return;
    }

    changes.forEach((change) => {
      if (change.type !== "position" || !change.position) {
        return;
      }

      if (change.dragging === true) {
        return;
      }

      onNodePositionChange(change.id, {
        x: change.position.x,
        y: change.position.y,
      }, { source: "user" });
    });
  };

  const handleConnect = (connection: Connection) => {
    if (readOnly || !connection.source || !connection.target) {
      return;
    }

    onCreateEdge?.({
      source: connection.source,
      target: connection.target,
    });
  };

  return (
    <div className={className} data-testid="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={!readOnly ? handleConnect : undefined}
        onNodeDoubleClick={!readOnly ? (_event, node) => onNodeDoubleClick?.(node.id) : undefined}
        onSelectionChange={
          onSelectionChange
            ? ({ nodes: selectedNodes, edges: selectedEdges }) =>
                onSelectionChange({
                  nodeIds: selectedNodes.map((node) => node.id),
                  edgeIds: selectedEdges.map((edge) => edge.id),
                })
            : undefined
        }
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        edgesFocusable={!readOnly}
        fitView
        style={{ background: "hsl(var(--background))" }}
      >
        <Background color="hsl(var(--border))" gap={20} />
        <Controls />
        <MiniMap style={{ background: "hsl(var(--card))" }} />
      </ReactFlow>
    </div>
  );
}
