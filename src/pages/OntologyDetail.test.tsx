import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import OntologyDetail from "@/pages/OntologyDetail";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const reactFlowProps: { current: any } = { current: null };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/shared/LikeButton", () => ({
  LikeButton: () => <div>LikeButton</div>,
}));

vi.mock("@/components/shared/ImportDialog", () => ({
  ImportDialog: () => null,
}));

vi.mock("@/components/shared/ExportDialog", () => ({
  ExportDialog: () => null,
}));

vi.mock("@xyflow/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ReactFlow: (props: any) => {
      reactFlowProps.current = props;

      return (
        <div data-testid="react-flow">
          <span>nodesDraggable:{String(props.nodesDraggable)}</span>
          <span>nodesConnectable:{String(props.nodesConnectable)}</span>
          <span>elementsSelectable:{String(props.elementsSelectable)}</span>
          {props.children}
        </div>
      );
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    addEdge: (_edge: any, edges: any[]) => edges,
    useNodesState: (initial: any[] = []) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (initial: any[] = []) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const definitionsData = [
    {
      id: "def-1",
      title: "Access Policy",
      description: "Definition",
      content: "Definition content",
      example: "",
      metadata: {},
      version: 1,
      status: "approved",
      relationships: [],
    },
  ];

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "ontologies") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "onto-1",
                    title: "Security Ontology",
                    description: "Ontology detail",
                    tags: ["security"],
                    status: "approved",
                    created_at: "2026-03-19T08:00:00.000Z",
                    updated_at: "2026-03-19T09:00:00.000Z",
                    view_count: 2,
                  },
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "definitions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: definitionsData }),
              }),
            }),
          };
        }

        if (table === "favorites") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
          };
        }

        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn(),
          update: vi.fn(),
        };
      }),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ontologies/onto-1"]}>
      <Routes>
        <Route path="/ontologies/:id" element={<OntologyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OntologyDetail", () => {
  it("keeps ontology details visible for viewers while hiding mutation controls", async () => {
    authState.role = "viewer";
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() =>
      expect(graphTab).toHaveAttribute("data-state", "active"),
    );

    expect(screen.getByText(/definitions \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add definition/i })).not.toBeInTheDocument();
    expect(screen.getByText(/graph view is read-only for viewers/i)).toBeInTheDocument();
    expect(screen.getByText("nodesDraggable:false")).toBeInTheDocument();
    expect(screen.getByText("nodesConnectable:false")).toBeInTheDocument();
    expect(screen.getByText("elementsSelectable:false")).toBeInTheDocument();
    expect(reactFlowProps.current?.onConnect).toBeUndefined();
    expect(reactFlowProps.current?.onNodeDoubleClick).toBeUndefined();
  });

  it("shows ontology and graph mutation controls for editors", async () => {
    authState.role = "editor";
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() =>
      expect(graphTab).toHaveAttribute("data-state", "active"),
    );

    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add definition/i })).toBeInTheDocument();
    expect(screen.getByText(/drag a connection between nodes to create a relationship/i)).toBeInTheDocument();
    expect(screen.getByText("nodesDraggable:true")).toBeInTheDocument();
    expect(screen.getByText("nodesConnectable:true")).toBeInTheDocument();
    expect(screen.getByText("elementsSelectable:true")).toBeInTheDocument();
    expect(reactFlowProps.current?.onConnect).toBeTypeOf("function");
    expect(reactFlowProps.current?.onNodeDoubleClick).toBeTypeOf("function");
  });
});
