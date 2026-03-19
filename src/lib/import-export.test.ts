import { describe, expect, it } from "vitest";

import { ExportFactory, type OntologyExportSnapshot } from "@/lib/import-export";
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
