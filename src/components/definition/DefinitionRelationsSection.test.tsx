import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DefinitionRelationsSection } from "@/components/definition/DefinitionRelationsSection";

const navigate = vi.fn();

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

describe("DefinitionRelationsSection", () => {
  it("navigates to the related definition when a relation is clicked", () => {
    render(
      <DefinitionRelationsSection
        entityId="definition-1"
        relationships={[
          {
            id: "rel-1",
            source_id: "definition-1",
            target_id: "definition-2",
            type: "related_to",
            label: "Related to",
            source: { id: "definition-1", title: "Source Definition" },
            target: { id: "definition-2", title: "Target Definition" },
          },
        ]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Target Definition").closest("button")!);

    expect(navigate).toHaveBeenCalledWith("/definitions/definition-2");
  });
});
