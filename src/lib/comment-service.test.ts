import { describe, expect, it, vi } from "vitest";

import {
  createCommentRecord,
  deleteCommentRecord,
  setCommentResolved,
  updateCommentRecord,
} from "@/lib/comment-service";

describe("comment-service", () => {
  it("creates comments through the shared comments table flow", async () => {
    const commentSingle = vi.fn().mockResolvedValue({ data: { id: "comment-1" }, error: null });
    const commentSelect = vi.fn().mockReturnValue({ single: commentSingle });
    const commentInsert = vi.fn().mockReturnValue({ select: commentSelect });
    const client = {
      from: vi.fn(() => ({
        insert: commentInsert,
      })),
    } as any;

    await createCommentRecord(client, {
      definitionId: "definition-1",
      userId: "user-1",
      content: "Hello world",
      parentId: "comment-0",
    });

    expect(commentInsert).toHaveBeenCalledWith({
      definition_id: "definition-1",
      user_id: "user-1",
      content: "Hello world",
      parent_id: "comment-0",
    });
  });

  it("updates comment content through the shared comments table flow", async () => {
    const commentSingle = vi.fn().mockResolvedValue({ data: { id: "comment-1" }, error: null });
    const commentSelect = vi.fn().mockReturnValue({ single: commentSingle });
    const commentEq = vi.fn().mockReturnValue({ select: commentSelect });
    const commentUpdate = vi.fn().mockReturnValue({ eq: commentEq });
    const client = {
      from: vi.fn(() => ({
        update: commentUpdate,
      })),
    } as any;

    await updateCommentRecord(client, {
      commentId: "comment-1",
      content: "Updated comment",
    });

    expect(commentUpdate).toHaveBeenCalledWith({
      content: "Updated comment",
    });
    expect(commentEq).toHaveBeenCalledWith("id", "comment-1");
  });

  it("deletes comments through the backend delete rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });
    const client = { rpc } as any;

    await deleteCommentRecord(client, "comment-1");

    expect(rpc).toHaveBeenCalledWith("delete_comment", {
      _comment_id: "comment-1",
    });
  });

  it("resolves comments through the backend moderation rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { is_resolved: true }, error: null });
    const client = { rpc } as any;

    await setCommentResolved(client, {
      commentId: "comment-1",
      resolved: true,
    });

    expect(rpc).toHaveBeenCalledWith("set_comment_resolved", {
      _comment_id: "comment-1",
      _resolved: true,
    });
  });
});
