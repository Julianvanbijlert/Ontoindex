import { useEffect, useMemo, useRef } from "react";
import type cytoscape from "cytoscape";

import type { GraphRendererProps } from "@/lib/graph/renderers";
import { graphModelToCytoscape } from "@/lib/graph/mappers/graph-to-cytoscape";

const CYTOSCAPE_STYLESHEET = [
  {
    selector: "node",
    style: {
      label: "data(displayLabel)",
      "text-wrap": "wrap",
      "text-max-width": "180px",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": "12px",
      "font-weight": "600",
      color: "#1f2937",
      "background-color": "#e2e8f0",
      "border-color": "#94a3b8",
      "border-width": "1.5px",
      "border-opacity": "0.95",
      shape: "round-rectangle",
      width: "data(width)",
      height: "data(height)",
      padding: "10px",
      "overlay-opacity": "0",
    },
  },
  {
    selector: 'node[status = "in_review"]',
    style: {
      "background-color": "#fef3c7",
      "border-color": "#f59e0b",
    },
  },
  {
    selector: 'node[status = "approved"]',
    style: {
      "background-color": "#dcfce7",
      "border-color": "#22c55e",
    },
  },
  {
    selector: 'node[status = "rejected"]',
    style: {
      "background-color": "#fee2e2",
      "border-color": "#ef4444",
    },
  },
  {
    selector: 'node[status = "archived"]',
    style: {
      "background-color": "#f1f5f9",
      "border-color": "#cbd5e1",
      color: "#64748b",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": "3px",
      "border-color": "#0f172a",
    },
  },
  {
    selector: "edge",
    style: {
      width: "1.5px",
      "line-color": "#94a3b8",
      opacity: "0.9",
      label: "data(label)",
      "font-size": "10px",
      color: "#64748b",
      "text-rotation": "autorotate",
      "text-background-color": "#ffffff",
      "text-background-opacity": "0.88",
      "text-background-padding": "2px",
      "curve-style": "straight",
      "target-arrow-shape": "none",
      "overlay-opacity": "0",
    },
  },
  {
    selector: "edge:selected",
    style: {
      width: "2.5px",
      "line-color": "#2563eb",
    },
  },
] as unknown as cytoscape.StylesheetJson;

function getSelection(cy: cytoscape.Core) {
  return {
    nodeIds: cy.nodes(":selected").map((node) => node.id()),
    edgeIds: cy.edges(":selected").map((edge) => edge.id()),
  };
}

function resolveLayoutOptions(hasCompleteNodePositions: boolean): cytoscape.LayoutOptions {
  if (hasCompleteNodePositions) {
    return {
      name: "preset",
      fit: true,
      padding: 24,
      animate: false,
    };
  }

  // Cytoscape falls back to a renderer-local layout only when GraphView did not provide full positions.
  return {
    name: "cose",
    fit: true,
    padding: 24,
    animate: false,
    nodeOverlap: 12,
    idealEdgeLength: 120,
  };
}

export function CytoscapeRenderer({
  model,
  readOnly = false,
  className,
  onNodeDoubleClick,
  onNodePositionChange,
  onSelectionChange,
}: GraphRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef<{ nodeId: string; timestamp: number } | null>(null);
  const graphDefinition = useMemo(() => graphModelToCytoscape(model), [model]);

  useEffect(() => {
    let isCancelled = false;
    let instance: cytoscape.Core | null = null;

    async function mountRenderer() {
      if (!containerRef.current) {
        return;
      }

      const { default: createCytoscape } = await import("cytoscape");

      if (isCancelled || !containerRef.current) {
        return;
      }

      instance = createCytoscape({
        container: containerRef.current,
        elements: graphDefinition.elements,
        style: CYTOSCAPE_STYLESHEET,
        layout: resolveLayoutOptions(graphDefinition.hasCompleteNodePositions),
        wheelSensitivity: 0.2,
        boxSelectionEnabled: true,
        autoungrabify: readOnly,
      });

      if (onSelectionChange) {
        const emitSelection = () => {
          if (!instance) {
            return;
          }

          onSelectionChange(getSelection(instance));
        };

        instance.on("select unselect", "node, edge", emitSelection);
      }

      if (!readOnly && onNodePositionChange) {
        instance.on("dragfree", "node", (event: cytoscape.EventObjectNode) => {
          const position = event.target.position();
          onNodePositionChange(event.target.id(), {
            x: position.x,
            y: position.y,
          }, { source: "user" });
        });
      }

      if (!readOnly && onNodeDoubleClick) {
        instance.on("tap", "node", (event: cytoscape.EventObjectNode) => {
          const nodeId = event.target.id();
          const now = Date.now();
          const previous = lastTapRef.current;

          if (previous?.nodeId === nodeId && now - previous.timestamp < 320) {
            lastTapRef.current = null;
            onNodeDoubleClick(nodeId);
            return;
          }

          lastTapRef.current = {
            nodeId,
            timestamp: now,
          };
        });
      }
    }

    void mountRenderer();

    return () => {
      isCancelled = true;
      instance?.destroy();
    };
  }, [
    graphDefinition.elements,
    graphDefinition.hasCompleteNodePositions,
    onNodeDoubleClick,
    onNodePositionChange,
    onSelectionChange,
    readOnly,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="cytoscape-graph-view"
      style={{ minHeight: 240 }}
    />
  );
}
