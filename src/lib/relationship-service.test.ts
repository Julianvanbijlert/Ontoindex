import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchStandardsRuntimeSettings = vi.fn();

vi.mock("@/lib/standards/settings-service", () => ({
  fetchStandardsRuntimeSettings: (...args: unknown[]) => fetchStandardsRuntimeSettings(...args),
}));

import {
  buildRelationshipPayload,
  createRelationshipRecord,
  CUSTOM_RELATION_TYPE,
  deleteRelationshipRecord,
  getRelationshipDisplayLabel,
} from "@/lib/relationship-service";
import { mapOntologyToStandardsModel } from "@/lib/standards/mappers/ontology-to-standards";

describe("relationship-service", () => {
  beforeEach(() => {
    fetchStandardsRuntimeSettings.mockReset();
  });

  it("uses authoritative runtime settings for relationship validation instead of stale caller settings", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["nl-sbb"],
      ruleOverrides: {
        nl_sbb_unmapped_relation_semantics: "blocking",
      },
    });
    const client = {
      from: vi.fn(),
    } as any;

    await expect(createRelationshipRecord(client, {
      sourceId: "definition-1",
      targetId: "definition-2",
      selectedType: CUSTOM_RELATION_TYPE,
      customType: "blocks rollout",
      createdBy: "user-1",
      standards: {
        settings: {
          enabledStandards: [],
          ruleOverrides: {},
        },
        sourceDefinition: {
          title: "Source Definition",
        },
        targetDefinition: {
          title: "Target Definition",
        },
      },
    })).rejects.toThrow(/blocking standards compliance/i);

    expect(fetchStandardsRuntimeSettings).toHaveBeenCalledWith(client);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("persists custom relation types in the relationship label while keeping a valid base type", () => {
    const payload = buildRelationshipPayload({
      sourceId: "definition-1",
      targetId: "definition-2",
      selectedType: CUSTOM_RELATION_TYPE,
      customType: "blocks rollout",
      createdBy: "user-1",
      metadata: {
        standards: {
          relation: {
            kind: "related",
            predicateIri: "http://www.w3.org/2004/02/skos/core#related",
          },
        },
      },
    });

    expect(payload).toMatchObject({
      source_id: "definition-1",
      target_id: "definition-2",
      type: "related_to",
      label: "blocks rollout",
      created_by: "user-1",
      metadata: {
        standards: {
          relation: {
            kind: "related",
          },
        },
      },
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

  it("stores structured relationship metadata when creating relationships", async () => {
    const relationshipSingle = vi.fn().mockResolvedValue({
      data: {
        id: "rel-2",
        source_id: "definition-1",
        target_id: "definition-2",
        type: "is_a",
        label: null,
        metadata: {
          standards: {
            relation: {
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
          },
        },
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
      selectedType: "is_a",
      createdBy: "user-1",
      metadata: {
        standards: {
          relation: {
            kind: "broader",
            predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
          },
          association: {
            sourceRole: "parent",
            targetRole: "child",
          },
        },
      },
    } as any);

    expect(relationshipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: "definition-1",
        target_id: "definition-2",
        metadata: expect.objectContaining({
          standards: expect.objectContaining({
            relation: expect.objectContaining({
              kind: "broader",
            }),
          }),
        }),
      }),
    );
  });

  it("persists standards suggestion metadata so canonical mapping keeps narrower semantics", () => {
    const payload = buildRelationshipPayload({
      sourceId: "definition-1",
      targetId: "definition-2",
      selectedType: CUSTOM_RELATION_TYPE,
      customType: "narrower",
      createdBy: "user-1",
      metadata: {
        standards: {
          relation: {
            kind: "narrower",
            predicateKey: "narrower",
            predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
          },
        },
      },
    });
    const model = mapOntologyToStandardsModel({
      ontologyId: "ontology-1",
      ontologyTitle: "Security Ontology",
      definitions: [
        {
          id: "definition-1",
          title: "Source",
          relationships: [
            {
              id: "rel-narrower",
              source_id: "definition-1",
              target_id: "definition-2",
              type: payload.type,
              label: payload.label,
              metadata: payload.metadata as any,
            },
          ],
        },
        {
          id: "definition-2",
          title: "Target",
          relationships: [],
        },
      ],
    });

    expect(model.conceptRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rel-narrower",
          kind: "narrower",
          predicateKey: "narrower",
          predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
        }),
      ]),
    );
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
