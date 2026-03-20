import { describe, expect, it, vi } from "vitest";

import {
  canCurrentUserReviewAssignment,
  deriveAggregateReviewStatus,
  fetchReviewerOptions,
  filterAndSortWorkflowRequests,
  isWorkflowAdmin,
} from "@/lib/workflow-service";

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

  it("loads only editor and admin reviewer options", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { user_id: "user-1", display_name: "Editor User", email: "editor@example.com", team: "Architecture" },
        { user_id: "user-2", display_name: "Admin User", email: "admin@example.com", team: "Platform" },
      ],
      error: null,
    });
    const profileUserFilter = vi.fn().mockReturnValue({ order });
    const profileSelect = vi.fn().mockReturnValue({ in: profileUserFilter });
    const roleFilter = vi.fn().mockResolvedValue({
      data: [
        { user_id: "user-1", role: "editor" },
        { user_id: "user-2", role: "admin" },
      ],
      error: null,
    });
    const roleSelect = vi.fn().mockReturnValue({ in: roleFilter });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "user_roles") {
          return { select: roleSelect };
        }

        if (table === "profiles") {
          return { select: profileSelect };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    const result = await fetchReviewerOptions(client);

    expect(roleFilter).toHaveBeenCalledWith("role", ["editor", "admin", "reviewer"]);
    expect(profileSelect).toHaveBeenCalledWith("user_id, display_name, email, team");
    expect(profileUserFilter).toHaveBeenCalledWith("user_id", ["user-1", "user-2"]);
    expect(result.users.map((user) => user.displayName)).toEqual(["Editor User", "Admin User"]);
  });

  it("treats only admins as workflow admins", () => {
    expect(isWorkflowAdmin("admin")).toBe(true);
    expect(isWorkflowAdmin("editor")).toBe(false);
    expect(isWorkflowAdmin("viewer")).toBe(false);
    expect(isWorkflowAdmin("reviewer")).toBe(false);
  });
});
