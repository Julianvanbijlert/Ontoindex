import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentThread } from "@/components/shared/CommentThread";

const authState = {
  user: { id: "user-1" },
  role: "viewer",
};

const createCommentRecord = vi.fn();
const deleteCommentRecord = vi.fn();
const setCommentResolved = vi.fn();
const updateCommentRecord = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/lib/comment-service", () => ({
  createCommentRecord: (...args: unknown[]) => createCommentRecord(...args),
  deleteCommentRecord: (...args: unknown[]) => deleteCommentRecord(...args),
  setCommentResolved: (...args: unknown[]) => setCommentResolved(...args),
  updateCommentRecord: (...args: unknown[]) => updateCommentRecord(...args),
}));

vi.mock("@/components/shared/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

function renderThread(comments: any[]) {
  return render(
    <CommentThread
      comments={comments}
      entityId="definition-1"
      entityType="definition"
      onRefresh={vi.fn()}
    />,
  );
}

describe("CommentThread", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.role = "viewer";
    createCommentRecord.mockReset().mockResolvedValue({ id: "comment-new" });
    deleteCommentRecord.mockReset().mockResolvedValue({ deleted: true });
    setCommentResolved.mockReset().mockResolvedValue({ is_resolved: true });
    updateCommentRecord.mockReset().mockResolvedValue({ id: "comment-1" });
  });

  it("lets viewers post comments and delete their own comments without resolve controls", async () => {
    renderThread([
      {
        id: "comment-1",
        content: "My comment",
        user_id: "user-1",
        created_at: "2026-03-20T09:00:00.000Z",
        updated_at: "2026-03-20T09:00:00.000Z",
        is_resolved: false,
        parent_id: null,
        profiles: { display_name: "Viewer User" },
      },
    ]);

    expect(screen.getByRole("button", { name: /post comment/i })).toBeInTheDocument();

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.queryByText("Resolve")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));

    expect(deleteCommentRecord).toHaveBeenCalledWith({}, "comment-1");
  });

  it("does not show moderation actions to viewers for other users' comments", () => {
    renderThread([
      {
        id: "comment-2",
        content: "Someone else's comment",
        user_id: "user-2",
        created_at: "2026-03-20T09:00:00.000Z",
        updated_at: "2026-03-20T09:00:00.000Z",
        is_resolved: false,
        parent_id: null,
        profiles: { display_name: "Other User" },
      },
    ]);

    expect(screen.queryByLabelText("Comment actions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reply/i })).toBeInTheDocument();
  });

  it.each(["editor", "admin"])(
    "lets %s users resolve and delete comments by other users",
    async (role) => {
      authState.role = role;

      renderThread([
        {
          id: "comment-3",
          content: "Needs moderation",
          user_id: "user-2",
          created_at: "2026-03-20T09:00:00.000Z",
          updated_at: "2026-03-20T09:00:00.000Z",
          is_resolved: false,
          parent_id: null,
          profiles: { display_name: "Other User" },
        },
      ]);

      expect(screen.getByText("Resolve")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Resolve"));

      expect(setCommentResolved).toHaveBeenCalledWith({}, {
        commentId: "comment-3",
        resolved: true,
      });
    },
  );
});
