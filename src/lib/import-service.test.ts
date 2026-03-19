import { describe, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";

import { importDefinitionsToOntology } from "@/lib/import-service";

describe("import-service", () => {
  it("parses CSV rows and sends them to the ontology import rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { importedCount: 2, warnings: [] },
      error: null,
    });
    const client = { rpc } as any;
    const file = {
      name: "definitions.csv",
      text: vi.fn().mockResolvedValue(
        "title,description,tags\nAuthentication Token,Token definition,security|api\nUser Profile,Profile definition,identity",
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({ success: true, imported: 2 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("import_definitions_to_ontology");
    expect(rpc.mock.calls[0][1]._ontology_id).toBe("onto-1");
    expect(rpc.mock.calls[0][1]._rows[0]).toMatchObject({
      title: "Authentication Token",
      description: "Token definition",
      tags: ["security", "api"],
    });
  });

  it("parses Excel rows and sends them to the ontology import rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { importedCount: 1, warnings: [] },
      error: null,
    });
    const client = { rpc } as any;
    const workbook = utils.book_new();
    const worksheet = utils.json_to_sheet([
      { title: "Access Policy", description: "Excel import row", tags: "security, policy" },
    ]);

    utils.book_append_sheet(workbook, worksheet, "Definitions");

    const buffer = write(workbook, { type: "array", bookType: "xlsx" });
    const workbookArrayBuffer =
      buffer instanceof ArrayBuffer
        ? buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const file = {
      name: "definitions.xlsx",
      arrayBuffer: vi.fn().mockResolvedValue(workbookArrayBuffer),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(rpc.mock.calls[0][1]._rows[0]).toMatchObject({
      title: "Access Policy",
      description: "Excel import row",
      tags: ["security", "policy"],
    });
  });
});
