import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RelationshipPanel } from "@/components/shared/RelationshipPanel";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const useStandardsRuntimeSettings = vi.fn();
const evaluateRelationshipStandardsCompliance = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/hooks/use-standards-runtime-settings", () => ({
  useStandardsRuntimeSettings: () => useStandardsRuntimeSettings(),
}));

vi.mock("@/lib/standards/compliance", () => ({
  evaluateRelationshipStandardsCompliance: (...args: unknown[]) => evaluateRelationshipStandardsCompliance(...args),
}));

describe("RelationshipPanel", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.role = "viewer";
    useStandardsRuntimeSettings.mockReset();
    useStandardsRuntimeSettings.mockReturnValue({
      settings: {
        enabledStandards: ["mim", "nl-sbb"],
        ruleOverrides: {},
      },
      loading: false,
      error: null,
    });
    evaluateRelationshipStandardsCompliance.mockReset();
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [],
      hasBlockingFindings: false,
      relationSuggestions: [],
      summary: {
        info: 0,
        warning: 0,
        error: 0,
        blocking: 0,
      },
    });
  });

  it("hides relationship mutation controls from viewers", () => {
    render(
      <RelationshipPanel
        entityId="definition-1"
        relationships={[
          {
            id: "rel-1",
            source_id: "definition-1",
            target_id: "definition-2",
            type: "related_to",
            label: "related to",
            target: { id: "definition-2", title: "Target Definition" },
          },
        ]}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /add relationship/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete relationship")).not.toBeInTheDocument();
  });

  it.each(["editor", "admin"])("shows relationship mutation controls for %s users", (role) => {
    authState.role = role;

    render(
      <RelationshipPanel
        entityId="definition-1"
        entityTitle="Source Definition"
        relationships={[
          {
            id: "rel-1",
            source_id: "definition-1",
            target_id: "definition-2",
            type: "related_to",
            label: "related to",
            target: { id: "definition-2", title: "Target Definition" },
          },
        ]}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /add relationship/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Delete relationship")).toBeInTheDocument();
  });

  it("renders compliant relation suggestions and keeps the custom option available", () => {
    authState.role = "editor";
    evaluateRelationshipStandardsCompliance.mockReturnValue({
      findings: [
        {
          id: "finding-1",
          effectiveSeverity: "warning",
          message: "Using a SKOS broader relation is recommended here.",
          explanation: "The initial NL-SBB pack prefers a hierarchical relation for this draft link.",
        },
      ],
      hasBlockingFindings: false,
      relationSuggestions: [
        {
          id: "suggestion-broader",
          standardId: "nl-sbb",
          label: "Use broader",
          explanation: "Recommended for hierarchical concept links.",
          selectedType: "is_a",
        },
        {
          id: "suggestion-custom-narrower",
          standardId: "nl-sbb",
          label: "Use narrower",
          explanation: "Keeps the SKOS semantics while preserving a custom label.",
          selectedType: "__custom__",
          customType: "narrower",
        },
      ],
      summary: {
        info: 0,
        warning: 1,
        error: 0,
        blocking: 0,
      },
    });

    render(
      <RelationshipPanel
        entityId="definition-1"
        entityTitle="Source Definition"
        relationships={[]}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add relationship/i }));

    expect(screen.getByText(/standards-first relationship choices/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use broader/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use narrower/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use related/i })).toBeInTheDocument();
    expect(screen.getByText(/source is broader than the target/i)).toBeInTheDocument();
    expect(screen.getByText(/retain skos narrower semantics/i)).toBeInTheDocument();
    expect(screen.getAllByText(/custom or legacy app relation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/use this fallback when the standards-first choices do not fit/i)).toBeInTheDocument();
  });
});
