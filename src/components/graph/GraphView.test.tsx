import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GraphView } from "@/components/graph/GraphView";
import type { GraphModel } from "@/lib/graph/model";
import type { GraphRendererPreferenceStore } from "@/lib/graph/preferences/types";
import type { GraphRendererInstallationStore } from "@/lib/graph/renderer-installation";
import type { GraphPositionStore } from "@/lib/graph/persistence/types";

vi.mock("@/lib/graph/renderer-registry", () => ({
  availableGraphRenderers: [
    {
      id: "react-flow",
      label: "React Flow",
      supports: (kind: GraphModel["kind"]) =>
        kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
      Component: ({
        model,
        onNodePositionChange,
      }: {
        model: GraphModel;
        onNodePositionChange?: (...args: unknown[]) => void;
      }) => (
        <div data-testid="react-flow-mock">
          <span>{model.kind}</span>
          <span data-testid="first-node-position">
            {model.nodes[0]?.visual?.x ?? "na"}:{model.nodes[0]?.visual?.y ?? "na"}
          </span>
          <button
            type="button"
            onClick={() => onNodePositionChange?.("node-1", { x: 999, y: 555 }, { source: "user" })}
          >
            move-node
          </button>
          <button
            type="button"
            onClick={() => onNodePositionChange?.("node-1", { x: 707, y: 808 }, { source: "system" })}
          >
            relayout-node
          </button>
        </div>
      ),
    },
    {
      id: "cytoscape",
      label: "Cytoscape",
      supports: (kind: GraphModel["kind"]) =>
        kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
      Component: ({
        model,
        onNodePositionChange,
      }: {
        model: GraphModel;
        onNodePositionChange?: (...args: unknown[]) => void;
      }) => (
        <div data-testid="cytoscape-mock">
          <span>{model.kind}</span>
          <span data-testid="first-node-position">
            {model.nodes[0]?.visual?.x ?? "na"}:{model.nodes[0]?.visual?.y ?? "na"}
          </span>
          <button
            type="button"
            onClick={() => onNodePositionChange?.("node-1", { x: 321, y: 654 }, { source: "user" })}
          >
            move-node-cytoscape
          </button>
          <button
            type="button"
            onClick={() => onNodePositionChange?.("node-1", { x: 888, y: 444 }, { source: "system" })}
          >
            relayout-node-cytoscape
          </button>
        </div>
      ),
    },
    {
      id: "mermaid",
      label: "Mermaid",
      supports: (kind: GraphModel["kind"]) => kind === "uml-class" || kind === "er",
      Component: ({ model }: { model: GraphModel }) => <div data-testid="mermaid-mock">{model.kind}</div>,
    },
  ],
  graphRendererManifests: [
    {
      id: "react-flow",
      label: "React Flow",
      installType: "builtin",
      defaultInstalled: true,
      defaultEnabled: true,
      adapter: {
        id: "react-flow",
        supports: (kind: GraphModel["kind"]) =>
          kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
        Component: ({
          model,
          onNodePositionChange,
        }: {
          model: GraphModel;
          onNodePositionChange?: (...args: unknown[]) => void;
        }) => (
          <div data-testid="react-flow-mock">
            <span>{model.kind}</span>
            <span data-testid="first-node-position">
              {model.nodes[0]?.visual?.x ?? "na"}:{model.nodes[0]?.visual?.y ?? "na"}
            </span>
            <button
              type="button"
              onClick={() => onNodePositionChange?.("node-1", { x: 999, y: 555 }, { source: "user" })}
            >
              move-node
            </button>
            <button
              type="button"
              onClick={() => onNodePositionChange?.("node-1", { x: 707, y: 808 }, { source: "system" })}
            >
              relayout-node
            </button>
          </div>
        ),
      },
    },
    {
      id: "cytoscape",
      label: "Cytoscape",
      installType: "builtin",
      defaultInstalled: true,
      defaultEnabled: true,
      adapter: {
        id: "cytoscape",
        supports: (kind: GraphModel["kind"]) =>
          kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
        Component: ({
          model,
          onNodePositionChange,
        }: {
          model: GraphModel;
          onNodePositionChange?: (...args: unknown[]) => void;
        }) => (
          <div data-testid="cytoscape-mock">
            <span>{model.kind}</span>
            <span data-testid="first-node-position">
              {model.nodes[0]?.visual?.x ?? "na"}:{model.nodes[0]?.visual?.y ?? "na"}
            </span>
            <button
              type="button"
              onClick={() => onNodePositionChange?.("node-1", { x: 321, y: 654 }, { source: "user" })}
            >
              move-node-cytoscape
            </button>
            <button
              type="button"
              onClick={() => onNodePositionChange?.("node-1", { x: 888, y: 444 }, { source: "system" })}
            >
              relayout-node-cytoscape
            </button>
          </div>
        ),
      },
    },
    {
      id: "mermaid",
      label: "Mermaid",
      installType: "builtin",
      defaultInstalled: true,
      defaultEnabled: true,
      adapter: {
        id: "mermaid",
        supports: (kind: GraphModel["kind"]) => kind === "uml-class" || kind === "er",
        Component: ({ model }: { model: GraphModel }) => <div data-testid="mermaid-mock">{model.kind}</div>,
      },
    },
  ],
  resolveEnabledGraphRendererManifests: (
    manifests: Array<{
      id: string;
      defaultInstalled?: boolean;
      defaultEnabled?: boolean;
    }>,
    installations?: Array<{
      rendererId: string;
      installed: boolean;
      enabled: boolean;
    }> | null,
  ) => {
    const byId = new Map((installations ?? []).map((item) => [item.rendererId, item]));

    return manifests.filter((manifest) => {
      const current = byId.get(manifest.id);
      const installed = current?.installed ?? manifest.defaultInstalled ?? true;
      const enabled = installed && (current?.enabled ?? manifest.defaultEnabled ?? true);
      return installed && enabled;
    });
  },
}));

describe("GraphView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("selects the React Flow renderer by default for ontology graphs", () => {
    render(
      <GraphView
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("react-flow-mock")).toHaveTextContent("ontology");
    expect(screen.getByTestId("graph-renderer-switcher")).toBeInTheDocument();
  });

  it("uses a stored renderer preference when no explicit renderer id is provided", () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("cytoscape"),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("cytoscape-mock")).toHaveTextContent("ontology");
    expect(rendererPreferenceStore.get).toHaveBeenCalledWith("interactive");
  });

  it("prefers an explicit renderer id over the stored renderer preference", () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("cytoscape"),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererId="react-flow"
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("react-flow-mock")).toHaveTextContent("ontology");
    expect(rendererPreferenceStore.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("graph-renderer-switcher")).not.toBeInTheDocument();
  });

  it("loads a stored renderer preference from a provided async store", async () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockResolvedValue("cytoscape"),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("cytoscape-mock")).toBeInTheDocument());
    expect(rendererPreferenceStore.get).toHaveBeenCalledWith("interactive");
  });

  it("falls back to the default renderer when an injected preference store load fails", async () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockRejectedValue(new Error("backend unavailable")),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument());
  });

  it("applies layout before rendering supported interactive graph kinds", () => {
    render(
      <GraphView
        model={{
          kind: "ontology",
          nodes: [
            {
              id: "node-1",
              kind: "definition",
              label: "Node 1",
            },
            {
              id: "node-2",
              kind: "definition",
              label: "Node 2",
            },
          ],
          edges: [
            {
              id: "edge-1",
              source: "node-1",
              target: "node-2",
              kind: "related_to",
              label: "related",
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("react-flow-mock")).toHaveTextContent("ontology");
    expect(screen.getByTestId("first-node-position")).not.toHaveTextContent("na:na");
  });

  it("prefers persisted positions over model defaults when a graph key is available", () => {
    window.localStorage.setItem(
      "ontoindex:graph-positions:ontology:onto-1",
      JSON.stringify({
        graphKey: "ontology:onto-1",
        nodes: [{ id: "node-1", x: 444, y: 222 }],
      }),
    );

    render(
      <GraphView
        model={{
          kind: "ontology",
          metadata: { ontologyId: "onto-1" },
          nodes: [
            {
              id: "node-1",
              kind: "definition",
              label: "Node 1",
              visual: { x: 10, y: 20 },
            },
          ],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("first-node-position")).toHaveTextContent("444:222");
  });

  it("persists node moves through the interactive renderer callback path", async () => {
    render(
      <GraphView
        graphKey="ontology:onto-9"
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-9")).toContain("\"x\":999"),
    );
    expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-9")).toContain("\"y\":555");
  });

  it("persists node moves when Cytoscape is selected through the same GraphView boundary", async () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("cytoscape"),
      set: vi.fn(),
    };

    render(
      <GraphView
        graphKey="ontology:onto-cyto"
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node-cytoscape" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-cyto")).toContain("\"x\":321"),
    );
    expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-cyto")).toContain("\"y\":654");
  });

  it("does not persist renderer-local or programmatic position changes", async () => {
    const { rerender } = render(
      <GraphView
        graphKey="ontology:onto-system"
        rendererId="cytoscape"
        autoLayout={false}
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1", visual: { x: 10, y: 20 } }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "relayout-node-cytoscape" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-system")).toBeNull(),
    );

    rerender(
      <GraphView
        graphKey="ontology:onto-system"
        rendererId="react-flow"
        autoLayout={false}
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1", visual: { x: 10, y: 20 } }],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("first-node-position")).toHaveTextContent("10:20");
  });

  it("shares explicit user-moved positions across React Flow and Cytoscape", async () => {
    const { rerender } = render(
      <GraphView
        graphKey="ontology:onto-shared"
        rendererId="react-flow"
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("ontoindex:graph-positions:ontology:onto-shared")).toContain("\"x\":999"),
    );

    rerender(
      <GraphView
        graphKey="ontology:onto-shared"
        rendererId="cytoscape"
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("first-node-position")).toHaveTextContent("999:555");
  });

  it("updates renderer preference and rerenders when the switcher changes", async () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("react-flow"),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Cytoscape" }));

    await waitFor(() => expect(screen.getByTestId("cytoscape-mock")).toBeInTheDocument());
    expect(rendererPreferenceStore.set).toHaveBeenCalledWith("interactive", "cytoscape");
  });

  it("keeps the selected renderer active when an injected preference store save fails", async () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("react-flow"),
      set: vi.fn().mockRejectedValue(new Error("write failed")),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Cytoscape" }));

    await waitFor(() => expect(screen.getByTestId("cytoscape-mock")).toBeInTheDocument());
    expect(rendererPreferenceStore.set).toHaveBeenCalledWith("interactive", "cytoscape");
  });

  it("loads persisted positions from a provided async store", async () => {
    const positionStore: GraphPositionStore = {
      load: vi.fn().mockResolvedValue({
        graphKey: "ontology:onto-10",
        nodes: [{ id: "node-1", x: 444, y: 222 }],
      }),
      save: vi.fn(),
    };

    render(
      <GraphView
        positionStore={positionStore}
        model={{
          kind: "ontology",
          metadata: { ontologyId: "onto-10" },
          nodes: [
            {
              id: "node-1",
              kind: "definition",
              label: "Node 1",
              visual: { x: 10, y: 20 },
            },
          ],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("first-node-position")).toHaveTextContent("444:222"));
    expect(positionStore.load).toHaveBeenCalledWith("ontology:onto-10");
  });

  it("persists node moves through a provided store", async () => {
    const positionStore: GraphPositionStore = {
      load: vi.fn().mockResolvedValue({
        graphKey: "ontology:onto-11",
        nodes: [{ id: "node-2", x: 1, y: 2 }],
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <GraphView
        graphKey="ontology:onto-11"
        positionStore={positionStore}
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node" }));

    await waitFor(() =>
      expect(positionStore.save).toHaveBeenCalledWith({
        graphKey: "ontology:onto-11",
        nodes: [
          { id: "node-1", x: 999, y: 555 },
          { id: "node-2", x: 1, y: 2 },
        ],
        savedAt: expect.any(String),
      }),
    );
  });

  it("gracefully falls back to model positions when an injected store load fails", async () => {
    const positionStore: GraphPositionStore = {
      load: vi.fn().mockRejectedValue(new Error("backend unavailable")),
      save: vi.fn(),
    };

    render(
      <GraphView
        positionStore={positionStore}
        model={{
          kind: "ontology",
          metadata: { ontologyId: "onto-12" },
          nodes: [
            {
              id: "node-1",
              kind: "definition",
              label: "Node 1",
              visual: { x: 10, y: 20 },
            },
          ],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("first-node-position")).toHaveTextContent("10:20"));
  });

  it("does not break interaction when an injected store save fails", async () => {
    const onNodePositionChange = vi.fn();
    const positionStore: GraphPositionStore = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockRejectedValue(new Error("write failed")),
    };

    render(
      <GraphView
        graphKey="ontology:onto-13"
        positionStore={positionStore}
        onNodePositionChange={onNodePositionChange}
        model={{
          kind: "ontology",
          nodes: [{ id: "node-1", kind: "definition", label: "Node 1" }],
          edges: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node" }));

    expect(onNodePositionChange).toHaveBeenCalledWith("node-1", { x: 999, y: 555 }, { source: "user" });
    await waitFor(() => expect(positionStore.save).toHaveBeenCalled());
  });

  it("selects the Mermaid renderer for UML class graphs without exposing the switcher", () => {
    const rendererPreferenceStore: GraphRendererPreferenceStore = {
      get: vi.fn().mockReturnValue("cytoscape"),
      set: vi.fn(),
    };

    render(
      <GraphView
        rendererPreferenceStore={rendererPreferenceStore}
        model={{
          kind: "uml-class",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("mermaid-mock")).toHaveTextContent("uml-class");
    expect(rendererPreferenceStore.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("graph-renderer-switcher")).not.toBeInTheDocument();
  });

  it("keeps UML renderer controls Mermaid-only even when interactive renderers are enabled", () => {
    render(
      <GraphView
        model={{
          kind: "uml-class",
          nodes: [
            {
              id: "class-policy",
              kind: "class",
              label: "Policy",
            },
          ],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("mermaid-mock")).toHaveTextContent("uml-class");
    expect(screen.queryByTestId("graph-renderer-switcher")).not.toBeInTheDocument();
  });

  it("selects the Mermaid renderer for ER graphs without exposing the switcher", () => {
    render(
      <GraphView
        rendererId="cytoscape"
        model={{
          kind: "er",
          nodes: [],
          edges: [],
        }}
      />,
    );

    expect(screen.getByTestId("mermaid-mock")).toHaveTextContent("er");
    expect(screen.queryByTestId("graph-renderer-switcher")).not.toBeInTheDocument();
  });

  it("shows selection controls only for enabled interactive renderers", async () => {
    const rendererInstallationStore: GraphRendererInstallationStore = {
      load: vi.fn().mockResolvedValue([
        { rendererId: "react-flow", installed: true, enabled: true },
        { rendererId: "cytoscape", installed: true, enabled: false },
        { rendererId: "mermaid", installed: true, enabled: true },
      ]),
      save: vi.fn(),
    };

    render(
      <GraphView
        rendererInstallationStore={rendererInstallationStore}
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument());
    expect(screen.queryByTestId("graph-renderer-switcher")).not.toBeInTheDocument();
  });

  it("falls back safely when a selected renderer is not enabled", async () => {
    const rendererInstallationStore: GraphRendererInstallationStore = {
      load: vi.fn().mockResolvedValue([
        { rendererId: "react-flow", installed: true, enabled: true },
        { rendererId: "cytoscape", installed: true, enabled: false },
        { rendererId: "mermaid", installed: true, enabled: true },
      ]),
      save: vi.fn(),
    };

    render(
      <GraphView
        rendererInstallationStore={rendererInstallationStore}
        rendererId="cytoscape"
        model={{
          kind: "ontology",
          nodes: [],
          edges: [],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument());
    expect(screen.queryByTestId("cytoscape-mock")).not.toBeInTheDocument();
  });
});
