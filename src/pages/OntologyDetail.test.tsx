import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import OntologyDetail from "@/pages/OntologyDetail";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const useStandardsRuntimeSettings = vi.fn();
const evaluateOntologyStandardsCompliance = vi.fn();
const evaluateRelationshipStandardsCompliance = vi.fn();

  const {
    createDefinitionMock,
    createRelationshipRecordMock,
    updateDefinitionMock,
    mockDefinitionsData,
  } = vi.hoisted(() => ({
    createDefinitionMock: vi.fn(),
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

vi.mock("@/hooks/use-standards-runtime-settings", () => ({
  useStandardsRuntimeSettings: () => useStandardsRuntimeSettings(),
}));

vi.mock("@/lib/standards/compliance", () => ({
  evaluateOntologyStandardsCompliance: (...args: unknown[]) => evaluateOntologyStandardsCompliance(...args),
  evaluateRelationshipStandardsCompliance: (...args: unknown[]) => evaluateRelationshipStandardsCompliance(...args),
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
  createDefinition: createDefinitionMock,
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
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb", "rdf"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
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
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb", "rdf"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    createRelationshipRecordMock.mockResolvedValue({
      id: "rel-2",
      source_id: "def-1",
      target_id: "def-2",
      type: "related_to",
      label: null,
    });
    updateDefinitionMock.mockResolvedValue({});
    createDefinitionMock.mockResolvedValue({
      id: "def-3",
      title: "New Definition",
    });
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
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb", "rdf"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
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
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb", "rdf"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
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

  it("persists suggestion metadata from the graph dialog when a standards suggestion is selected", async () => {
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
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [
        {
          id: "suggestion-narrower",
          standardId: "nl-sbb",
          label: "Use narrower",
          explanation: "Preserve SKOS narrower semantics.",
          selectedType: "__custom__",
          customType: "narrower",
          metadata: {
            standards: {
              relation: {
                kind: "narrower",
                predicateKey: "narrower",
                predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
              },
            },
          },
        },
      ],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    createRelationshipRecordMock.mockResolvedValue({
      id: "rel-2",
      source_id: "def-1",
      target_id: "def-2",
      type: "related_to",
      label: "narrower",
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    fireEvent.click(screen.getByRole("button", { name: "simulate-connect" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /use narrower/i }));
    fireEvent.click(screen.getByRole("button", { name: /create relationship/i }));

    await waitFor(() =>
      expect(createRelationshipRecordMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedType: "__custom__",
          customType: "narrower",
          metadata: expect.objectContaining({
            standards: expect.objectContaining({
              relation: expect.objectContaining({
                kind: "narrower",
                predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
              }),
            }),
          }),
        }),
      ),
    );
  });

  it("blocks shared definition creation when the standards service rejects the draft", async () => {
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
        relationships: [],
      });
    authState.role = "editor";
    createRelationshipRecordMock.mockReset();
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {
          nl_sbb_invalid_concept_iri: "blocking",
        },
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    createDefinitionMock.mockRejectedValueOnce(new Error("Resolve the blocking standards compliance issues before saving this definition."));
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /add definition/i }));
    fireEvent.change(screen.getByPlaceholderText("Definition title"), {
      target: { value: "Invalid Definition" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create definition$/i }));

    await waitFor(() => expect(createDefinitionMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("adapts the create-definition flow to active standards and persists source metadata", async () => {
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
        relationships: [],
      });
    authState.role = "editor";
    createRelationshipRecordMock.mockReset();
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    createDefinitionMock.mockResolvedValue({
      id: "def-3",
      title: "New Definition",
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /add definition/i }));

    expect(screen.getByText(/active standards shape this definition form/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/identifier iri/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Definition title"), {
      target: { value: "New Definition" },
    });
    fireEvent.change(screen.getByLabelText(/source reference/i), {
      target: { value: "NORA API design guide" },
    });
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "https://example.com/nora" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create definition$/i }));

    await waitFor(() => expect(createDefinitionMock).toHaveBeenCalledTimes(1));
    expect(createDefinitionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        definition: expect.objectContaining({
          metadata: expect.objectContaining({
            sourceReference: "NORA API design guide",
            sourceUrl: "https://example.com/nora",
          }),
        }),
      }),
    );
  });

  it("blocks graph rename saves when shared standards validation rejects the change", async () => {
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
    createDefinitionMock.mockReset();
    updateDefinitionMock.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {
          nl_sbb_invalid_concept_iri: "blocking",
        },
      },
      loading: false,
      error: null,
    });
    evaluateOntologyStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      relationSuggestions: [],
      hasBlockingFindings: false,
      summary: { info: 0, warning: 0, error: 0, blocking: 0 },
    });
    updateDefinitionMock.mockRejectedValueOnce(new Error("Resolve the blocking standards compliance issues before saving this definition."));
    renderPage();

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    fireEvent.mouseDown(graphTab, { button: 0 });
    fireEvent.mouseUp(graphTab, { button: 0 });
    fireEvent.click(graphTab);
    await waitFor(() => expect(graphTab).toHaveAttribute("data-state", "active"));

    fireEvent.click(screen.getByRole("button", { name: "simulate-double-click" }));
    await waitFor(() => expect(screen.getByDisplayValue("Access Policy")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue("Access Policy"), { target: { value: "Blocked Rename" } });
    fireEvent.click(screen.getByRole("button", { name: /save definition name/i }));

    await waitFor(() => expect(updateDefinitionMock).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue("Blocked Rename")).toBeInTheDocument();
  });
});
