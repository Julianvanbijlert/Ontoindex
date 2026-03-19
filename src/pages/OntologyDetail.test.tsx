import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import OntologyDetail from "@/pages/OntologyDetail";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    hasRole: () => true,
  }),
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
    ReactFlow: ({ children, nodes, onNodeDoubleClick }: any) => (
      <div>
        <button type="button" onClick={() => onNodeDoubleClick?.({}, nodes?.[0] || { id: "def-1" })}>
          Rename Node
        </button>
        {children}
      </div>
    ),
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
  let definitionsData = [
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
  const ontologiesSingle = vi.fn().mockResolvedValue({
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
  });
  const ontologiesEq = vi.fn((column: string) => {
    if (column === "id") {
      return { single: ontologiesSingle };
    }

    return { maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
  });
  const ontologiesUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const ontologiesUpdate = vi.fn().mockReturnValue({ eq: ontologiesUpdateEq });

  const definitionsEqDeleted = vi.fn().mockImplementation(() => Promise.resolve({ data: definitionsData }));
  const definitionsEqOntology = vi.fn().mockReturnValue({ eq: definitionsEqDeleted });
  const definitionsUpdateSingle = vi.fn().mockImplementation(() => {
    const updated = definitionsData[0];
    return Promise.resolve({ data: updated, error: null });
  });
  const definitionsUpdateSelect = vi.fn().mockReturnValue({ single: definitionsUpdateSingle });
  const definitionsUpdateEq = vi.fn().mockImplementation((_column: string, value: string) => {
    definitionsData = definitionsData.map((definition) =>
      definition.id === value
        ? {
            ...definition,
            title: "Updated Access Policy",
            version: definition.version + 1,
          }
        : definition,
    );

    return { select: definitionsUpdateSelect };
  });
  const definitionsUpdate = vi.fn().mockReturnValue({ eq: definitionsUpdateEq });

  const favoritesMaybeSingle = vi.fn().mockResolvedValue({ data: null });
  const favoritesEqOntology = vi.fn().mockReturnValue({ maybeSingle: favoritesMaybeSingle });
  const favoritesEqUser = vi.fn().mockReturnValue({ eq: favoritesEqOntology });
  const versionInsert = vi.fn().mockResolvedValue({ error: null });
  const activityInsert = vi.fn().mockResolvedValue({ error: null });

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "ontologies") {
          return {
            select: vi.fn().mockReturnValue({ eq: ontologiesEq }),
            update: ontologiesUpdate,
          };
        }

        if (table === "definitions") {
          return {
            select: vi.fn().mockReturnValue({ eq: definitionsEqOntology }),
            update: definitionsUpdate,
          };
        }

        if (table === "favorites") {
          return {
            select: vi.fn().mockReturnValue({ eq: favoritesEqUser }),
          };
        }

        if (table === "version_history") {
          return {
            insert: versionInsert,
          };
        }

        if (table === "activity_events") {
          return {
            insert: activityInsert,
          };
        }

        return {
          select: vi.fn(),
        };
      }),
    },
  };
});

describe("OntologyDetail", () => {
  it("does not render comments, history, or relations sections", async () => {
    render(
      <MemoryRouter initialEntries={["/ontologies/onto-1"]}>
        <Routes>
          <Route path="/ontologies/:id" element={<OntologyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());

    expect(screen.queryByText("Comments")).not.toBeInTheDocument();
    expect(screen.queryByText("History")).not.toBeInTheDocument();
    expect(screen.queryByText("Relations")).not.toBeInTheDocument();
    expect(screen.getByText(/definitions \(1\)/i)).toBeInTheDocument();
  });

});
