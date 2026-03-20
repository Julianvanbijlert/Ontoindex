import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RelationshipPanel } from "@/components/shared/RelationshipPanel";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("RelationshipPanel", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.role = "viewer";
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
});
