import { describe, expect, it, vi } from "vitest";

import { deleteDefinition, deleteOntology, updateDefinition, updateOntology } from "@/lib/entity-service";

describe("entity-service", () => {
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
