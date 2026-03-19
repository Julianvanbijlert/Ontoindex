import { describe, expect, it, vi } from "vitest";

import {
  buildRelationshipPayload,
  createRelationshipRecord,
  CUSTOM_RELATION_TYPE,
  deleteRelationshipRecord,
  getRelationshipDisplayLabel,
} from "@/lib/relationship-service";

describe("relationship-service", () => {
  it("persists custom relation types in the relationship label while keeping a valid base type", () => {
    const payload = buildRelationshipPayload({
      sourceId: "definition-1",
      targetId: "definition-2",
      selectedType: CUSTOM_RELATION_TYPE,
      customType: "blocks rollout",
      createdBy: "user-1",
    });

    expect(payload).toMatchObject({
      source_id: "definition-1",
      target_id: "definition-2",
      type: "related_to",
      label: "blocks rollout",
      created_by: "user-1",
    });
  });

  it("prefers the persisted custom label when rendering relation names", () => {
    expect(getRelationshipDisplayLabel("related_to", "blocks rollout")).toBe("blocks rollout");
    expect(getRelationshipDisplayLabel("depends_on", null)).toBe("depends on");
  });

  it("creates relationship history entries for both linked definitions", async () => {
    const relationshipSingle = vi.fn().mockResolvedValue({
      data: {
        id: "rel-1",
        source_id: "definition-1",
        target_id: "definition-2",
        type: "related_to",
        label: "blocks rollout",
      },
      error: null,
    });
    const relationshipSelect = vi.fn().mockReturnValue({ single: relationshipSingle });
    const relationshipInsert = vi.fn().mockReturnValue({ select: relationshipSelect });
    const definitionsIn = vi.fn().mockResolvedValue({
      data: [
        { id: "definition-1", title: "Source Definition" },
        { id: "definition-2", title: "Target Definition" },
      ],
    });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "relationships") {
          return { insert: relationshipInsert };
        }

        if (table === "definitions") {
          return { select: vi.fn().mockReturnValue({ in: definitionsIn }) };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await createRelationshipRecord(client, {
      sourceId: "definition-1",
      targetId: "definition-2",
      selectedType: CUSTOM_RELATION_TYPE,
      customType: "blocks rollout",
      createdBy: "user-1",
    });

    expect(activityInsert).toHaveBeenCalledTimes(2);
    expect(activityInsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "relationship_added",
      entity_id: "definition-1",
    }));
    expect(activityInsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "relationship_added",
      entity_id: "definition-2",
    }));
  });

  it("creates removal history entries when a relationship is deleted", async () => {
    const relationshipDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const relationshipDelete = vi.fn().mockReturnValue({ eq: relationshipDeleteEq });
    const definitionsIn = vi.fn().mockResolvedValue({
      data: [
        { id: "definition-1", title: "Source Definition" },
        { id: "definition-2", title: "Target Definition" },
      ],
    });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "relationships") {
          return { delete: relationshipDelete };
        }

        if (table === "definitions") {
          return { select: vi.fn().mockReturnValue({ in: definitionsIn }) };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await deleteRelationshipRecord(client, {
      relationshipId: "rel-1",
      sourceId: "definition-1",
      targetId: "definition-2",
      type: "related_to",
      label: "blocks rollout",
      deletedBy: "user-1",
    });

    expect(activityInsert).toHaveBeenCalledTimes(2);
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: "relationship_removed",
    }));
  });
});
