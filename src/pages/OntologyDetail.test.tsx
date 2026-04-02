import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import OntologyDetail from "@/pages/OntologyDetail";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const {
  createRelationshipRecordMock,
  updateDefinitionMock,
  mockDefinitionsData,
} = vi.hoisted(() => ({
  createRelationshipRecordMock: vi.fn(),
  updateDefinitionMock: vi.fn(),
  mockDefinitionsData: [
    {
      id: "def-1",
      title: "Access Policy",
      description: "Definition",
      content: "Definition content",
      example: "",
      metadata: {},
      version: 1,
      status: "approved",
      relationships: [
        {
          id: "rel-1",
          source_id: "def-1",
          target_id: "def-2",
          type: "related_to",
          label: null,
          target: { id: "def-2", title: "Control Objective" },
        },
      ],
    },
    {
      id: "def-2",
      title: "Control Objective",
      description: "Second definition",
      content: "Control content",
      example: "",
      metadata: {},
      version: 2,
      status: "draft",
      relationships: [],
    },
  ],
}));

interface MockGraphViewProps {
  model: GraphModel;
  readOnly?: boolean;
  onCreateEdge?: (input: { source: string; target: string }) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

const graphViewProps: { current: MockGraphViewProps | null } = { current: null };

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

vi.mock("@/components/graph/GraphView", () => ({
  GraphView: (props: MockGraphViewProps) => {
    graphViewProps.current = props;

    return (
      <div data-testid="graph-view">
        <span>graph-read-only:{String(props.readOnly)}</span>
        <span>graph-node-count:{props.model.nodes.length}</span>
        <span>graph-edge-count:{props.model.edges.length}</span>
        {props.onCreateEdge ? (
          <button type="button" onClick={() => props.onCreateEdge({ source: "def-1", target: "def-2" })}>
            simulate-connect
          </button>
        ) : null}
        {props.onNodeDoubleClick ? (
          <button type="button" onClick={() => props.onNodeDoubleClick("def-1")}>
            simulate-double-click
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/lib/relationship-service", () => ({
  CUSTOM_RELATION_TYPE: "__custom__",
  predefinedRelationshipTypes: ["related_to", "is_a"],
  createRelationshipRecord: createRelationshipRecordMock,
  getRelationshipDisplayLabel: (type: string, label?: string | null) => label?.trim() || type.replace(/_/g, " "),
}));

vi.mock("@/lib/entity-service", () => ({
  deleteOntology: vi.fn(),
  updateOntology: vi.fn(),
  updateDefinition: updateDefinitionMock,
}));

vi.mock("@/integrations/supabase/client", () => {
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
                eq: vi.fn().mockResolvedValue({ data: mockDefinitionsData }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "def-3",
                    title: "New Definition",
                  },
                  error: null,
                }),
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

        if (table === "activity_events") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
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
    mockDefinitionsData.splice(0, mockDefinitionsData.length,
      {
        id: "def-1",
        title: "Access Policy",
        description: "Definition",
        content: "Definition content",
        example: "",
        metadata: {},
        version: 1,
        status: "approved",
        relationships: [
          {
            id: "rel-1",
            source_id: "def-1",
            target_id: "def-2",
            type: "related_to",
            label: null,
            target: { id: "def-2", title: "Control Objective" },
          },
        ],
      },
      {
        id: "def-2",
        title: "Control Objective",
        description: "Second definition",
        content: "Control content",
        example: "",
        metadata: {},
        version: 2,
        status: "draft",
        relationships: [],
      });
    authState.role = "viewer";
    createRelationshipRecordMock.mockReset();
    updateDefinitionMock.mockReset();
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    expect(screen.getByText(/definitions \(2\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add definition/i })).not.toBeInTheDocument();
    expect(screen.getByText(/graph view is read-only for viewers/i)).toBeInTheDocument();
    expect(screen.getByText("graph-read-only:true")).toBeInTheDocument();
    expect(screen.getByText("graph-node-count:2")).toBeInTheDocument();
    expect(screen.getByText("graph-edge-count:1")).toBeInTheDocument();
    expect(graphViewProps.current?.model.kind).toBe("ontology");
  });

  it("shows ontology and graph mutation controls for editors and routes graph actions through services", async () => {
    mockDefinitionsData.splice(0, mockDefinitionsData.length,
      {
        id: "def-1",
        title: "Access Policy",
        description: "Definition",
        content: "Definition content",
        example: "",
        metadata: {},
        version: 1,
        status: "approved",
        relationships: [
          {
            id: "rel-1",
            source_id: "def-1",
            target_id: "def-2",
            type: "related_to",
            label: null,
            target: { id: "def-2", title: "Control Objective" },
          },
        ],
      },
      {
        id: "def-2",
        title: "Control Objective",
        description: "Second definition",
        content: "Control content",
        example: "",
        metadata: {},
        version: 2,
        status: "draft",
        relationships: [],
      });
    authState.role = "editor";
    createRelationshipRecordMock.mockReset();
    updateDefinitionMock.mockReset();
    createRelationshipRecordMock.mockResolvedValue({
      id: "rel-2",
      source_id: "def-1",
      target_id: "def-2",
      type: "related_to",
      label: null,
    });
    updateDefinitionMock.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add definition/i })).toBeInTheDocument();
    expect(screen.getByText(/drag a connection between nodes to create a relationship/i)).toBeInTheDocument();
    expect(screen.getByText("graph-read-only:false")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "simulate-connect" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /create relationship/i }));
    await waitFor(() =>
      expect(createRelationshipRecordMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceId: "def-1",
          targetId: "def-2",
          createdBy: "user-1",
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "simulate-double-click" }));
    await waitFor(() => expect(screen.getByDisplayValue("Access Policy")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue("Access Policy"), { target: { value: "Renamed Policy" } });
    fireEvent.click(screen.getByRole("button", { name: /save definition name/i }));
    await waitFor(() =>
      expect(updateDefinitionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          definitionId: "def-1",
          source: "graph",
          changes: expect.objectContaining({
            title: "Renamed Policy",
          }),
        }),
      ),
    );
  });

  it("exposes a real UML view mode in the graph tab and switches the graph projection", async () => {
    mockDefinitionsData.splice(0, mockDefinitionsData.length,
      {
        id: "def-1",
        title: "Access Policy",
        description: "Definition",
        content: "Definition content",
        example: "",
        metadata: {},
        version: 1,
        status: "approved",
        relationships: [
          {
            id: "rel-1",
            source_id: "def-1",
            target_id: "def-2",
            type: "related_to",
            label: null,
            target: { id: "def-2", title: "Control Objective" },
          },
        ],
      },
      {
        id: "def-2",
        title: "Control Objective",
        description: "Second definition",
        content: "Control content",
        example: "",
        metadata: {},
        version: 2,
        status: "draft",
        relationships: [],
      });
    authState.role = "viewer";
    createRelationshipRecordMock.mockReset();
    updateDefinitionMock.mockReset();
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    expect(screen.getByRole("button", { name: "Ontology" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UML" })).toBeInTheDocument();
    expect(graphViewProps.current?.model.kind).toBe("ontology");

    fireEvent.click(screen.getByRole("button", { name: "UML" }));
    await waitFor(() => expect(graphViewProps.current?.model.kind).toBe("uml-class"));
  });

  it("does not expose UML graph-mode controls when there is no source data", async () => {
    mockDefinitionsData.splice(0, mockDefinitionsData.length);
    authState.role = "viewer";
    createRelationshipRecordMock.mockReset();
    updateDefinitionMock.mockReset();
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    expect(screen.queryByRole("button", { name: "Ontology" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "UML" })).not.toBeInTheDocument();
  });
});
