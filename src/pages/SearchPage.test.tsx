import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SearchPage from "@/pages/SearchPage";

const authState = {
  user: { id: "user-1" },
  session: null,
  profile: null,
  role: "viewer",
};

const navigate = vi.fn();
const fetchRecentFinds = vi.fn();
const fetchSearchOptions = vi.fn();
const fetchSearchHistory = vi.fn();
const filterSearchHistory = vi.fn();
const saveSearchHistory = vi.fn();
const searchEntitiesWithMeta = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: "/search" }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
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
  searchEntitiesWithMeta: (...args: unknown[]) => searchEntitiesWithMeta(...args),
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react");
  const SelectContext = React.createContext<(value: string) => void>(() => undefined);

  return {
    Select: ({ onValueChange, children }: any) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
    SelectValue: () => <span>Selected</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const onValueChange = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("SearchPage", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.session = null;
    authState.profile = null;
    authState.role = "viewer";
    navigate.mockReset();
    fetchRecentFinds.mockReset().mockResolvedValue([]);
    fetchSearchOptions.mockReset().mockResolvedValue({ ontologies: [], tags: [] });
    fetchSearchHistory.mockReset().mockResolvedValue([]);
    filterSearchHistory.mockReset().mockReturnValue([]);
    saveSearchHistory.mockReset().mockResolvedValue(null);
    searchEntitiesWithMeta.mockReset().mockResolvedValue({
      results: [],
      diagnostics: {
        fallbackUsed: false,
      },
    });
  });

  it("only saves search history when the user explicitly submits a search", async () => {
    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search definitions and ontologies/i), {
      target: { value: "gateway" },
    });

    await waitFor(() => expect(searchEntitiesWithMeta).toHaveBeenCalled());
    expect(saveSearchHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(saveSearchHistory).toHaveBeenCalledTimes(1));
    expect(saveSearchHistory.mock.calls[0][1]).toBe("gateway");
  });

  it("shows the editor-only ownership filter and applies it to searches", async () => {
    authState.role = "editor";

    render(<SearchPage />);

    const ownItemsToggle = await screen.findByRole("checkbox", { name: /my own ones/i });
    fireEvent.click(ownItemsToggle);
    fireEvent.change(screen.getByPlaceholderText(/search definitions and ontologies/i), {
      target: { value: "gateway" },
    });

    await waitFor(() =>
      expect(searchEntitiesWithMeta).toHaveBeenCalledWith(
        expect.anything(),
        "gateway",
        expect.objectContaining({
          ownership: "mine",
        }),
        expect.anything(),
        "user-1",
        expect.anything(),
      ),
    );
  });

  it("hides the ownership filter from viewers and admins", async () => {
    const { rerender } = render(<SearchPage />);

    expect(screen.queryByRole("checkbox", { name: /my own ones/i })).not.toBeInTheDocument();

    authState.role = "admin";
    rerender(<SearchPage />);

    expect(screen.queryByRole("checkbox", { name: /my own ones/i })).not.toBeInTheDocument();
  });

  it("updates the editor-only ownership filter immediately when the role changes", async () => {
    authState.role = "viewer";

    const { rerender } = render(<SearchPage />);

    expect(screen.queryByRole("checkbox", { name: /my own ones/i })).not.toBeInTheDocument();

    authState.role = "editor";
    rerender(<SearchPage />);

    expect(await screen.findByRole("checkbox", { name: /my own ones/i })).toBeInTheDocument();

    authState.role = "admin";
    rerender(<SearchPage />);

    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: /my own ones/i })).not.toBeInTheDocument(),
    );
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
    searchEntitiesWithMeta.mockResolvedValue({
      results: [
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
      ],
      diagnostics: {
        fallbackUsed: false,
      },
    });

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
