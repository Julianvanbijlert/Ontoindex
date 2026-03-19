import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SearchPage from "@/pages/SearchPage";

const navigate = vi.fn();
const fetchRecentFinds = vi.fn();
const fetchSearchOptions = vi.fn();
const fetchSearchHistory = vi.fn();
const filterSearchHistory = vi.fn();
const saveSearchHistory = vi.fn();
const searchEntities = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  },
}));

vi.mock("@/lib/search-service", () => ({
  fetchSearchOptions: (...args: unknown[]) => fetchSearchOptions(...args),
  fetchRecentFinds: (...args: unknown[]) => fetchRecentFinds(...args),
  fetchSearchHistory: (...args: unknown[]) => fetchSearchHistory(...args),
  filterSearchHistory: (...args: unknown[]) => filterSearchHistory(...args),
  saveSearchHistory: (...args: unknown[]) => saveSearchHistory(...args),
  searchEntities: (...args: unknown[]) => searchEntities(...args),
}));

describe("SearchPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchRecentFinds.mockReset().mockResolvedValue([]);
    fetchSearchOptions.mockReset().mockResolvedValue({ ontologies: [], tags: [] });
    fetchSearchHistory.mockReset().mockResolvedValue([]);
    filterSearchHistory.mockReset().mockReturnValue([]);
    saveSearchHistory.mockReset().mockResolvedValue(null);
    searchEntities.mockReset().mockResolvedValue([]);
  });

  it("only saves search history when the user explicitly submits a search", async () => {
    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search definitions and ontologies/i), {
      target: { value: "gateway" },
    });

    await waitFor(() => expect(searchEntities).toHaveBeenCalled());
    expect(saveSearchHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(saveSearchHistory).toHaveBeenCalledTimes(1));
    expect(saveSearchHistory.mock.calls[0][1]).toBe("gateway");
  });

  it("shows recent finds when the query is empty and restores them after clearing the query", async () => {
    fetchRecentFinds.mockResolvedValue([
      {
        id: "def-1",
        type: "definition",
        title: "Access Policy",
        description: "Recent definition",
        status: "approved",
        updatedAt: "2026-03-19T09:00:00.000Z",
        viewCount: 3,
        tags: ["security"],
        ontologyId: "onto-1",
        ontologyTitle: "Security Ontology",
        priority: "normal",
        relevance: 0,
      },
    ]);
    searchEntities.mockResolvedValue([
      {
        id: "onto-1",
        type: "ontology",
        title: "Gateway Ontology",
        description: "Search result",
        status: "approved",
        updatedAt: "2026-03-19T10:00:00.000Z",
        viewCount: 7,
        tags: ["integration"],
        ontologyId: "onto-1",
        ontologyTitle: "Gateway Ontology",
        relevance: 10,
      },
    ]);

    render(<SearchPage />);

    await waitFor(() => expect(screen.getByText("Recent finds")).toBeInTheDocument());
    expect(screen.getByText("Access Policy")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search definitions and ontologies/i), {
      target: { value: "gateway" },
    });

    await waitFor(() => expect(screen.getByText("Gateway Ontology")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search definitions and ontologies/i), {
      target: { value: "" },
    });

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());
  });
});
