import { utils, write } from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { getRelationshipDisplayLabel } from "@/lib/relationship-service";
import type { StandardsFinding } from "@/lib/standards/engine/types";
import { mapOntologyToStandardsModel } from "@/lib/standards/mappers/ontology-to-standards";
import type {
  StandardsConcept,
  StandardsConceptRelation,
  StandardsConceptScheme,
  StandardsLiteralTerm,
  StandardsModel,
  StandardsObjectTerm,
  StandardsResourceTerm,
  StandardsTriple,
} from "@/lib/standards/model";
import {
  evaluateStandardsModelCompliance,
  formatStandardsFindingsAsWarnings,
} from "@/lib/standards/compliance";
import { fetchStandardsRuntimeSettings } from "@/lib/standards/settings-service";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ExportableRelationship {
  id: string;
  type: string;
  label?: string | null;
  metadata?: Json;
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
  metadata?: Json;
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
  warnings: string[];
  standardsFindings: StandardsFinding[];
}

export interface Exporter {
  format: string;
  label: string;
  extension: string;
  mimeType: string;
  export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult>;
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

function readStringMetadata(value: Json | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function mapSnapshotToStandardsModel(snapshot: OntologyExportSnapshot): StandardsModel {
  return mapOntologyToStandardsModel({
    ontologyId: snapshot.ontology.id,
    ontologyTitle: snapshot.ontology.title,
    definitions: snapshot.definitions.map((definition) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      content: definition.content,
      example: definition.example,
      status: definition.status,
      metadata: definition.metadata,
      relationships: definition.relationships.map((relationship) => ({
        id: relationship.id,
        source_id: definition.id,
        target_id: relationship.targetId,
        type: relationship.type,
        label: relationship.label,
        metadata: relationship.metadata,
      })),
    })),
  });
}

async function buildStandardsExportWarnings(
  client: AppSupabaseClient,
  snapshot: OntologyExportSnapshot,
  model: StandardsModel,
) {
  const canonicalTripleModel: StandardsModel = {
    ...model,
    triples: [
      ...model.triples,
      ...mapCanonicalTriplesToStandardsTriples(buildCanonicalTriples(snapshot, model)),
    ],
  };
  const settings = await fetchStandardsRuntimeSettings(client);
  const compliance = evaluateStandardsModelCompliance(canonicalTripleModel, settings);

  if (compliance.hasBlockingFindings) {
    throw new Error("Export blocked by a blocking standards compliance issue.");
  }

  return {
    warnings: formatStandardsFindingsAsWarnings(compliance),
    findings: compliance.findings,
  };
}

interface CanonicalExportTriple {
  subject: StandardsResourceTerm;
  predicate: string;
  object: StandardsObjectTerm;
}

function mapCanonicalTriplesToStandardsTriples(triples: CanonicalExportTriple[]): StandardsTriple[] {
  return triples.map((triple, index) => ({
    id: `canonical-export-triple-${index + 1}`,
    subject: triple.subject,
    predicate: {
      termType: "iri",
      value: triple.predicate,
    },
    object: triple.object,
  }));
}

function getSchemeIri(snapshot: OntologyExportSnapshot, scheme: StandardsConceptScheme) {
  return scheme.iri?.trim() || ontologyUri(snapshot);
}

function getConceptIri(snapshot: OntologyExportSnapshot, concept: StandardsConcept) {
  return concept.iri?.trim() || definitionUri(snapshot, concept.id);
}

function buildCanonicalTripleKey(triple: CanonicalExportTriple) {
  const objectKey = triple.object.termType === "literal"
    ? `literal:${triple.object.value}:${triple.object.language || ""}:${triple.object.datatypeIri || ""}`
    : `${triple.object.termType}:${triple.object.value}`;

  return `${triple.subject.termType}:${triple.subject.value}|${triple.predicate}|${objectKey}`;
}

function pushCanonicalTriple(target: CanonicalExportTriple[], seen: Set<string>, triple: CanonicalExportTriple) {
  const key = buildCanonicalTripleKey(triple);

  if (!seen.has(key)) {
    seen.add(key);
    target.push(triple);
  }
}

function buildCanonicalTriples(snapshot: OntologyExportSnapshot, model: StandardsModel): CanonicalExportTriple[] {
  const triples: CanonicalExportTriple[] = [];
  const seen = new Set<string>();
  const schemeIriById = new Map(model.conceptSchemes.map((scheme) => [scheme.id, getSchemeIri(snapshot, scheme)]));
  const conceptById = new Map(model.concepts.map((concept) => [concept.id, concept]));

  for (const scheme of model.conceptSchemes) {
    const subject: StandardsResourceTerm = {
      termType: "iri",
      value: getSchemeIri(snapshot, scheme),
    };

    pushCanonicalTriple(triples, seen, {
      subject,
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      object: {
        termType: "iri",
        value: "http://www.w3.org/2004/02/skos/core#ConceptScheme",
      },
    });
    pushCanonicalTriple(triples, seen, {
      subject,
      predicate: "http://www.w3.org/2004/02/skos/core#prefLabel",
      object: {
        termType: "literal",
        value: scheme.label,
      },
    });

    if (scheme.definition) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "http://www.w3.org/2004/02/skos/core#definition",
        object: {
          termType: "literal",
          value: scheme.definition,
        },
      });
    }
  }

  for (const concept of model.concepts) {
    const subject: StandardsResourceTerm = {
      termType: "iri",
      value: getConceptIri(snapshot, concept),
    };
    const schemeIri = schemeIriById.get(concept.schemeId) || ontologyUri(snapshot);

    pushCanonicalTriple(triples, seen, {
      subject,
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      object: {
        termType: "iri",
        value: "http://www.w3.org/2004/02/skos/core#Concept",
      },
    });
    pushCanonicalTriple(triples, seen, {
      subject,
      predicate: "http://www.w3.org/2004/02/skos/core#inScheme",
      object: {
        termType: "iri",
        value: schemeIri,
      },
    });
    pushCanonicalTriple(triples, seen, {
      subject,
      predicate: "http://www.w3.org/2004/02/skos/core#prefLabel",
      object: {
        termType: "literal",
        value: concept.prefLabel,
      },
    });

    for (const altLabel of concept.altLabels || []) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "http://www.w3.org/2004/02/skos/core#altLabel",
        object: {
          termType: "literal",
          value: altLabel,
        },
      });
    }

    if (concept.definition) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "http://www.w3.org/2004/02/skos/core#definition",
        object: {
          termType: "literal",
          value: concept.definition,
        },
      });
    }

    if (concept.scopeNote) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "http://www.w3.org/2004/02/skos/core#scopeNote",
        object: {
          termType: "literal",
          value: concept.scopeNote,
        },
      });
    }

    if (concept.example) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "http://www.w3.org/2004/02/skos/core#example",
        object: {
          termType: "literal",
          value: concept.example,
        },
      });
    }

    if (concept.status) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "https://ontologyhub.local/schema#status",
        object: {
          termType: "literal",
          value: concept.status,
        },
      });
    }

    if (concept.namespace) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "https://ontologyhub.local/schema#namespace",
        object: {
          termType: "literal",
          value: concept.namespace,
        },
      });
    }

    if (concept.section) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "https://ontologyhub.local/schema#section",
        object: {
          termType: "literal",
          value: concept.section,
        },
      });
    }

    if (concept.group) {
      pushCanonicalTriple(triples, seen, {
        subject,
        predicate: "https://ontologyhub.local/schema#group",
        object: {
          termType: "literal",
          value: concept.group,
        },
      });
    }
  }

  for (const relation of model.conceptRelations) {
    const sourceConcept = conceptById.get(relation.sourceConceptId);
    const targetConcept = conceptById.get(relation.targetConceptId);

    if (!sourceConcept || !targetConcept) {
      continue;
    }

    pushCanonicalTriple(triples, seen, {
      subject: {
        termType: "iri",
        value: getConceptIri(snapshot, sourceConcept),
      },
      predicate: relation.predicateIri || "http://www.w3.org/2004/02/skos/core#related",
      object: {
        termType: "iri",
        value: getConceptIri(snapshot, targetConcept),
      },
    });
  }

  for (const triple of model.triples) {
    pushCanonicalTriple(triples, seen, {
      subject: triple.subject,
      predicate: triple.predicate.value,
      object: triple.object,
    });
  }

  return triples;
}

const namespacePrefixes = [
  ["rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs", "http://www.w3.org/2000/01/rdf-schema#"],
  ["owl", "http://www.w3.org/2002/07/owl#"],
  ["skos", "http://www.w3.org/2004/02/skos/core#"],
  ["onto", "https://ontologyhub.local/schema#"],
] as const;

function compactIri(value: string) {
  if (value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") {
    return "a";
  }

  for (const [prefix, namespace] of namespacePrefixes) {
    if (value.startsWith(namespace)) {
      return `${prefix}:${value.slice(namespace.length)}`;
    }
  }

  return `<${value}>`;
}

function serializeNTriplesTerm(term: StandardsResourceTerm | StandardsLiteralTerm) {
  if (term.termType === "iri") {
    return `<${term.value}>`;
  }

  if (term.termType === "blank-node") {
    return term.value;
  }

  const escaped = `"${escapeLiteral(term.value)}"`;

  if (term.language) {
    return `${escaped}@${term.language}`;
  }

  if (term.datatypeIri) {
    return `${escaped}^^<${term.datatypeIri}>`;
  }

  return escaped;
}

function serializeTurtleTerm(term: StandardsResourceTerm | StandardsLiteralTerm) {
  if (term.termType === "iri") {
    return compactIri(term.value);
  }

  if (term.termType === "blank-node") {
    return term.value;
  }

  return serializeNTriplesTerm(term);
}

function serializeNTriples(triples: CanonicalExportTriple[]) {
  return triples
    .map((triple) => `${serializeNTriplesTerm(triple.subject)} <${triple.predicate}> ${serializeNTriplesTerm(triple.object)} .`)
    .join("\n");
}

function serializeTurtle(triples: CanonicalExportTriple[]) {
  const grouped = new Map<string, CanonicalExportTriple[]>();

  for (const triple of triples) {
    const key = serializeNTriplesTerm(triple.subject);
    const bucket = grouped.get(key) || [];
    bucket.push(triple);
    grouped.set(key, bucket);
  }

  const prefixBlock = namespacePrefixes
    .map(([prefix, namespace]) => `@prefix ${prefix}: <${namespace}> .`)
    .join("\n");
  const subjectBlocks = Array.from(grouped.entries()).map(([subject, subjectTriples]) => {
    const predicateGroups = new Map<string, string[]>();

    for (const triple of subjectTriples) {
      const predicate = compactIri(triple.predicate);
      const object = serializeTurtleTerm(triple.object);
      const values = predicateGroups.get(predicate) || [];
      values.push(object);
      predicateGroups.set(predicate, values);
    }

    const predicateLines = Array.from(predicateGroups.entries()).map(([predicate, objects]) => `  ${predicate} ${objects.join(", ")}`);

    return `${subject} ${predicateLines.join(" ;\n")} .`;
  });

  return `${prefixBlock}\n\n${subjectBlocks.join("\n\n")}`;
}

function serializeRdfXml(triples: CanonicalExportTriple[]) {
  const grouped = new Map<string, CanonicalExportTriple[]>();

  for (const triple of triples) {
    const key = triple.subject.value;
    const bucket = grouped.get(key) || [];
    bucket.push(triple);
    grouped.set(key, bucket);
  }

  const body = Array.from(grouped.entries()).map(([subject, subjectTriples]) => {
    const typeTriple = subjectTriples.find((triple) => triple.predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" && triple.object.termType === "iri");
    const typedName = typeTriple?.object.termType === "iri" ? compactIri(typeTriple.object.value) : null;
    const elementName = typedName && typedName !== "a" ? typedName : "rdf:Description";
    const propertyTriples = subjectTriples.filter((triple) => triple !== typeTriple);
    const propertyXml = propertyTriples.map((triple) => {
      const predicateName = compactIri(triple.predicate);

      if (triple.object.termType === "iri" || triple.object.termType === "blank-node") {
        return `    <${predicateName} rdf:resource="${escapeXml(triple.object.value)}" />`;
      }

      return `    <${predicateName}>${escapeXml(triple.object.value)}</${predicateName}>`;
    }).join("\n");

    return [
      `  <${elementName} rdf:about="${escapeXml(subject)}">`,
      propertyXml,
      `  </${elementName}>`,
    ].filter(Boolean).join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF ${namespacePrefixes.map(([prefix, namespace]) => `xmlns:${prefix}="${namespace}"`).join(" ")}>\n${body}\n</rdf:RDF>`;
}

function buildJsonLdGraph(snapshot: OntologyExportSnapshot, model: StandardsModel) {
  const schemeIriById = new Map(model.conceptSchemes.map((scheme) => [scheme.id, getSchemeIri(snapshot, scheme)]));
  const conceptById = new Map(model.concepts.map((concept) => [concept.id, concept]));
  const relationGroups = new Map<string, StandardsConceptRelation[]>();

  for (const relation of model.conceptRelations) {
    const bucket = relationGroups.get(relation.sourceConceptId) || [];
    bucket.push(relation);
    relationGroups.set(relation.sourceConceptId, bucket);
  }

  const graph: Array<Record<string, unknown>> = model.conceptSchemes.map((scheme) => ({
    "@id": getSchemeIri(snapshot, scheme),
    "@type": "skos:ConceptScheme",
    "skos:prefLabel": scheme.label,
    ...(scheme.definition ? { "skos:definition": scheme.definition } : {}),
    ...(scheme.status ? { "onto:status": scheme.status } : {}),
  }));

  for (const concept of model.concepts) {
    const conceptIri = getConceptIri(snapshot, concept);
    const entry: Record<string, unknown> = {
      "@id": conceptIri,
      "@type": "skos:Concept",
      "skos:prefLabel": concept.prefLabel,
      "skos:inScheme": { "@id": schemeIriById.get(concept.schemeId) || ontologyUri(snapshot) },
      ...(concept.definition ? { "skos:definition": concept.definition } : {}),
      ...(concept.scopeNote ? { "skos:scopeNote": concept.scopeNote } : {}),
      ...(concept.example ? { "skos:example": concept.example } : {}),
      ...(concept.altLabels?.length ? { "skos:altLabel": concept.altLabels } : {}),
      ...(concept.status ? { "onto:status": concept.status } : {}),
      ...(concept.namespace ? { "onto:namespace": concept.namespace } : {}),
      ...(concept.section ? { "onto:section": concept.section } : {}),
      ...(concept.group ? { "onto:group": concept.group } : {}),
    };

    for (const relation of relationGroups.get(concept.id) || []) {
      const targetConcept = conceptById.get(relation.targetConceptId);

      if (!targetConcept) {
        continue;
      }

      const key = compactIri(relation.predicateIri || "http://www.w3.org/2004/02/skos/core#related");
      const existing = entry[key];
      const target = { "@id": getConceptIri(snapshot, targetConcept) };

      if (!existing) {
        entry[key] = [target];
      } else if (Array.isArray(existing)) {
        existing.push(target);
      }
    }

    graph.push(entry);
  }

  return graph;
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
    metadata: JSON.stringify(definition.metadata || {}),
    related_relationships_metadata: JSON.stringify(
      definition.relationships.map((relationship) => ({
        targetRef: relationship.targetTitle,
        targetId: relationship.targetId,
        type: relationship.type,
        label: relationship.label || undefined,
        metadata: relationship.metadata || undefined,
      })),
    ),
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
  warnings: string[] = [],
  standardsFindings: StandardsFinding[] = [],
): ExportResult {
  return {
    success: true,
    data,
    filename: buildFilename(snapshot, exporter.extension),
    mimeType: exporter.mimeType,
    extension: exporter.extension,
    warnings,
    standardsFindings,
  };
}

export async function fetchOntologyExportSnapshot(client: AppSupabaseClient, ontologyId: string): Promise<OntologyExportSnapshot> {
  const { data, error } = await client.rpc("export_ontology_snapshot", {
    _ontology_id: ontologyId,
  });

  if (error) {
    throw error;
  }

  return data as unknown as OntologyExportSnapshot;
}

class CSVExporter implements Exporter {
  format = "csv";
  label = "CSV";
  extension = "csv";
  mimeType = "text/csv;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
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
      metadata: "",
      related_relationships_metadata: "",
      updated_at: "",
      view_count: "",
    });
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsv((row as Record<string, unknown>)[header])).join(",")),
    ].join("\n");

    return createStringResult(snapshot, this, csv, standardsValidation.warnings, standardsValidation.findings);
  }
}

class ExcelExporter implements Exporter {
  format = "excel";
  label = "Excel";
  extension = "xlsx";
  mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
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
      warnings: standardsValidation.warnings,
      standardsFindings: standardsValidation.findings,
    };
  }
}

class TurtleExporter implements Exporter {
  format = "turtle";
  label = "Turtle";
  extension = "ttl";
  mimeType = "text/turtle;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const triples = buildCanonicalTriples(snapshot, standardsModel);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    return createStringResult(snapshot, this, serializeTurtle(triples), standardsValidation.warnings, standardsValidation.findings);
  }
}

class JsonLdExporter implements Exporter {
  format = "jsonld";
  label = "JSON-LD";
  extension = "jsonld";
  mimeType = "application/ld+json";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const graph = buildJsonLdGraph(snapshot, standardsModel);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);

    return createStringResult(
      snapshot,
      this,
      JSON.stringify(
        {
          "@context": {
            onto: "https://ontologyhub.local/schema#",
            owl: "http://www.w3.org/2002/07/owl#",
            rdfs: "http://www.w3.org/2000/01/rdf-schema#",
            skos: "http://www.w3.org/2004/02/skos/core#",
          },
          "@graph": graph,
        },
        null,
        2,
      ),
      standardsValidation.warnings,
      standardsValidation.findings,
    );
  }
}

class NTriplesExporter implements Exporter {
  format = "ntriples";
  label = "N-Triples";
  extension = "nt";
  mimeType = "application/n-triples;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    return createStringResult(
      snapshot,
      this,
      serializeNTriples(buildCanonicalTriples(snapshot, standardsModel)),
      standardsValidation.warnings,
      standardsValidation.findings,
    );
  }
}

class RdfXmlExporter implements Exporter {
  format = "rdfxml";
  label = "RDF/XML";
  extension = "rdf";
  mimeType = "application/rdf+xml";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    return createStringResult(
      snapshot,
      this,
      serializeRdfXml(buildCanonicalTriples(snapshot, standardsModel)),
      standardsValidation.warnings,
      standardsValidation.findings,
    );
  }
}

class OwlExporter implements Exporter {
  format = "owl";
  label = "OWL RDF";
  extension = "owl.rdf";
  mimeType = "application/rdf+xml";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    const body = standardsModel.concepts
      .map((concept) => [
        `  <owl:Class rdf:about="${escapeXml(getConceptIri(snapshot, concept))}">`,
        `    <rdfs:label>${escapeXml(concept.prefLabel)}</rdfs:label>`,
        ...(concept.definition ? [`    <rdfs:comment>${escapeXml(concept.definition)}</rdfs:comment>`] : []),
        "  </owl:Class>",
      ].join("\n"))
      .join("\n");

    return createStringResult(
      snapshot,
      this,
      `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:owl="http://www.w3.org/2002/07/owl#">\n  <owl:Ontology rdf:about="${escapeXml(ontologyUri(snapshot))}">\n    <rdfs:label>${escapeXml(snapshot.ontology.title)}</rdfs:label>\n  </owl:Ontology>\n${body}\n</rdf:RDF>`,
      standardsValidation.warnings,
      standardsValidation.findings,
    );
  }
}

class SkosExporter implements Exporter {
  format = "skos";
  label = "SKOS";
  extension = "skos.ttl";
  mimeType = "text/turtle;charset=utf-8";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    return createStringResult(
      snapshot,
      this,
      serializeTurtle(buildCanonicalTriples(snapshot, standardsModel)),
      standardsValidation.warnings,
      standardsValidation.findings,
    );
  }
}

class XmiExporter implements Exporter {
  format = "xmi";
  label = "XMI";
  extension = "xmi";
  mimeType = "application/xml";

  async export(snapshot: OntologyExportSnapshot, client: AppSupabaseClient): Promise<ExportResult> {
    const standardsModel = mapSnapshotToStandardsModel(snapshot);
    const standardsValidation = await buildStandardsExportWarnings(client, snapshot, standardsModel);
    const classes = standardsModel.concepts
      .map(
        (concept) =>
          `    <packagedElement xmi:type="uml:Class" xmi:id="${escapeXml(concept.id)}" name="${escapeXml(concept.prefLabel)}">\n      <ownedComment body="${escapeXml(concept.definition || "")}" />\n    </packagedElement>`,
      )
      .join("\n");
    const associations = standardsModel.conceptRelations
      .map(
        (relation) =>
          `    <packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(relation.id)}" name="${escapeXml(relation.label || relation.kind)}" memberEnd="${escapeXml(relation.sourceConceptId)} ${escapeXml(relation.targetConceptId)}" />`,
      )
      .join("\n");

    return createStringResult(
      snapshot,
      this,
      `<?xml version="1.0" encoding="UTF-8"?>\n<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20161101">\n  <uml:Model xmi:id="${escapeXml(snapshot.ontology.id)}" name="${escapeXml(snapshot.ontology.title)}">\n${classes}\n${associations}\n  </uml:Model>\n</xmi:XMI>`,
      standardsValidation.warnings,
      standardsValidation.findings,
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
