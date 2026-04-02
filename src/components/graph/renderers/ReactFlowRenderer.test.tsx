import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReactFlowRenderer } from "@/components/graph/renderers/ReactFlowRenderer";
import type { GraphModel } from "@/lib/graph/model";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  function applyNodePositionChanges(
    nodes: Array<{ id: string; position: { x: number; y: number } }>,
    changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>,
  ) {
    return nodes.map((node) => {
      const change = changes.find((candidate) => candidate.id === node.id && candidate.type === "position" && candidate.position);

      if (!change?.position) {
        return node;
      }

      return {
        ...node,
        position: change.position,
      };
    });
  }

  return {
    Background: () => <div data-testid="rf-background" />,
    Controls: () => <div data-testid="rf-controls" />,
    MiniMap: () => <div data-testid="rf-minimap" />,
    ReactFlow: ({
      nodes,
      onNodesChange,
      fitView,
    }: {
      nodes: Array<{ id: string; position: { x: number; y: number } }>;
      onNodesChange?: (changes: Array<{ id: string; type: string; position?: { x: number; y: number }; dragging?: boolean }>) => void;
      fitView?: boolean;
    }) => (
      <div data-testid="react-flow-host" data-fit-view={fitView ? "true" : "false"}>
        <span data-testid="rf-node-position">
          {nodes[0]?.position.x ?? "na"}:{nodes[0]?.position.y ?? "na"}
        </span>
        <button
          type="button"
          onClick={() =>
            onNodesChange?.([
              {
                id: "node-1",
                type: "position",
                position: { x: 120, y: 240 },
                dragging: true,
              },
            ])
          }
        >
          drag-progress
        </button>
        <button
          type="button"
          onClick={() =>
            onNodesChange?.([
              {
                id: "node-1",
                type: "position",
                position: { x: 150, y: 300 },
                dragging: false,
              },
            ])
          }
        >
          drag-end
        </button>
      </div>
    ),
    useNodesState: (initialNodes: Array<{ id: string; position: { x: number; y: number } }>) => {
      const [nodes, setNodes] = actual.useState(initialNodes);
      const onNodesChange = (changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>) => {
        setNodes((current) => applyNodePositionChanges(current, changes));
      };
      return [nodes, setNodes, onNodesChange] as const;
    },
    useEdgesState: (initialEdges: Array<unknown>) => {
      const [edges, setEdges] = actual.useState(initialEdges);
      const onEdgesChange = vi.fn();
      return [edges, setEdges, onEdgesChange] as const;
    },
  };
});

describe("ReactFlowRenderer", () => {
  const model: GraphModel = {
    kind: "ontology",
    nodes: [
      {
        id: "node-1",
        kind: "definition",
        label: "Node 1",
        visual: { x: 10, y: 20 },
      },
    ],
    edges: [],
  };

  it("does not forward intermediate drag updates to GraphView", () => {
    const onNodePositionChange = vi.fn();

    render(
      <ReactFlowRenderer
        model={model}
        onNodePositionChange={onNodePositionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "drag-progress" }));

    expect(screen.getByTestId("rf-node-position")).toHaveTextContent("120:240");
    expect(onNodePositionChange).not.toHaveBeenCalled();
  });

  it("forwards the completed drag position once the move finishes", () => {
    const onNodePositionChange = vi.fn();

    render(
      <ReactFlowRenderer
        model={model}
        onNodePositionChange={onNodePositionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "drag-end" }));

    expect(screen.getByTestId("rf-node-position")).toHaveTextContent("150:300");
    expect(onNodePositionChange).toHaveBeenCalledWith(
      "node-1",
      { x: 150, y: 300 },
      { source: "user" },
    );
  });
});
