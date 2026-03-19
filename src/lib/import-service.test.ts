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

  it('normalizes "medium" priority and "in-review" status with warnings', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { importedCount: 1, warnings: [] },
      error: null,
    });
    const client = { rpc } as any;
    const file = {
      name: "definitions.csv",
      text: vi.fn().mockResolvedValue(
        "title,description,priority,status\nAccess Policy,Policy definition,medium,in-review",
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({
      success: true,
      imported: 1,
      warningCount: 2,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('normalized priority "medium" to "normal"'),
        expect.stringContaining('normalized status "in-review" to "in review"'),
      ]),
    );
    expect(rpc.mock.calls[0][1]._rows[0]).toMatchObject({
      priority: "normal",
      status: "in_review",
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

  it("falls back to direct inserts when the import rpc is missing from the schema cache", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions" || table === "activity_events") {
        return { insert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Could not find the function public.import_definitions_to_ontology(_ontology_id, _rows) in the schema cache" },
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "definitions.csv",
      text: vi.fn().mockResolvedValue("title,description\nAccess Policy,Policy definition"),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({
      success: true,
      imported: 1,
      warningCount: 1,
      errorCount: 0,
    });
    expect(result.warnings[0]).toContain("database import RPC was unavailable");
    expect(from).toHaveBeenCalledWith("definitions");
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          ontology_id: "onto-1",
          created_by: "user-1",
          title: "Access Policy",
        }),
      ]),
    );
  });
});
