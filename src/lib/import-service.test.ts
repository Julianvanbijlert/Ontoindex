import { describe, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";

import { importDefinitionsToOntology } from "@/lib/import-service";

const fetchStandardsRuntimeSettings = vi.fn().mockResolvedValue({
  enabledStandards: ["mim", "nl-sbb", "rdf"],
  ruleOverrides: {},
});

vi.mock("@/lib/standards/settings-service", () => ({
  fetchStandardsRuntimeSettings: (...args: unknown[]) => fetchStandardsRuntimeSettings(...args),
  createDefaultStandardsSettings: () => ({
    enabledStandards: ["mim", "nl-sbb", "rdf"],
    ruleOverrides: {},
  }),
}));

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
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-1" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
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
    expect(definitionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ontology_id: "onto-1",
        created_by: "user-1",
        title: "Access Policy",
      }),
    );
  });

  it("uses direct persistence when semantic import metadata would be lost by the legacy rpc", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-iri-1" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { importedCount: 1, warnings: [] },
      error: null,
    });
    const client = {
      rpc,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "definitions.jsonld",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/security#AccessPolicy",
              "rdfs:label": "Access Policy",
              "rdfs:comment": "Policy definition",
              "onto:namespace": "security",
              "onto:section": "governance",
              "onto:group": "policies",
            },
          ],
        }),
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({
      success: true,
      imported: 1,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(definitionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ontology_id: "onto-1",
        created_by: "user-1",
        title: "Access Policy",
        metadata: {
          iri: "https://example.com/security#AccessPolicy",
          namespace: "security",
          section: "governance",
          group: "policies",
        },
      }),
    );
  });

  it("persists the compatibility projection of a canonical semantic import with projected relationships", async () => {
    const definitionSingles = [
      vi.fn().mockResolvedValue({ data: { id: "definition-1" }, error: null }),
      vi.fn().mockResolvedValue({ data: { id: "definition-2" }, error: null }),
    ];
    const definitionSelect = vi
      .fn()
      .mockReturnValueOnce({ single: definitionSingles[0] })
      .mockReturnValueOnce({ single: definitionSingles[1] });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const relationshipInsert = vi.fn().mockResolvedValue({ error: null });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "relationships") {
        return { insert: relationshipInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { importedCount: 2, warnings: [] },
      error: null,
    });
    const client = {
      rpc,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "definitions.jsonld",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/schemes/security",
              "@type": "skos:ConceptScheme",
              "rdfs:label": "Security Scheme",
            },
            {
              "@id": "https://example.com/concepts/control",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Control",
              "skos:definition": "Control definition",
            },
            {
              "@id": "https://example.com/concepts/access-policy",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Access Policy",
              "skos:definition": "Policy definition",
              "skos:broader": { "@id": "https://example.com/concepts/control" },
            },
          ],
        }),
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result).toMatchObject({
      success: true,
      imported: 2,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(definitionInsert).toHaveBeenCalledTimes(2);
    expect(relationshipInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_id: "definition-2",
          target_id: "definition-1",
          type: "is_a",
          label: null,
          created_by: "user-1",
        }),
      ]),
    );
  });

  it("surfaces standards validation issues as non-blocking import warnings", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-invalid-1" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { importedCount: 1, warnings: [] },
        error: null,
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "invalid.nt",
      text: vi.fn().mockResolvedValue(
        [
          '<not-a-valid-iri> <http://www.w3.org/2004/02/skos/core#prefLabel> "Access Policy" .',
          '<not-a-valid-iri> <http://www.w3.org/2004/02/skos/core#definition> "Policy definition" .',
        ].join("\n"),
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result.success).toBe(true);
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.warnings.join("\n")).toMatch(/standards validation/i);
    expect(result.standardsFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "rdf",
          ruleId: "rdf_invalid_subject_iri",
          path: expect.stringContaining("triples["),
        }),
      ]),
    );
  });

  it("preserves relationship standards metadata in direct persistence payloads", async () => {
    const definitionSingles = [
      vi.fn().mockResolvedValue({ data: { id: "definition-1" }, error: null }),
      vi.fn().mockResolvedValue({ data: { id: "definition-2" }, error: null }),
    ];
    const definitionSelect = vi
      .fn()
      .mockReturnValueOnce({ single: definitionSingles[0] })
      .mockReturnValueOnce({ single: definitionSingles[1] });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const relationshipInsert = vi.fn().mockResolvedValue({ error: null });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "relationships") {
        return { insert: relationshipInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { importedCount: 2, warnings: [] },
        error: null,
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "definitions.jsonld",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/schemes/security",
              "@type": "skos:ConceptScheme",
              "rdfs:label": "Security Scheme",
            },
            {
              "@id": "https://example.com/concepts/control",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Control",
              "skos:definition": "Control definition",
            },
            {
              "@id": "https://example.com/concepts/access-policy",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Access Policy",
              "skos:definition": "Policy definition",
              "skos:broader": { "@id": "https://example.com/concepts/control" },
            },
          ],
        }),
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result.success).toBe(true);
    expect(relationshipInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_id: "definition-2",
          target_id: "definition-1",
          metadata: expect.objectContaining({
            standards: expect.objectContaining({
              relation: expect.objectContaining({
                kind: "broader",
                predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
              }),
            }),
          }),
        }),
      ]),
    );
  });

  it("fails safely with an actionable message when search index RLS blocks the import rpc", async () => {
    const from = vi.fn();
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: "new row violates row-level security policy for table \"search_documents\"",
        },
      }),
      from,
    } as any;
    const file = {
      name: "definitions.csv",
      text: vi.fn().mockResolvedValue("title,description\nAccess Policy,Policy definition"),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/search index/i);
    expect(from).not.toHaveBeenCalled();
  });

  it("fails safely with an actionable message when direct import is blocked by search index RLS", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"search_documents\"",
      },
    });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { importedCount: 1, warnings: [] },
        error: null,
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    } as any;
    const file = {
      name: "definitions.jsonld",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/security#AccessPolicy",
              "rdfs:label": "Access Policy",
              "rdfs:comment": "Policy definition",
              "onto:namespace": "security",
            },
          ],
        }),
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/search index/i);
    expect(definitionInsert).toHaveBeenCalledTimes(1);
  });

  it("never writes directly to search_documents in the direct persistence fallback", async () => {
    const definitionSingle = vi.fn().mockResolvedValue({ data: { id: "definition-1" }, error: null });
    const definitionSelect = vi.fn().mockReturnValue({ single: definitionSingle });
    const definitionInsert = vi.fn().mockReturnValue({ select: definitionSelect });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "definitions") {
        return { insert: definitionInsert };
      }

      if (table === "activity_events") {
        return { insert: activityInsert };
      }

      if (table === "search_documents") {
        throw new Error("Direct search_documents writes are forbidden in client import flow.");
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

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(from).not.toHaveBeenCalledWith("search_documents");
  });

  it("fails the import when a configured blocking standards finding is present", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["rdf"],
      ruleOverrides: {
        rdf_invalid_subject_iri: "blocking",
      },
    });

    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { importedCount: 1, warnings: [] },
        error: null,
      }),
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    } as any;
    const file = {
      name: "invalid.nt",
      text: vi.fn().mockResolvedValue(
        '<not-a-valid-iri> <http://www.w3.org/2004/02/skos/core#prefLabel> "Access Policy" .',
      ),
    } as unknown as File;

    const result = await importDefinitionsToOntology(client, "onto-1", file);

    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toMatch(/blocking standards compliance issue/i);
    expect(client.from).not.toHaveBeenCalled();
  });
});
