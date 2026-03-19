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

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: any) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

vi.mock("@/integrations/supabase/client", () => {
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

  const definitionsEqDeleted = vi.fn().mockResolvedValue({
    data: [
      {
        id: "def-1",
        title: "Access Policy",
        description: "Definition",
        status: "approved",
        relationships: [],
      },
    ],
  });
  const definitionsEqOntology = vi.fn().mockReturnValue({ eq: definitionsEqDeleted });

  const favoritesMaybeSingle = vi.fn().mockResolvedValue({ data: null });
  const favoritesEqOntology = vi.fn().mockReturnValue({ maybeSingle: favoritesMaybeSingle });
  const favoritesEqUser = vi.fn().mockReturnValue({ eq: favoritesEqOntology });

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
          };
        }

        if (table === "favorites") {
          return {
            select: vi.fn().mockReturnValue({ eq: favoritesEqUser }),
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

