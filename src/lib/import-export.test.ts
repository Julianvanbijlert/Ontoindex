import { describe, expect, it, vi } from "vitest";

import { ExportFactory, fetchOntologyExportSnapshot, type OntologyExportSnapshot } from "@/lib/import-export";
import { ImportFactory } from "@/lib/import-factory";

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
      const result = await exporter.export(snapshot);

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
    const result = await ExportFactory.create("jsonld").export(snapshot);

    expect(String(result.data)).toContain('"@graph"');
    expect(result.filename.endsWith(".jsonld")).toBe(true);
  });

  it("produces RDF/XML output with RDF markup", async () => {
    const result = await ExportFactory.create("rdfxml").export(snapshot);

    expect(String(result.data)).toContain("<rdf:RDF");
    expect(result.filename.endsWith(".rdf")).toBe(true);
  });

  it("exports JSON-LD from canonical concept data with preserved IRIs and concept-scheme structure", async () => {
    const result = await ExportFactory.create("jsonld").export(semanticSnapshot);
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
    const result = await ExportFactory.create("ntriples").export(semanticSnapshot);
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
    const result = await ExportFactory.create("skos").export(semanticSnapshot);
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
      const exported = await exporter.export(snapshot);
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
    const exported = await ExportFactory.create("csv").export(snapshot);
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
    const exported = await ExportFactory.create("excel").export(snapshot);
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
});
