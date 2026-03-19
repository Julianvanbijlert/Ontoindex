import { describe, expect, it, vi } from "vitest";

import { deleteDefinition, deleteOntology } from "@/lib/entity-service";

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
});
