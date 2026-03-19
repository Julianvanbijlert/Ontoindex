import { describe, expect, it } from "vitest";

import { canCurrentUserReviewAssignment, deriveAggregateReviewStatus, filterAndSortWorkflowRequests } from "@/lib/workflow-service";

describe("workflow-service", () => {
  it("filters workflow requests by query and sorts them by title", () => {
    const result = filterAndSortWorkflowRequests(
      [
        {
          id: "1",
          status: "in_review",
          message: "Needs approval",
          review_message: null,
          created_at: "2026-03-19T09:00:00.000Z",
          updated_at: "2026-03-19T09:00:00.000Z",
          definition_id: "def-1",
          definitions: { title: "Zeta Definition", description: "First" },
        },
        {
          id: "2",
          status: "in_review",
          message: "Needs approval",
          review_message: null,
          created_at: "2026-03-19T08:00:00.000Z",
          updated_at: "2026-03-19T08:00:00.000Z",
          definition_id: "def-2",
          definitions: { title: "Alpha Definition", description: "Second" },
        },
      ],
      {
        query: "definition",
        status: "in_review",
        sortBy: "title",
      },
    );

    expect(result.map((request) => request.id)).toEqual(["2", "1"]);
  });

  it("marks a definition as approved only when every reviewer assignment is accepted", () => {
    expect(
      deriveAggregateReviewStatus([
        { id: "1", status: "accepted", reviewer_user_id: "user-1" },
        { id: "2", status: "accepted", reviewer_team: "Architecture" },
      ] as any),
    ).toBe("approved");
    expect(
      deriveAggregateReviewStatus([
        { id: "1", status: "accepted", reviewer_user_id: "user-1" },
        { id: "2", status: "pending", reviewer_team: "Architecture" },
      ] as any),
    ).toBe("in_review");
    expect(
      deriveAggregateReviewStatus([
        { id: "1", status: "accepted", reviewer_user_id: "user-1" },
        { id: "2", status: "rejected", reviewer_team: "Architecture" },
      ] as any),
    ).toBe("rejected");
  });

  it("lets assigned team members review team assignments", () => {
    expect(
      canCurrentUserReviewAssignment(
        { id: "assignment-1", status: "pending", reviewer_team: "Architecture" } as any,
        "user-1",
        "Architecture",
        false,
      ),
    ).toBe(true);
  });
});
