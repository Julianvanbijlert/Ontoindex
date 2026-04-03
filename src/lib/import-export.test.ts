import { describe, expect, it, vi } from "vitest";

import { ExportFactory, fetchOntologyExportSnapshot, type OntologyExportSnapshot } from "@/lib/import-export";
import { ImportFactory } from "@/lib/import-factory";

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

const snapshot: OntologyExportSnapshot = {
  ontology: {
    id: "onto-1",
    title: "Security Ontology",
    description: "Security concepts",
    status: "approved",
    tags: ["security"],
    updatedAt: "2026-03-19T12:00:00.000Z",
  },
  definitions: [
    {
      id: "def-1",
      title: "Access Policy",
      description: "Policy definition",
      content: "Context",
      example: "Example",
      status: "approved",
      priority: "normal",
      tags: ["security"],
      updatedAt: "2026-03-19T12:00:00.000Z",
      viewCount: 5,
      metadata: {
        iri: "https://example.com/security#AccessPolicy",
        namespace: "security",
        section: "governance",
        group: "policies",
      },
      relationships: [
        {
          id: "rel-1",
          type: "related_to",
          label: "governs",
          targetId: "def-2",
          targetTitle: "Control Set",
        },
      ],
    },
    {
      id: "def-2",
      title: "Control Set",
      description: "Controls",
      content: "",
      example: "",
      status: "draft",
      priority: "high",
      tags: ["controls"],
      updatedAt: "2026-03-19T12:30:00.000Z",
      viewCount: 7,
      metadata: {
        iri: "https://example.com/security#ControlSet",
        namespace: "security",
      },
      relationships: [],
    },
  ],
};

const semanticSnapshot: OntologyExportSnapshot = {
  ontology: {
    id: "onto-1",
    title: "Security Ontology",
    description: "Security concepts",
    status: "approved",
    tags: ["security"],
    updatedAt: "2026-03-19T12:00:00.000Z",
  },
  definitions: [
    {
      id: "def-1",
      title: "Access Policy",
      description: "Policy definition",
      content: "Used to govern access",
      example: "Example",
      status: "approved",
      priority: "normal",
      tags: ["security"],
      updatedAt: "2026-03-19T12:00:00.000Z",
      viewCount: 5,
      metadata: {
        iri: "https://example.com/security#AccessPolicy",
        namespace: "security",
        section: "governance",
        group: "policies",
      },
      relationships: [
        {
          id: "rel-1",
          type: "is_a",
          targetId: "def-2",
          targetTitle: "Control Set",
        },
      ],
    },
    {
      id: "def-2",
      title: "Control Set",
      description: "Controls",
      content: "",
      example: "",
      status: "draft",
      priority: "high",
      tags: ["controls"],
      updatedAt: "2026-03-19T12:30:00.000Z",
      viewCount: 7,
      metadata: {
        iri: "https://example.com/security#ControlSet",
        namespace: "security",
      },
      relationships: [],
    },
  ],
};

const structuredMetadataSnapshot: OntologyExportSnapshot = {
  ontology: {
    id: "onto-structured",
    title: "Structured Ontology",
    description: "Structured metadata",
    status: "draft",
    tags: [],
    updatedAt: "2026-03-20T10:00:00.000Z",
  },
  definitions: [
    {
      id: "def-source",
      title: "Source",
      description: "Source definition",
      content: "",
      example: "",
      status: "draft",
      priority: "normal",
      tags: [],
      updatedAt: "2026-03-20T10:00:00.000Z",
      viewCount: 0,
      metadata: {
        iri: "https://example.com/model#Source",
        standards: {
          class: {
            attributes: [
              {
                id: "attr-code",
                name: "code",
                datatypeId: "string",
              },
            ],
          },
        },
      },
      relationships: [
        {
          id: "rel-structured",
          type: "related_to",
          label: "broader",
          targetId: "def-target",
          targetTitle: "Target",
          metadata: {
            standards: {
              relation: {
                kind: "broader",
                predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
                predicateKey: "broader",
                attributes: [
                  {
                    id: "rel-attr-strength",
                    name: "strength",
                    datatypeId: "xsd:decimal",
                  },
                ],
              },
              association: {
                sourceRole: "parent",
                targetRole: "child",
                sourceCardinality: "0..*",
                targetCardinality: "1",
                attributes: [
                  {
                    id: "assoc-attr-evidence",
                    name: "evidenceLevel",
                    datatypeId: "string",
                  },
                ],
              },
            },
          },
        } as any,
      ],
    },
    {
      id: "def-target",
      title: "Target",
      description: "Target definition",
      content: "",
      example: "",
      status: "draft",
      priority: "normal",
      tags: [],
      updatedAt: "2026-03-20T10:00:00.000Z",
      viewCount: 0,
      metadata: {
        iri: "https://example.com/model#Target",
      },
      relationships: [],
    },
  ],
};

const exportClient = { __brand: "export-client" } as any;

function createImportFile(data: string | Blob, filename: string) {
  return {
    name: filename,
    text: async () => {
      if (typeof data === "string") {
        return data;
      }

      if (typeof data.text === "function") {
        return data.text();
      }

      return "";
    },
    arrayBuffer: async () => {
      if (typeof data === "string") {
        return new TextEncoder().encode(data).buffer;
      }

      if (typeof data.arrayBuffer === "function") {
        return data.arrayBuffer();
      }

      if (typeof FileReader !== "undefined") {
        return new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(data);
        });
      }

      if (typeof Response !== "undefined") {
        return new Response(data as Blob).arrayBuffer();
      }

      return data.arrayBuffer();
    },
  } as unknown as File;
}

describe("ExportFactory", () => {
  it("loads export snapshots through the guarded backend rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null });
    const client = { rpc } as any;

    const result = await fetchOntologyExportSnapshot(client, "onto-1");

    expect(rpc).toHaveBeenCalledWith("export_ontology_snapshot", { _ontology_id: "onto-1" });
    expect(result).toEqual(snapshot);
  });

  it("returns correctly typed export artifacts for every supported format", async () => {
    for (const exporter of ExportFactory.getAll()) {
      const result = await exporter.export(snapshot, exportClient);

      expect(result.success).toBe(true);
      expect(result.filename.endsWith(`.${exporter.extension}`)).toBe(true);
      expect(result.mimeType).toBe(exporter.mimeType);

      if (exporter.format === "excel") {
        expect(result.data).toBeInstanceOf(Blob);
      } else {
        expect(typeof result.data).toBe("string");
        expect(String(result.data)).toContain("Access Policy");
      }
    }
  });

  it("produces JSON-LD output with an @graph payload", async () => {
    const result = await ExportFactory.create("jsonld").export(snapshot, exportClient);

    expect(String(result.data)).toContain('"@graph"');
    expect(result.filename.endsWith(".jsonld")).toBe(true);
  });

  it("produces RDF/XML output with RDF markup", async () => {
    const result = await ExportFactory.create("rdfxml").export(snapshot, exportClient);

    expect(String(result.data)).toContain("<rdf:RDF");
    expect(result.filename.endsWith(".rdf")).toBe(true);
  });

  it("exports JSON-LD from canonical concept data with preserved IRIs and concept-scheme structure", async () => {
    const result = await ExportFactory.create("jsonld").export(semanticSnapshot, exportClient);
    const payload = JSON.parse(String(result.data));
    const graph = payload["@graph"] as Array<Record<string, unknown>>;

    expect(graph).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@id": "https://ontologyhub.local/ontologies/onto-1",
          "@type": "skos:ConceptScheme",
        }),
        expect.objectContaining({
          "@id": "https://example.com/security#AccessPolicy",
          "@type": "skos:Concept",
          "skos:prefLabel": "Access Policy",
          "skos:definition": "Policy definition",
          "skos:inScheme": { "@id": "https://ontologyhub.local/ontologies/onto-1" },
          "skos:broader": [{ "@id": "https://example.com/security#ControlSet" }],
          "onto:namespace": "security",
          "onto:section": "governance",
          "onto:group": "policies",
        }),
      ]),
    );
    expect(String(result.data)).not.toContain("https://ontologyhub.local/ontologies/onto-1/definitions/def-1");
  });

  it("exports N-Triples with canonical concept IRIs and standards-aligned predicates", async () => {
    const result = await ExportFactory.create("ntriples").export(semanticSnapshot, exportClient);
    const data = String(result.data);

    expect(data).toContain(
      '<https://example.com/security#AccessPolicy> <http://www.w3.org/2004/02/skos/core#broader> <https://example.com/security#ControlSet> .',
    );
    expect(data).toContain(
      '<https://example.com/security#AccessPolicy> <http://www.w3.org/2004/02/skos/core#inScheme> <https://ontologyhub.local/ontologies/onto-1> .',
    );
    expect(data).not.toContain("https://ontologyhub.local/ontologies/onto-1/definitions/def-1");
  });

  it("exports SKOS with preserved concept metadata and scheme membership", async () => {
    const result = await ExportFactory.create("skos").export(semanticSnapshot, exportClient);
    const data = String(result.data);

    expect(data).toContain("<https://ontologyhub.local/ontologies/onto-1>");
    expect(data).toContain("a skos:ConceptScheme");
    expect(data).toContain('<https://example.com/security#AccessPolicy>');
    expect(data).toContain('a skos:Concept');
    expect(data).toContain('skos:broader <https://example.com/security#ControlSet>');
    expect(data).toContain('skos:inScheme <https://ontologyhub.local/ontologies/onto-1>');
    expect(data).toContain('onto:namespace "security" ;');
  });

  it("round-trips every supported export format back through the matching importer", async () => {
    for (const exporter of ExportFactory.getAll()) {
      const exported = await exporter.export(snapshot, exportClient);
      const importFile = createImportFile(exported.data, exported.filename);
      const importer = ImportFactory.createFromFile(importFile);
      const bundle = await importer.parse(importFile);

      expect(bundle.rows.length).toBeGreaterThanOrEqual(snapshot.definitions.length);
      expect(bundle.rows.map((row) => row.title)).toEqual(
        expect.arrayContaining(snapshot.definitions.map((definition) => definition.title)),
      );
    }
  });

  it("round-trips exported CSV relationships back into importable relationship rows", async () => {
    const exported = await ExportFactory.create("csv").export(snapshot, exportClient);
    const importFile = createImportFile(String(exported.data), exported.filename);
    const bundle = await ImportFactory.createFromFile(importFile).parse(importFile);

    expect(bundle.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRef: "def-1",
          targetRef: "Control Set",
          label: "governs",
        }),
      ]),
    );
  });

  it("round-trips exported Excel relationships back into importable relationship rows", async () => {
    const exported = await ExportFactory.create("excel").export(snapshot, exportClient);
    const importFile = createImportFile(exported.data as Blob, exported.filename);
    const bundle = await ImportFactory.createFromFile(importFile).parse(importFile);

    expect(bundle.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRef: "def-1",
          targetRef: "Control Set",
          label: "governs",
        }),
      ]),
    );
  });

  it("exports structured definition and relationship metadata without silently dropping attributes", async () => {
    const result = await ExportFactory.create("csv").export(structuredMetadataSnapshot, exportClient);
    const csv = String(result.data);

    expect(csv).toContain("metadata");
    expect(csv).toContain("related_relationships_metadata");
    expect(csv).toContain("attr-code");
    expect(csv).toContain("rel-attr-strength");
    expect(csv).toContain("assoc-attr-evidence");
  });

  it("preserves standards-aligned predicate semantics in JSON-LD when relationship metadata provides predicate IRI", async () => {
    const result = await ExportFactory.create("jsonld").export(structuredMetadataSnapshot, exportClient);
    const payload = JSON.parse(String(result.data));
    const graph = payload["@graph"] as Array<Record<string, unknown>>;
    const sourceEntry = graph.find((entry) => entry["@id"] === "https://example.com/model#Source");

    expect(sourceEntry).toBeDefined();
    expect(sourceEntry).toMatchObject({
      "skos:broader": [{ "@id": "https://example.com/model#Target" }],
    });
  });

  it("surfaces standards validation issues as non-blocking export warnings", async () => {
    const invalidSnapshot: OntologyExportSnapshot = {
      ontology: {
        id: "onto-invalid",
        title: "Invalid Ontology",
        description: "",
        status: "draft",
        tags: [],
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      definitions: [
        {
          id: "def-invalid",
          title: "Invalid",
          description: "Invalid IRI definition",
          content: "",
          example: "",
          status: "draft",
          priority: "normal",
          tags: [],
          updatedAt: "2026-03-20T10:00:00.000Z",
          viewCount: 0,
          metadata: {
            iri: "not-a-valid-iri",
          },
          relationships: [],
        },
      ],
    };

    const result = await ExportFactory.create("jsonld").export(invalidSnapshot, exportClient);

    expect(result.success).toBe(true);
    expect((result as any).warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/standards validation/i),
      ]),
    );
    expect((result as any).standardsFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "nl-sbb",
          ruleId: "nl_sbb_invalid_concept_iri",
        }),
      ]),
    );
  });

  it("fails the export when a configured blocking standards finding is present", async () => {
    fetchStandardsRuntimeSettings.mockResolvedValueOnce({
      enabledStandards: ["rdf"],
      ruleOverrides: {
        rdf_invalid_subject_iri: "blocking",
      },
    });

    const invalidSnapshot: OntologyExportSnapshot = {
      ontology: {
        id: "onto-invalid",
        title: "Invalid Ontology",
        description: "",
        status: "draft",
        tags: [],
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      definitions: [
        {
          id: "def-invalid",
          title: "Invalid",
          description: "Invalid IRI definition",
          content: "",
          example: "",
          status: "draft",
          priority: "normal",
          tags: [],
          updatedAt: "2026-03-20T10:00:00.000Z",
          viewCount: 0,
          metadata: {
            iri: "not-a-valid-iri",
          },
          relationships: [],
        },
      ],
    };

    await expect(ExportFactory.create("jsonld").export(invalidSnapshot, exportClient)).rejects.toThrow(
      /blocking standards compliance issue/i,
    );
  });

  it("fetches export standards settings through the injected client", async () => {
    fetchStandardsRuntimeSettings.mockClear();

    await ExportFactory.create("jsonld").export(snapshot, exportClient);

    expect(fetchStandardsRuntimeSettings).toHaveBeenCalledWith(exportClient);
  });
});
