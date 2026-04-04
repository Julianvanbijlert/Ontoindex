import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchStandardsRuntimeSettings = vi.fn();

vi.mock("@/lib/standards/settings-service", () => ({
  fetchStandardsRuntimeSettings: (...args: unknown[]) => fetchStandardsRuntimeSettings(...args),
}));

import { createDefinition, deleteDefinition, deleteOntology, updateDefinition, updateOntology } from "@/lib/entity-service";
import { StandardsBlockingFindingsError } from "@/lib/standards/compliance";

describe("entity-service", () => {
  beforeEach(() => {
    fetchStandardsRuntimeSettings.mockReset();
  });

  it("uses authoritative runtime settings for definition creation instead of stale caller settings", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["nl-sbb"],
      ruleOverrides: {
        nl_sbb_invalid_concept_iri: "blocking",
      },
    });
    const client = {
      from: vi.fn(),
    } as any;

    await expect(createDefinition(client, {
      ontologyId: "ontology-1",
      ontologyTitle: "Security Ontology",
      createdBy: "user-1",
      definition: {
        title: "Access Policy",
        description: "Policy definition",
        metadata: {
          iri: "not-a-valid-iri",
        },
      },
      standards: {
        ontologyId: "ontology-1",
        ontologyTitle: "Security Ontology",
        settings: {
          enabledStandards: [],
          ruleOverrides: {},
        },
      },
    })).rejects.toBeInstanceOf(StandardsBlockingFindingsError);

    expect(fetchStandardsRuntimeSettings).toHaveBeenCalledWith(client);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("honors disabled authoritative standards even when stale caller settings are stricter", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: [],
      ruleOverrides: {},
    });
    const definitionSingle = vi.fn().mockResolvedValue({
      data: { id: "definition-1", title: "Access Policy" },
      error: null,
    });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "definitions") {
          return { insert: definitionInsert };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await createDefinition(client, {
      ontologyId: "ontology-1",
      ontologyTitle: "Security Ontology",
      createdBy: "user-1",
      definition: {
        title: "Access Policy",
        description: "Policy definition",
        metadata: {
          iri: "not-a-valid-iri",
        },
      },
      standards: {
        ontologyId: "ontology-1",
        ontologyTitle: "Security Ontology",
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {
            nl_sbb_invalid_concept_iri: "blocking",
          },
        },
      },
    });

    expect(fetchStandardsRuntimeSettings).toHaveBeenCalledWith(client);
    expect(definitionInsert).toHaveBeenCalledTimes(1);
  });

  it("deletes definitions through the backend cascade rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });
    const client = { rpc } as any;

    await deleteDefinition(client, "definition-1");

    expect(rpc).toHaveBeenCalledWith("delete_definition_cascade", {
      _definition_id: "definition-1",
    });
  });

  it("deletes ontologies through the backend cascade rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });
    const client = { rpc } as any;

    await deleteOntology(client, "ontology-1");

    expect(rpc).toHaveBeenCalledWith("delete_ontology_cascade", {
      _ontology_id: "ontology-1",
    });
  });

  it("renames a definition from the graph through the shared definition service and logs history", async () => {
    const versionInsert = vi.fn().mockResolvedValue({ error: null });
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-1", title: "Renamed Definition" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionUpdateEq = vi.fn().mockReturnValue({ select: definitionSelect });
    const definitionUpdate = vi.fn().mockReturnValue({ eq: definitionUpdateEq });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "version_history") {
          return { insert: versionInsert };
        }

        if (table === "definitions") {
          return { update: definitionUpdate };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await updateDefinition(client, {
      definitionId: "definition-1",
      userId: "user-1",
      source: "graph",
      previous: {
        title: "Old Definition",
        description: "Previous description",
        content: "Previous context",
        example: "Previous example",
        metadata: {},
        version: 2,
      },
      changes: {
        title: "Renamed Definition",
        description: "Previous description",
        content: "Previous context",
        example: "Previous example",
      },
    });

    expect(versionInsert).toHaveBeenCalledWith(expect.objectContaining({
      definition_id: "definition-1",
      version: 2,
    }));
    expect(definitionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Renamed Definition",
      version: 3,
    }));
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: "updated",
      entity_type: "definition",
      entity_id: "definition-1",
      details: expect.objectContaining({
        source: "graph",
      }),
    }));
  });

  it("creates definitions through the shared service and logs activity", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({
      data: { id: "definition-1", title: "Access Policy" },
      error: null,
    });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "definitions") {
          return { insert: definitionInsert };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await createDefinition(client, {
      ontologyId: "ontology-1",
      createdBy: "user-1",
      definition: {
        title: "Access Policy",
        description: "Policy definition",
        content: "Context",
        example: "Example",
        priority: "normal",
        status: "draft",
      },
    });

    expect(definitionInsert).toHaveBeenCalledWith(expect.objectContaining({
      ontology_id: "ontology-1",
      created_by: "user-1",
      title: "Access Policy",
    }));
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: "created",
      entity_type: "definition",
      entity_title: "Access Policy",
    }));
  });

  it("persists standards-shaped source metadata when creating definitions", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({
      data: { id: "definition-1", title: "Access Policy" },
      error: null,
    });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "definitions") {
          return { insert: definitionInsert };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await createDefinition(client, {
      ontologyId: "ontology-1",
      createdBy: "user-1",
      definition: {
        title: "Access Policy",
        description: "Policy definition",
        metadata: {
          sourceReference: "ISO 27001:2022 clause 5",
          sourceUrl: "https://example.com/iso-27001",
        },
      },
    });

    expect(definitionInsert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        sourceReference: "ISO 27001:2022 clause 5",
        sourceUrl: "https://example.com/iso-27001",
      }),
    }));
  });

  it("persists standards-shaped metadata updates for definitions", async () => {
    const versionInsert = vi.fn().mockResolvedValue({ error: null });
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-1", title: "Updated Definition" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionUpdateEq = vi.fn().mockReturnValue({ select: definitionSelect });
    const definitionUpdate = vi.fn().mockReturnValue({ eq: definitionUpdateEq });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "version_history") {
          return { insert: versionInsert };
        }

        if (table === "definitions") {
          return { update: definitionUpdate };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await updateDefinition(client, {
      definitionId: "definition-1",
      userId: "user-1",
      previous: {
        title: "Old Definition",
        description: "Previous definition",
        content: "Previous context",
        example: "Previous example",
        metadata: {},
        version: 1,
      },
      changes: {
        title: "Updated Definition",
        description: "Updated definition",
        content: "Updated context",
        example: "Updated example",
        metadata: {
          sourceReference: "AVG article 6",
          sourceUrl: "https://example.com/avg",
        },
      },
    });

    expect(definitionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        sourceReference: "AVG article 6",
        sourceUrl: "https://example.com/avg",
      }),
    }));
  });

  it("blocks definition creation on blocking standards findings before writing", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["nl-sbb"],
      ruleOverrides: {
        nl_sbb_invalid_concept_iri: "blocking",
      },
    });
    const client = {
      from: vi.fn(),
    } as any;

    await expect(createDefinition(client, {
      ontologyId: "ontology-1",
      ontologyTitle: "Security Ontology",
      createdBy: "user-1",
      definition: {
        title: "Access Policy",
        description: "Policy definition",
        metadata: {
          iri: "not-a-valid-iri",
        },
      },
      standards: {
        ontologyId: "ontology-1",
        ontologyTitle: "Security Ontology",
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {
            nl_sbb_invalid_concept_iri: "blocking",
          },
        },
      },
    })).rejects.toBeInstanceOf(StandardsBlockingFindingsError);

    expect(client.from).not.toHaveBeenCalled();
  });

  it("blocks definition updates on blocking standards findings before writing version history", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["nl-sbb"],
      ruleOverrides: {
        nl_sbb_invalid_concept_iri: "blocking",
      },
    });
    const client = {
      from: vi.fn(),
    } as any;

    await expect(updateDefinition(client, {
      definitionId: "definition-1",
      userId: "user-1",
      previous: {
        title: "Old Definition",
        description: "Previous description",
        content: "Previous context",
        example: "Previous example",
        metadata: {
          iri: "not-a-valid-iri",
        },
        version: 2,
      },
      changes: {
        title: "Renamed Definition",
        description: "Previous description",
        content: "Previous context",
        example: "Previous example",
      },
      standards: {
        ontologyId: "ontology-1",
        ontologyTitle: "Security Ontology",
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {
            nl_sbb_invalid_concept_iri: "blocking",
          },
        },
      },
    })).rejects.toBeInstanceOf(StandardsBlockingFindingsError);

    expect(client.from).not.toHaveBeenCalled();
  });

  it("updates ontologies through the shared ontology service and logs history", async () => {
    const ontologySingle = vi.fn().mockResolvedValue({ data: { id: "ontology-1", title: "Updated Ontology" }, error: null });
    const ontologySelect = vi.fn().mockReturnValue({ single: ontologySingle });
    const ontologyUpdateEq = vi.fn().mockReturnValue({ select: ontologySelect });
    const ontologyUpdate = vi.fn().mockReturnValue({ eq: ontologyUpdateEq });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "ontologies") {
          return { update: ontologyUpdate };
        }

        if (table === "activity_events") {
          return { insert: activityInsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await updateOntology(client, {
      ontologyId: "ontology-1",
      userId: "user-1",
      previous: {
        title: "Old Ontology",
        description: "Previous description",
        tags: ["security"],
      },
      changes: {
        title: "Updated Ontology",
        description: "Updated description",
        tags: ["security", "governance"],
      },
    });

    expect(ontologyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Updated Ontology",
      tags: ["security", "governance"],
    }));
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: "updated",
      entity_type: "ontology",
      entity_id: "ontology-1",
    }));
  });
});
