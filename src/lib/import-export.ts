import { utils, write } from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { getRelationshipDisplayLabel } from "@/lib/relationship-service";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ExportableRelationship {
  id: string;
  type: string;
  label?: string | null;
  targetId: string;
  targetTitle: string;
}

export interface ExportableDefinition {
  id: string;
  title: string;
  description: string;
  content: string;
  example: string;
  status: string;
  priority: string;
  tags: string[];
  updatedAt: string;
  viewCount: number;
  relationships: ExportableRelationship[];
}

export interface OntologyExportSnapshot {
  ontology: {
    id: string;
    title: string;
    description: string;
    status: string;
    tags: string[];
    updatedAt: string;
  };
  definitions: ExportableDefinition[];
}

export interface ExportResult {
  success: boolean;
  data: string | Blob;
  filename: string;
  mimeType: string;
  extension: string;
}

export interface Exporter {
  format: string;
  label: string;
  extension: string;
  mimeType: string;
  export(snapshot: OntologyExportSnapshot): Promise<ExportResult>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "ontology-export";
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function definitionUri(snapshot: OntologyExportSnapshot, definitionId: string) {
  return `https://ontologyhub.local/ontologies/${snapshot.ontology.id}/definitions/${definitionId}`;
}

function ontologyUri(snapshot: OntologyExportSnapshot) {
  return `https://ontologyhub.local/ontologies/${snapshot.ontology.id}`;
}

function mapDefinitionsToRows(snapshot: OntologyExportSnapshot) {
  return snapshot.definitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    context: definition.content,
    example: definition.example,
    status: definition.status,
    priority: definition.priority,
    tags: definition.tags.join("|"),
    related_definitions: definition.relationships.map((relationship) => relationship.targetTitle).join(" | "),
    related_relationships: definition.relationships
      .map((relationship) => `${getRelationshipDisplayLabel(relationship.type, relationship.label)} -> ${relationship.targetTitle}`)
      .join(" | "),
    updated_at: definition.updatedAt,
    view_count: definition.viewCount,
  }));
}

function buildFilename(snapshot: OntologyExportSnapshot, extension: string) {
  return `${slugify(snapshot.ontology.title)}.${extension}`;
}

function createStringResult(
  snapshot: OntologyExportSnapshot,
  exporter: Pick<Exporter, "extension" | "mimeType">,
  data: string,
): ExportResult {
  return {
    success: true,
    data,
    filename: buildFilename(snapshot, exporter.extension),
    mimeType: exporter.mimeType,
    extension: exporter.extension,
  };
}

export async function fetchOntologyExportSnapshot(client: AppSupabaseClient, ontologyId: string): Promise<OntologyExportSnapshot> {
  const [ontologyRes, definitionsRes] = await Promise.all([
    client.from("ontologies").select("*").eq("id", ontologyId).single(),
    client
      .from("definitions")
      .select("id, title, description, content, example, status, priority, tags, updated_at, view_count, relationships!relationships_source_id_fkey(id, type, label, target:target_id(id, title))")
      .eq("ontology_id", ontologyId)
      .eq("is_deleted", false)
      .order("title", { ascending: true }),
  ]);

  if (ontologyRes.error) {
    throw ontologyRes.error;
  }

  if (definitionsRes.error) {
    throw definitionsRes.error;
  }

  return {
    ontology: {
      id: ontologyRes.data.id,
      title: ontologyRes.data.title,
      description: ontologyRes.data.description || "",
      status: ontologyRes.data.status || "draft",
      tags: ontologyRes.data.tags || [],
      updatedAt: ontologyRes.data.updated_at,
    },
    definitions: (definitionsRes.data || []).map((definition: any) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description || "",
      content: definition.content || "",
      example: definition.example || "",
      status: definition.status || "draft",
      priority: definition.priority || "normal",
      tags: definition.tags || [],
      updatedAt: definition.updated_at,
      viewCount: definition.view_count || 0,
      relationships: (definition.relationships || []).map((relationship: any) => ({
        id: relationship.id,
        type: relationship.type,
        label: relationship.label,
        targetId: relationship.target?.id || "",
        targetTitle: relationship.target?.title || "Unknown definition",
      })),
    })),
  };
}

class CSVExporter implements Exporter {
  format = "csv";
  label = "CSV";
  extension = "csv";
  mimeType = "text/csv;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const rows = mapDefinitionsToRows(snapshot);
    const headers = Object.keys(rows[0] || {
      id: "",
      title: "",
      description: "",
      context: "",
      example: "",
      status: "",
      priority: "",
      tags: "",
      related_definitions: "",
      related_relationships: "",
      updated_at: "",
      view_count: "",
    });
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsv((row as Record<string, unknown>)[header])).join(",")),
    ].join("\n");

    return createStringResult(snapshot, this, csv);
  }
}

class ExcelExporter implements Exporter {
  format = "excel";
  label = "Excel";
  extension = "xlsx";
  mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const workbook = utils.book_new();
    const definitionsSheet = utils.json_to_sheet(mapDefinitionsToRows(snapshot));
    const ontologySheet = utils.json_to_sheet([
      {
        id: snapshot.ontology.id,
        title: snapshot.ontology.title,
        description: snapshot.ontology.description,
        status: snapshot.ontology.status,
        tags: snapshot.ontology.tags.join("|"),
        updated_at: snapshot.ontology.updatedAt,
      },
    ]);

    utils.book_append_sheet(workbook, ontologySheet, "Ontology");
    utils.book_append_sheet(workbook, definitionsSheet, "Definitions");

    const bytes = write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: this.mimeType });

    return {
      success: true,
      data: blob,
      filename: buildFilename(snapshot, this.extension),
      mimeType: this.mimeType,
      extension: this.extension,
    };
  }
}

class TurtleExporter implements Exporter {
  format = "turtle";
  label = "Turtle";
  extension = "ttl";
  mimeType = "text/turtle;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const prefixes = [
      "@prefix onto: <https://ontologyhub.local/schema#> .",
      "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
      "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
      "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
      "",
    ].join("\n");

    const ontologyBlock = `<${ontologyUri(snapshot)}> a owl:Ontology ;\n  rdfs:label "${escapeLiteral(snapshot.ontology.title)}" ;\n  rdfs:comment "${escapeLiteral(snapshot.ontology.description)}" .`;
    const definitionBlocks = snapshot.definitions.map((definition) => {
      const relationLines = definition.relationships
        .map((relationship) => `  onto:relatedDefinition <${definitionUri(snapshot, relationship.targetId)}> ;`)
        .join("\n");

      return [
        `<${definitionUri(snapshot, definition.id)}> a onto:Definition ;`,
        `  rdfs:label "${escapeLiteral(definition.title)}" ;`,
        `  rdfs:comment "${escapeLiteral(definition.description)}" ;`,
        `  onto:context "${escapeLiteral(definition.content)}" ;`,
        `  onto:status "${escapeLiteral(definition.status)}" ;`,
        `  onto:priority "${escapeLiteral(definition.priority)}" ;`,
        relationLines,
        `  onto:inOntology <${ontologyUri(snapshot)}> .`,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return createStringResult(snapshot, this, `${prefixes}${ontologyBlock}\n\n${definitionBlocks.join("\n\n")}`);
  }
}

class JsonLdExporter implements Exporter {
  format = "jsonld";
  label = "JSON-LD";
  extension = "jsonld";
  mimeType = "application/ld+json";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const graph = [
      {
        "@id": ontologyUri(snapshot),
        "@type": "owl:Ontology",
        "rdfs:label": snapshot.ontology.title,
        "rdfs:comment": snapshot.ontology.description,
      },
      ...snapshot.definitions.map((definition) => ({
        "@id": definitionUri(snapshot, definition.id),
        "@type": "onto:Definition",
        "rdfs:label": definition.title,
        "rdfs:comment": definition.description,
        "onto:context": definition.content,
        "onto:priority": definition.priority,
        "onto:status": definition.status,
        "onto:tags": definition.tags,
        "onto:relatedDefinition": definition.relationships.map((relationship) => ({
          "@id": definitionUri(snapshot, relationship.targetId),
          "rdfs:label": relationship.targetTitle,
          "onto:relationshipType": getRelationshipDisplayLabel(relationship.type, relationship.label),
        })),
      })),
    ];

    return createStringResult(
      snapshot,
      this,
      JSON.stringify(
        {
          "@context": {
            onto: "https://ontologyhub.local/schema#",
            owl: "http://www.w3.org/2002/07/owl#",
            rdfs: "http://www.w3.org/2000/01/rdf-schema#",
          },
          "@graph": graph,
        },
        null,
        2,
      ),
    );
  }
}

class NTriplesExporter implements Exporter {
  format = "ntriples";
  label = "N-Triples";
  extension = "nt";
  mimeType = "application/n-triples;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const lines = snapshot.definitions.flatMap((definition) => {
      const subject = `<${definitionUri(snapshot, definition.id)}>`;
      return [
        `${subject} <http://www.w3.org/2000/01/rdf-schema#label> "${escapeLiteral(definition.title)}" .`,
        `${subject} <http://www.w3.org/2000/01/rdf-schema#comment> "${escapeLiteral(definition.description)}" .`,
        ...definition.relationships.map(
          (relationship) =>
            `${subject} <https://ontologyhub.local/schema#relatedDefinition> <${definitionUri(snapshot, relationship.targetId)}> .`,
        ),
      ];
    });

    return createStringResult(snapshot, this, lines.join("\n"));
  }
}

class RdfXmlExporter implements Exporter {
  format = "rdfxml";
  label = "RDF/XML";
  extension = "rdf";
  mimeType = "application/rdf+xml";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const body = snapshot.definitions
      .map((definition) => {
        const relationXml = definition.relationships
          .map(
            (relationship) =>
              `    <onto:relatedDefinition rdf:resource="${escapeXml(definitionUri(snapshot, relationship.targetId))}" />`,
          )
          .join("\n");

        return [
          `  <rdf:Description rdf:about="${escapeXml(definitionUri(snapshot, definition.id))}">`,
          `    <rdfs:label>${escapeXml(definition.title)}</rdfs:label>`,
          `    <rdfs:comment>${escapeXml(definition.description)}</rdfs:comment>`,
          `    <onto:context>${escapeXml(definition.content)}</onto:context>`,
          relationXml,
          "  </rdf:Description>",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    return createStringResult(
      snapshot,
      this,
      `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:onto="https://ontologyhub.local/schema#">\n${body}\n</rdf:RDF>`,
    );
  }
}

class OwlExporter implements Exporter {
  format = "owl";
  label = "OWL RDF";
  extension = "owl.rdf";
  mimeType = "application/rdf+xml";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const body = snapshot.definitions
      .map(
        (definition) => [
          `  <owl:Class rdf:about="${escapeXml(definitionUri(snapshot, definition.id))}">`,
          `    <rdfs:label>${escapeXml(definition.title)}</rdfs:label>`,
          `    <rdfs:comment>${escapeXml(definition.description)}</rdfs:comment>`,
          "  </owl:Class>",
        ].join("\n"),
      )
      .join("\n");

    return createStringResult(
      snapshot,
      this,
      `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:owl="http://www.w3.org/2002/07/owl#">\n  <owl:Ontology rdf:about="${escapeXml(ontologyUri(snapshot))}">\n    <rdfs:label>${escapeXml(snapshot.ontology.title)}</rdfs:label>\n  </owl:Ontology>\n${body}\n</rdf:RDF>`,
    );
  }
}

class SkosExporter implements Exporter {
  format = "skos";
  label = "SKOS";
  extension = "skos.ttl";
  mimeType = "text/turtle;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const conceptScheme = `<${ontologyUri(snapshot)}> a skos:ConceptScheme ;\n  skos:prefLabel "${escapeLiteral(snapshot.ontology.title)}" ;\n  skos:definition "${escapeLiteral(snapshot.ontology.description)}" .`;
    const concepts = snapshot.definitions.map((definition) => {
      const relationLines = definition.relationships
        .map((relationship) => {
          const predicate = relationship.type === "is_a" || relationship.type === "part_of" ? "skos:broader" : "skos:related";
          return `  ${predicate} <${definitionUri(snapshot, relationship.targetId)}> ;`;
        })
        .join("\n");

      return [
        `<${definitionUri(snapshot, definition.id)}> a skos:Concept ;`,
        `  skos:prefLabel "${escapeLiteral(definition.title)}" ;`,
        `  skos:definition "${escapeLiteral(definition.description)}" ;`,
        relationLines,
        `  skos:inScheme <${ontologyUri(snapshot)}> .`,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return createStringResult(
      snapshot,
      this,
      `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n\n${conceptScheme}\n\n${concepts.join("\n\n")}`,
    );
  }
}

class XmiExporter implements Exporter {
  format = "xmi";
  label = "XMI";
  extension = "xmi";
  mimeType = "application/xml";

  async export(snapshot: OntologyExportSnapshot): Promise<ExportResult> {
    const classes = snapshot.definitions
      .map(
        (definition) =>
          `    <packagedElement xmi:type="uml:Class" xmi:id="${escapeXml(definition.id)}" name="${escapeXml(definition.title)}">\n      <ownedComment body="${escapeXml(definition.description)}" />\n    </packagedElement>`,
      )
      .join("\n");
    const associations = snapshot.definitions
      .flatMap((definition) =>
        definition.relationships.map(
          (relationship) =>
            `    <packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(relationship.id)}" name="${escapeXml(getRelationshipDisplayLabel(relationship.type, relationship.label))}" memberEnd="${escapeXml(definition.id)} ${escapeXml(relationship.targetId)}" />`,
        ),
      )
      .join("\n");

    return createStringResult(
      snapshot,
      this,
      `<?xml version="1.0" encoding="UTF-8"?>\n<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20161101">\n  <uml:Model xmi:id="${escapeXml(snapshot.ontology.id)}" name="${escapeXml(snapshot.ontology.title)}">\n${classes}\n${associations}\n  </uml:Model>\n</xmi:XMI>`,
    );
  }
}

const exporters: Exporter[] = [
  new CSVExporter(),
  new ExcelExporter(),
  new TurtleExporter(),
  new JsonLdExporter(),
  new RdfXmlExporter(),
  new NTriplesExporter(),
  new OwlExporter(),
  new SkosExporter(),
  new XmiExporter(),
];

export class ExportFactory {
  static create(format: string): Exporter {
    const exporter = exporters.find((candidate) => candidate.format === format);

    if (!exporter) {
      throw new Error(`Unknown export format: ${format}`);
    }

    return exporter;
  }

  static getAll() {
    return exporters;
  }
}
