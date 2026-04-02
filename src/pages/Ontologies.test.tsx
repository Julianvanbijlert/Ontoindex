import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import Ontologies from "@/pages/Ontologies";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};
const tableCalls: string[] = [];
const ontologyInsertSingle = vi.fn();
const ontologyInsertSelect = vi.fn(() => ({ single: ontologyInsertSingle }));
const ontologyInsert = vi.fn(() => ({ select: ontologyInsertSelect }));
const activityInsert = vi.fn().mockResolvedValue({ error: null });
const favoritesQuery = {
  not: vi.fn().mockResolvedValue({ data: [] }),
};
const favoritesEq = vi.fn(() => favoritesQuery);
const favoritesSelect = vi.fn(() => ({ eq: favoritesEq }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/shared/LikeButton", () => ({
  LikeButton: () => <div>LikeButton</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

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
          insert: ontologyInsert,
        };
      }

      if (table === "favorites") {
        return { select: favoritesSelect };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

describe("Ontologies", () => {
  it("creates an ontology without directly writing to search_documents", async () => {
    authState.role = "editor";
    tableCalls.length = 0;
    ontologyInsertSingle.mockReset().mockResolvedValue({
      data: { id: "onto-2", title: "Platform Ontology" },
      error: null,
    });
    activityInsert.mockClear();
    (toast.success as unknown as ReturnType<typeof vi.fn>).mockClear();

    render(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /new ontology/i }));
    fireEvent.change(screen.getByPlaceholderText(/ontology title/i), {
      target: { value: "Platform Ontology" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(ontologyInsert).toHaveBeenCalledWith(expect.objectContaining({
        title: "Platform Ontology",
        created_by: "user-1",
      }));
    });

    expect(tableCalls).not.toContain("search_documents");
    expect(activityInsert).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Ontology created");
  });

  it("shows an actionable error when trusted search sync is blocked by RLS during ontology creation", async () => {
    authState.role = "editor";
    tableCalls.length = 0;
    ontologyInsertSingle.mockReset().mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"search_documents\"",
      },
    });
    (toast.error as unknown as ReturnType<typeof vi.fn>).mockClear();

    render(
      <MemoryRouter>
        <Ontologies />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Security Ontology")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /new ontology/i }));
    fireEvent.change(screen.getByPlaceholderText(/ontology title/i), {
      target: { value: "Blocked Ontology" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Ontology creation failed because search index synchronization was blocked by database security policy. Ask an admin to apply the latest search-index backend migration.",
      );
    });

    expect(tableCalls).not.toContain("search_documents");
  });

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
