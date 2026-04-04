import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DefinitionDetail from "@/pages/DefinitionDetail";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const evaluateDefinitionStandardsCompliance = vi.fn();
const useStandardsRuntimeSettings = vi.fn();
const updateDefinitionMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/shared/LikeButton", () => ({
  LikeButton: () => <div>LikeButton</div>,
}));

vi.mock("@/components/shared/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/shared/CommentThread", () => ({
  CommentThread: () => <div>CommentThread</div>,
}));

vi.mock("@/components/definition/DefinitionRelationsSection", () => ({
  DefinitionRelationsSection: ({ allowCreate }: { allowCreate: boolean }) => (
    <div>Relations allowCreate:{String(allowCreate)}</div>
  ),
}));

vi.mock("@/components/definition/DefinitionHistorySection", () => ({
  DefinitionHistorySection: () => <div>DefinitionHistorySection</div>,
}));

vi.mock("@/lib/entity-events", () => ({
  emitAppDataChanged: vi.fn(),
  subscribeToAppDataChanges: () => () => undefined,
}));

vi.mock("@/lib/history-service", () => ({
  fetchEntityTimelineEvents: vi.fn().mockResolvedValue([]),
  recordEntityView: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/entity-service", () => ({
  deleteDefinition: vi.fn(),
  updateDefinition: (...args: unknown[]) => updateDefinitionMock(...args),
}));

vi.mock("@/lib/workflow-service", () => ({
  fetchReviewerOptions: vi.fn().mockResolvedValue({ users: [], teams: [] }),
  formatReviewerLabel: () => "Reviewer",
  upsertDefinitionReviewRequest: vi.fn(),
}));

vi.mock("@/hooks/use-standards-runtime-settings", () => ({
  useStandardsRuntimeSettings: () => useStandardsRuntimeSettings(),
}));

vi.mock("@/lib/standards/compliance", () => ({
  evaluateDefinitionStandardsCompliance: (...args: unknown[]) => evaluateDefinitionStandardsCompliance(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "definitions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "definition-1",
                  ontology_id: "ontology-1",
                  title: "Access Policy",
                  description: "Definition description",
                  content: "Definition content",
                  example: "Example content",
                  metadata: {
                    iri: "https://example.com/security#AccessPolicy",
                    sourceReference: "ISO 27001",
                    sourceUrl: "https://example.com/iso27001",
                  },
                  tags: ["security"],
                  status: "approved",
                  priority: "normal",
                  version: 2,
                  view_count: 3,
                  created_at: "2026-03-19T08:00:00.000Z",
                  updated_at: "2026-03-20T08:00:00.000Z",
                  ontologies: {
                    id: "ontology-1",
                    title: "Security Ontology",
                  },
                },
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === "comments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      }

      if (table === "relationships") {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
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

      if (table === "approval_requests") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: vi.fn(),
      };
    }),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/definitions/definition-1"]}>
      <Routes>
        <Route path="/definitions/:id" element={<DefinitionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DefinitionDetail", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.role = "viewer";
    updateDefinitionMock.mockReset();
    updateDefinitionMock.mockResolvedValue({});
    useStandardsRuntimeSettings.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateDefinitionStandardsCompliance.mockReset();
    evaluateDefinitionStandardsCompliance.mockReturnValue({
      findings: [],
      hasBlockingFindings: false,
      summary: {
        info: 0,
        warning: 0,
        error: 0,
        blocking: 0,
      },
    });
  });

  it("keeps definition content visible for viewers while hiding edit and delete controls", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /workflow/i })).not.toBeInTheDocument();
    expect(screen.getByText("CommentThread")).toBeInTheDocument();
    expect(screen.getByText("Relations allowCreate:false")).toBeInTheDocument();
  });

  it.each(["editor", "admin"])("shows definition mutation controls for %s users", async (role) => {
    authState.role = role;

    renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /workflow/i })).toBeInTheDocument();
    expect(screen.getByText("Relations allowCreate:true")).toBeInTheDocument();
  });

  it("updates definition actions immediately when the role changes", async () => {
    authState.role = "viewer";

    const { rerender } = renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /workflow/i })).not.toBeInTheDocument();
    expect(screen.getByText("Relations allowCreate:false")).toBeInTheDocument();

    authState.role = "editor";
    rerender(
      <MemoryRouter initialEntries={["/definitions/definition-1"]}>
        <Routes>
          <Route path="/definitions/:id" element={<DefinitionDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /workflow/i })).toBeInTheDocument();
    expect(screen.getByText("Relations allowCreate:true")).toBeInTheDocument();

    authState.role = "viewer";
    rerender(
      <MemoryRouter initialEntries={["/definitions/definition-1"]}>
        <Routes>
          <Route path="/definitions/:id" element={<DefinitionDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /workflow/i })).not.toBeInTheDocument();
    expect(screen.getByText("Relations allowCreate:false")).toBeInTheDocument();
  });

  it("shows inline standards findings with explanations for the current definition", async () => {
    evaluateDefinitionStandardsCompliance.mockReturnValue({
      findings: [
        {
          id: "finding-1",
          effectiveSeverity: "warning",
          message: "Preferred label should align with the selected concept naming convention.",
          explanation: "The current placeholder MIM/NL-SBB pack prefers a more explicit semantic label.",
        },
      ],
      hasBlockingFindings: false,
      summary: {
        info: 0,
        warning: 1,
        error: 0,
        blocking: 0,
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());

    expect(screen.getByText("Standards compliance")).toBeInTheDocument();
    expect(screen.getByText(/preferred label should align/i)).toBeInTheDocument();
    expect(screen.getByText(/prefers a more explicit semantic label/i)).toBeInTheDocument();
  });

  it("adapts the definition editor to active standards and persists source metadata", async () => {
    authState.role = "editor";

    renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByText(/active standards shape this definition form/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/preferred label \/ title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^definition$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/identifier iri/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/source reference/i), {
      target: { value: "AVG article 6" },
    });
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "https://example.com/avg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateDefinitionMock).toHaveBeenCalledTimes(1));
    expect(updateDefinitionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({
          metadata: expect.objectContaining({
            sourceReference: "AVG article 6",
            sourceUrl: "https://example.com/avg",
          }),
        }),
      }),
    );
  });

  it("prevents saving when effective severity is blocking", async () => {
    authState.role = "editor";
    updateDefinitionMock.mockRejectedValueOnce(new Error("Definition cannot be saved while the source IRI is invalid."));
    evaluateDefinitionStandardsCompliance.mockReturnValue({
      findings: [
        {
          id: "finding-1",
          effectiveSeverity: "blocking",
          message: "Definition cannot be saved while the source IRI is invalid.",
          explanation: "Blocking rules are enforced before save.",
        },
      ],
      hasBlockingFindings: true,
      summary: {
        info: 0,
        warning: 0,
        error: 0,
        blocking: 1,
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("Access Policy")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/cannot be saved while the source iri is invalid/i)).toBeInTheDocument());
    expect(updateDefinitionMock).toHaveBeenCalledTimes(1);
  });
});
