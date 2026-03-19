import { describe, expect, it } from "vitest";

import { buildRelationshipPayload, CUSTOM_RELATION_TYPE, getRelationshipDisplayLabel } from "@/lib/relationship-service";

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
});
