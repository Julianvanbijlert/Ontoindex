import { read, utils } from "xlsx";

import type { Enums, Json } from "@/integrations/supabase/types";
import { mapRdfTriplesToStandardsModel, type ImportedTriple } from "@/lib/standards/mappers/rdf-to-standards";
import { mapXmiToStandardsModel } from "@/lib/standards/mappers/xmi-to-standards";
import type { StandardsClass, StandardsConceptRelation, StandardsModel } from "@/lib/standards/model";
import { generateStandardsModelFromTypeScriptSource } from "@/lib/uml/typescript-uml-generator";

type PriorityLevel = Enums<"priority_level">;
type WorkflowStatus = Enums<"workflow_status">;

export interface ParsedImportRow {
  externalId: string;
  title: string;
  description: string;
  content: string;
  example: string;
  tags: string[];
  priority?: PriorityLevel;
  status?: WorkflowStatus;
  metadata?: Json;
}

export interface ParsedImportRelationship {
  sourceRef: string;
  targetRef: string;
  type: string;
  label?: string;
}

export interface ParsedImportBundle {
  rows: ParsedImportRow[];
  relationships: ParsedImportRelationship[];
  warnings: string[];
  standardsModel?: StandardsModel;
}

export interface Importer {
  format: string;
  label: string;
  extensions: string[];
  parse(file: File): Promise<ParsedImportBundle>;
}

export const supportedImportColumns = [
  "id",
  "title",
  "description",
  "content",
  "context",
  "example",
  "tags",
  "tag",
  "priority",
  "status",
  "related_definitions",
  "related_relationships",
];

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitTags(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof input !== "string") {
    return [];
  }

  return input
    .split(/[|,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizePriority(rawPriority: string) {
  const value = rawPriority.trim().toLowerCase();

  if (!value) {
    return { priority: undefined, warning: null };
  }

  if (["low", "normal", "high", "critical"].includes(value)) {
    return { priority: value as PriorityLevel, warning: null };
  }

  if (value === "medium") {
    return { priority: "normal" as const, warning: `normalized priority "${value}" to "normal".` };
  }

  return { priority: undefined, warning: `used unsupported priority "${value}" and defaulted to normal.` };
}

function normalizeStatus(rawStatus: string) {
  const value = rawStatus.trim().toLowerCase();

  if (!value) {
    return { status: undefined, warning: null };
  }

  const normalized = value.replace(/[\s-]+/g, "_");

  if (["draft", "in_review", "approved", "rejected", "archived"].includes(normalized)) {
    return {
      status: normalized as WorkflowStatus,
      warning: normalized === value ? null : `normalized status "${value}" to "${normalized.replace(/_/g, " ")}".`,
    };
  }

  return { status: undefined, warning: `used unsupported status "${value}" and defaulted to draft.` };
}

function validateRows(rows: ParsedImportRow[], warnings: string[]) {
  if (rows.length === 0) {
    throw new Error("No valid rows were found to import.");
  }

  return { rows, warnings };
}

function parseDelimitedValues(input: unknown) {
  if (typeof input !== "string") {
    return [];
  }

  return input
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildLayoutMetadata(input: {
  iri?: unknown;
  namespace?: unknown;
  section?: unknown;
  group?: unknown;
}) {
  const iri = readOptionalString(input.iri);
  const namespace = readOptionalString(input.namespace);
  const section = readOptionalString(input.section);
  const group = readOptionalString(input.group);

  if (!iri && !namespace && !section && !group) {
    return undefined;
  }

  return {
    ...(iri ? { iri } : {}),
    ...(namespace ? { namespace } : {}),
    ...(section ? { section } : {}),
    ...(group ? { group } : {}),
  } satisfies Record<string, string>;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRelationshipType(relation: StandardsConceptRelation) {
  if (relation.predicateKey?.trim()) {
    return relation.predicateKey.trim();
  }

  return relation.kind;
}

function buildClassRowMetadata(standardsModel: StandardsModel, item: StandardsClass): Json {
  const layout = buildLayoutMetadata({
    iri: item.iri,
  }) ?? {};
  const attributes = (item.attributes ?? []).map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    ...(attribute.label ? { label: attribute.label } : {}),
    ...(attribute.datatypeId ? { datatypeId: attribute.datatypeId } : {}),
    ...(attribute.cardinality ? { cardinality: attribute.cardinality } : {}),
    ...(attribute.definition ? { definition: attribute.definition } : {}),
  }));
  const identifiers = (item.identifiers ?? []).map((identifier) => ({
    id: identifier.id,
    name: identifier.name,
    ...(identifier.label ? { label: identifier.label } : {}),
    ...(identifier.definition ? { definition: identifier.definition } : {}),
  }));

  return {
    ...layout,
    standards: {
      sourceFormat: standardsModel.metadata?.sourceFormat || "standards-canonical",
      class: {
        ...(item.packageId ? { packageId: item.packageId } : {}),
        ...(item.superClassIds && item.superClassIds.length > 0 ? { superClassIds: item.superClassIds } : {}),
        ...(attributes.length > 0 ? { attributes } : {}),
        ...(identifiers.length > 0 ? { identifiers } : {}),
      },
    },
  } as Json;
}

function buildBundleFromStandardsModel(standardsModel: StandardsModel, warnings: string[]): ParsedImportBundle {
  const conceptRows = standardsModel.concepts
    .map((concept) => {
      const row = buildRowFromRecord(
        {
          id: concept.id,
          title: concept.prefLabel,
          description: concept.definition,
          content: concept.scopeNote,
          example: concept.example,
          tags: concept.altLabels,
          status: concept.status,
          iri: concept.iri,
          namespace: concept.namespace,
          section: concept.section,
          group: concept.group,
        },
        1,
        [],
        concept.id,
      );

      return row;
    })
    .filter(Boolean) as ParsedImportRow[];
  const classRows = standardsModel.classes
    .map((item) => buildRowFromRecord(
      {
        id: item.id,
        title: item.label,
        description: item.definition || "Canonical class imported from standards model",
        metadata: buildClassRowMetadata(standardsModel, item),
      },
      1,
      [],
      item.id,
    ))
    .filter(Boolean) as ParsedImportRow[];
  const rows = [...conceptRows, ...classRows];
  const relationships = [
    ...standardsModel.conceptRelations.map((relation) => ({
      sourceRef: relation.sourceConceptId,
      targetRef: relation.targetConceptId,
      type: toRelationshipType(relation),
      label: relation.label,
    })),
    ...standardsModel.associations.map((association) => ({
      sourceRef: association.source.classId,
      targetRef: association.target.classId,
      type: "related_to",
      label: association.label,
    })),
  ] satisfies ParsedImportRelationship[];

  return {
    ...validateRows(rows, warnings),
    relationships,
    standardsModel,
  };
}

const prefixMap: Record<string, string> = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  onto: "https://ontologyhub.local/schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

function expandCompactIri(value: string, prefixes: Record<string, string> = prefixMap) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("<") || trimmed.startsWith("\"") || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("urn:") || trimmed.startsWith("_:")) {
    return trimmed.replace(/^<|>$/g, "");
  }

  const [prefix, suffix] = trimmed.split(":", 2);
  const namespace = prefixes[prefix];

  if (!namespace || !suffix) {
    return trimmed;
  }

  return `${namespace}${suffix}`;
}

function readJsonLdId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return expandCompactIri(value.trim());
  }

  if (isObjectRecord(value) && typeof value["@id"] === "string" && value["@id"].trim()) {
    return expandCompactIri(value["@id"].trim());
  }

  return null;
}

function looksLikeJsonLdResourceRef(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed) || /^urn:/i.test(trimmed) || trimmed.startsWith("_:")) {
    return true;
  }

  const [prefix, suffix] = trimmed.split(":", 2);
  return Boolean(prefixMap[prefix] && suffix);
}

function toJsonLdTripleObjects(value: unknown): Array<{ kind: "iri" | "literal"; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toJsonLdTripleObjects(item));
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const literalValue = String(value);

    if (typeof value === "string" && looksLikeJsonLdResourceRef(literalValue)) {
      return [{ kind: "iri", value: expandCompactIri(literalValue) }];
    }

    return [{ kind: "literal", value: literalValue }];
  }

  const iri = readJsonLdId(value);

  if (iri) {
    return [{ kind: "iri", value: iri }];
  }

  if (isObjectRecord(value) && typeof value["@value"] === "string") {
    return [{ kind: "literal", value: value["@value"] }];
  }

  return [];
}

function parseJsonLdToTriples(data: unknown): ImportedTriple[] {
  const graph = isObjectRecord(data) && Array.isArray(data["@graph"])
    ? data["@graph"]
    : Array.isArray(data)
      ? data
      : [data];
  const triples: ImportedTriple[] = [];

  graph.forEach((entry) => {
    if (!isObjectRecord(entry)) {
      return;
    }

    const subject = readJsonLdId(entry["@id"]);

    if (!subject) {
      return;
    }

    const typeValues = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]].filter(Boolean);
    typeValues.forEach((typeValue) => {
      const object = readJsonLdId(typeValue);

      if (!object) {
        return;
      }

      triples.push({
        subject,
        predicate: expandCompactIri("rdf:type"),
        object: {
          type: "uri",
          value: object,
        },
      });
    });

    Object.entries(entry).forEach(([rawPredicate, rawValue]) => {
      if (rawPredicate === "@id" || rawPredicate === "@type" || rawPredicate === "@context") {
        return;
      }

      const predicate = expandCompactIri(rawPredicate);

      toJsonLdTripleObjects(rawValue).forEach((object) => {
        triples.push({
          subject,
          predicate,
          object: object.kind === "iri"
            ? {
                type: "uri",
                value: object.value,
              }
            : {
                type: "literal",
                value: object.value,
              },
        });
      });
    });
  });

  return triples;
}

function parseRowRelationships(rawRow: Record<string, unknown>, sourceRef: string) {
  const normalized = Object.entries(rawRow).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[normalizeHeader(key)] = value;
    return accumulator;
  }, {});

  const explicitRelationships = parseDelimitedValues(normalized.related_relationships).map((value) => {
    const [rawLabel, rawTarget] = value.split(/\s*->\s*/);
    const targetRef = rawTarget?.trim();

    if (!targetRef) {
      return null;
    }

    return {
      sourceRef,
      targetRef,
      type: "related_to",
      label: rawLabel?.trim() || "related",
    } satisfies ParsedImportRelationship;
  });

  const fallbackRelationships = parseDelimitedValues(normalized.related_definitions)
    .filter((targetRef) => !explicitRelationships.some((relationship) => relationship?.targetRef === targetRef))
    .map((targetRef) => ({
      sourceRef,
      targetRef,
      type: "related_to",
      label: "related",
    } satisfies ParsedImportRelationship));

  return [...explicitRelationships.filter(Boolean), ...fallbackRelationships];
}

function buildRowFromRecord(rawRow: Record<string, unknown>, rowNumber: number, warnings: string[], externalId?: string) {
  const normalized = Object.entries(rawRow).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[normalizeHeader(key)] = value;
    return accumulator;
  }, {});

  const title = String(normalized.title ?? normalized.preflabel ?? normalized.label ?? "").trim();
  const description = String(normalized.description ?? normalized.definition ?? "").trim();
  const content = String(normalized.content ?? normalized.context ?? "").trim();
  const example = String(normalized.example ?? "").trim();

  if (!title) {
    warnings.push(`Row ${rowNumber} was skipped because title is required.`);
    return null;
  }

  if (!description && !content) {
    warnings.push(`Row ${rowNumber} was skipped because description or context is required.`);
    return null;
  }

  const priorityResult = normalizePriority(String(normalized.priority ?? ""));
  const statusResult = normalizeStatus(String(normalized.status ?? ""));
  const inferredMetadata = buildLayoutMetadata({
    iri: normalized.iri ?? normalized["@id"],
    namespace: normalized.namespace ?? normalized["onto:namespace"],
    section: normalized.section ?? normalized["onto:section"],
    group: normalized.group ?? normalized["onto:group"],
  });
  const explicitMetadata = isObjectRecord(normalized.metadata) ? normalized.metadata : null;
  const metadata = inferredMetadata || explicitMetadata
    ? {
        ...(inferredMetadata ?? {}),
        ...(explicitMetadata ?? {}),
      }
    : undefined;

  if (priorityResult.warning) {
    warnings.push(`Row ${rowNumber} ${priorityResult.warning}`);
  }

  if (statusResult.warning) {
    warnings.push(`Row ${rowNumber} ${statusResult.warning}`);
  }

  return {
    externalId: externalId || String(normalized.id ?? normalized["@id"] ?? title),
    title,
    description,
    content,
    example,
    tags: splitTags(normalized.tags ?? normalized.tag ?? normalized.altlabel ?? []),
    priority: priorityResult.priority,
    status: statusResult.status,
    metadata: metadata as Json | undefined,
  } satisfies ParsedImportRow;
}

class CsvImporter implements Importer {
  format = "csv";
  label = "CSV";
  extensions = [".csv"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const text = await file.text();
    const workbook = read(text, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("The CSV file could not be read.");
    }

    const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: "" });
    const warnings: string[] = [];
    const relationships: ParsedImportRelationship[] = [];
    const parsedRows = rows
      .map((row, index) => {
        const parsedRow = buildRowFromRecord(row, index + 2, warnings);

        if (parsedRow) {
          relationships.push(...parseRowRelationships(row, parsedRow.externalId));
        }

        return parsedRow;
      })
      .filter(Boolean) as ParsedImportRow[];

    return {
      ...validateRows(parsedRows, warnings),
      relationships,
    };
  }
}

class ExcelImporter implements Importer {
  format = "excel";
  label = "Excel";
  extensions = [".xlsx", ".xls"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = read(buffer, { type: "array" });
    const preferredSheetName = workbook.SheetNames.find((sheetName) => sheetName.toLowerCase() === "definitions");
    const firstSheetName = preferredSheetName || workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("The workbook does not contain any sheets.");
    }

    const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: "" });
    const warnings: string[] = [];
    const relationships: ParsedImportRelationship[] = [];
    const parsedRows = rows
      .map((row, index) => {
        const parsedRow = buildRowFromRecord(row, index + 2, warnings);

        if (parsedRow) {
          relationships.push(...parseRowRelationships(row, parsedRow.externalId));
        }

        return parsedRow;
      })
      .filter(Boolean) as ParsedImportRow[];

    return {
      ...validateRows(parsedRows, warnings),
      relationships,
    };
  }
}

function buildBundleFromTriples(triples: ImportedTriple[], warnings: string[], sourceFormat: string): ParsedImportBundle {
  const standardsModel = mapRdfTriplesToStandardsModel({
    triples,
    sourceFormat,
  });

  return buildBundleFromStandardsModel(standardsModel, warnings);
}

function parseNTriples(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^<([^>]+)>\s+<([^>]+)>\s+(?:(<[^>]+>)|"((?:[^"\\]|\\.)*)"(?:(?:\^\^<([^>]+)>)|(?:@([a-zA-Z-]+)))?)\s*\.$/,
      );

      if (!match) {
        return null;
      }

      return {
        subject: match[1],
        predicate: match[2],
        object: match[3]
          ? { type: "uri" as const, value: match[3].slice(1, -1) }
          : {
              type: "literal" as const,
              value: (match[4] || "").replace(/\\"/g, '"').replace(/\\n/g, "\n"),
              datatypeIri: match[5] || undefined,
              language: match[6] || undefined,
            },
      };
    })
    .filter(Boolean) as ImportedTriple[];
}

class NTriplesImporter implements Importer {
  format = "ntriples";
  label = "N-Triples";
  extensions = [".nt"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseNTriples(await file.text()), [], "ntriples");
  }
}

function parseTurtle(text: string) {
  const prefixes = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@prefix"))
    .reduce<Record<string, string>>((accumulator, line) => {
      const match = line.match(/^@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\.$/);

      if (match) {
        accumulator[match[1]] = match[2];
      }

      return accumulator;
    }, { ...prefixMap });
  const triples: ImportedTriple[] = [];
  const blocks = text
    .replace(/^@prefix.*$/gm, "")
    .split(/\.\s*(?=<|$)/)
    .map((block) => block.trim())
    .filter(Boolean);

  blocks.forEach((block) => {
    const subjectMatch = block.match(/^([^\s]+)\s+/);
    if (!subjectMatch) {
      return;
    }

    const subject = expandCompactIri(subjectMatch[1], prefixes);
    const statementText = block.slice(subjectMatch[0].length);
    const statements = statementText.split(/\s*;\s*/).map((statement) => statement.trim()).filter(Boolean);

    statements.forEach((statement) => {
      const match = statement.match(/^([^\s]+)\s+(.+)$/);
      if (!match) {
        return;
      }

      const predicate = expandCompactIri(match[1], prefixes);
      const objectText = match[2];
      const uriMatch = objectText.match(/^<([^>]+)>$/);
      const literalMatch = objectText.match(/^"([\s\S]*)"$/);

      triples.push({
        subject,
        predicate,
        object: uriMatch
          ? { type: "uri", value: uriMatch[1] }
          : objectText.includes(":") && !literalMatch
            ? { type: "uri", value: expandCompactIri(objectText, prefixes) }
            : { type: "literal", value: (literalMatch?.[1] || objectText).replace(/\\"/g, '"').replace(/\\n/g, "\n") },
      });
    });
  });

  return triples;
}

class TurtleImporter implements Importer {
  format = "turtle";
  label = "Turtle";
  extensions = [".ttl"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseTurtle(await file.text()), [
      "Turtle import currently maps labels, descriptions, context, tags, and common semantic relationships.",
    ], "turtle");
  }
}

class JsonLdImporter implements Importer {
  format = "jsonld";
  label = "JSON-LD";
  extensions = [".jsonld", ".json"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const data = JSON.parse(await file.text());
    const warnings: string[] = ["JSON-LD import maps common labels, descriptions, and linked concept relations."];
    return buildBundleFromTriples(parseJsonLdToTriples(data), warnings, "jsonld");
  }
}

function parseXmlTriples(text: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  const triples: ImportedTriple[] = [];
  const nodes = Array.from(xml.querySelectorAll("rdf\\:Description, Description, owl\\:Class, Class, skos\\:Concept, Concept"));

  nodes.forEach((node) => {
    const subject =
      node.getAttribute("rdf:about")
      || node.getAttribute("about")
      || node.getAttribute("rdf:ID")
      || node.getAttribute("ID")
      || node.getAttribute("xmi:id")
      || node.getAttribute("id");

    if (!subject) {
      return;
    }

    if (node.namespaceURI && node.localName && node.localName !== "Description") {
      triples.push({
        subject,
        predicate: expandCompactIri("rdf:type"),
        object: {
          type: "uri",
          value: `${node.namespaceURI}${node.localName}`,
        },
      });
    }

    Array.from(node.children).forEach((child) => {
      const predicate = child.namespaceURI && child.localName
        ? `${child.namespaceURI}${child.localName}`
        : expandCompactIri(child.tagName);
      const resource = child.getAttribute("rdf:resource") || child.getAttribute("resource");
      triples.push({
        subject,
        predicate,
        object: resource
          ? { type: "uri", value: resource }
          : { type: "literal", value: child.textContent?.trim() || child.getAttribute("body") || "" },
      });
    });

    if (node.getAttribute("name")) {
      triples.push({
        subject,
        predicate: expandCompactIri("rdfs:label"),
        object: { type: "literal", value: node.getAttribute("name") || "" },
      });
    }
  });

  return triples;
}

class RdfXmlImporter implements Importer {
  format = "rdfxml";
  label = "RDF/XML";
  extensions = [".rdf", ".xml"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseXmlTriples(await file.text()), [
      "RDF/XML import maps common RDF labels, comments, and linked resources into definitions and relationships.",
    ], "rdfxml");
  }
}

class OwlImporter implements Importer {
  format = "owl";
  label = "OWL RDF";
  extensions = [".owl.rdf", ".owl"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseXmlTriples(await file.text()), [
      "OWL import currently maps ontology classes, labels, comments, and subclass-style links.",
    ], "owl");
  }
}

class SkosImporter implements Importer {
  format = "skos";
  label = "SKOS";
  extensions = [".skos.ttl", ".skos.rdf"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const text = await file.text();
    const triples = file.name.toLowerCase().endsWith(".ttl") ? parseTurtle(text) : parseXmlTriples(text);
    return buildBundleFromTriples(triples, [
      "SKOS import maps prefLabel, definition, altLabel, broader, narrower, and related into the ontology model.",
    ], "skos");
  }
}

class XmiImporter implements Importer {
  format = "xmi";
  label = "XMI";
  extensions = [".xmi"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const parser = new DOMParser();
    const xml = parser.parseFromString(await file.text(), "application/xml");
    const warnings: string[] = ["XMI import currently maps UML classes and associations into definitions and relationships."];
    return buildBundleFromStandardsModel(mapXmiToStandardsModel(xml), warnings);
  }
}

class TypeScriptImporter implements Importer {
  format = "typescript";
  label = "TypeScript UML";
  extensions = [".ts", ".tsx"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const { standardsModel, warnings } = await generateStandardsModelFromTypeScriptSource({
      source: await file.text(),
      fileName: file.name,
    });

    return buildBundleFromStandardsModel(standardsModel, [
      ...warnings,
      "TypeScript UML import maps classes and inheritance into canonical UML hints.",
    ]);
  }
}

const importers: Importer[] = [
  new CsvImporter(),
  new ExcelImporter(),
  new SkosImporter(),
  new JsonLdImporter(),
  new NTriplesImporter(),
  new OwlImporter(),
  new RdfXmlImporter(),
  new TurtleImporter(),
  new XmiImporter(),
  new TypeScriptImporter(),
];

export class ImportFactory {
  static getAll() {
    return importers;
  }

  static createFromFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const importer = importers.find((candidate) => candidate.extensions.some((extension) => lowerName.endsWith(extension)));

    if (!importer) {
      throw new Error("Unsupported file type. Please upload CSV, Excel, Turtle, JSON-LD, RDF/XML, N-Triples, OWL, SKOS, XMI, or TypeScript.");
    }

    return importer;
  }
}
