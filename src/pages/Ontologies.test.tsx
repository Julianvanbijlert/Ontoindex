import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Ontologies from "@/pages/Ontologies";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/shared/LikeButton", () => ({
  LikeButton: () => <div>LikeButton</div>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "ontologies") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "onto-1",
                  title: "Security Ontology",
                  description: "Ontology detail",
                  tags: ["security"],
                  status: "approved",
                  view_count: 2,
                },
              ],
            }),
          }),
        };
      }

      if (table === "favorites") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  },
}));

describe("Ontologies", () => {
  it("lets viewers browse ontologies without showing creation controls", async () => {
    authState.role = "viewer";

    render(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /new ontology/i })).not.toBeInTheDocument();
  });

  it("shows ontology creation controls for editors", async () => {
    authState.role = "editor";

    render(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /new ontology/i })).toBeInTheDocument();
  });

  it("updates ontology mutation controls immediately when the role changes", async () => {
    authState.role = "viewer";

    const { rerender } = render(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /new ontology/i })).not.toBeInTheDocument();

    authState.role = "admin";
    rerender(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /new ontology/i })).toBeInTheDocument();

    authState.role = "viewer";
    rerender(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: /new ontology/i })).not.toBeInTheDocument();
  });
});
