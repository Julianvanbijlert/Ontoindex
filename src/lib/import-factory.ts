import { read, utils } from "xlsx";

import type { Enums } from "@/integrations/supabase/types";

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

type TripleObject = { type: "uri" | "literal"; value: string };
type Triple = { subject: string; predicate: string; object: TripleObject };

function localName(predicate: string) {
  const fragments = predicate.split(/[#/:]/);
  return fragments[fragments.length - 1];
}

function buildBundleFromTriples(triples: Triple[], warnings: string[]): ParsedImportBundle {
  const definitions = new Map<string, ParsedImportRow>();
  const relationships: ParsedImportRelationship[] = [];
  const subjectTypes = new Map<string, Set<string>>();

  const ensureDefinition = (subject: string) => {
    if (!definitions.has(subject)) {
      definitions.set(subject, {
        externalId: subject,
        title: "",
        description: "",
        content: "",
        example: "",
        tags: [],
      });
    }

    return definitions.get(subject)!;
  };

  triples.forEach((triple) => {
    const predicateName = localName(triple.predicate).toLowerCase();
    const definition = ensureDefinition(triple.subject);

    if (predicateName === "a" || predicateName === "type") {
      const currentTypes = subjectTypes.get(triple.subject) || new Set<string>();
      currentTypes.add(triple.object.value);
      subjectTypes.set(triple.subject, currentTypes);
    }

    if (triple.object.type === "literal") {
      if (["label", "preflabel", "title", "name"].includes(predicateName) && !definition.title) {
        definition.title = triple.object.value.trim();
      } else if (["comment", "definition", "description"].includes(predicateName) && !definition.description) {
        definition.description = triple.object.value.trim();
      } else if (["context", "note", "scopeNote".toLowerCase()].includes(predicateName) && !definition.content) {
        definition.content = triple.object.value.trim();
      } else if (predicateName === "example" && !definition.example) {
        definition.example = triple.object.value.trim();
      } else if (["altlabel", "tags", "tag"].includes(predicateName)) {
        definition.tags = Array.from(new Set([...definition.tags, ...splitTags(triple.object.value)]));
      } else if (predicateName === "status") {
        const statusResult = normalizeStatus(triple.object.value);
        definition.status = statusResult.status;
        if (statusResult.warning) {
          warnings.push(`Imported resource ${triple.subject} ${statusResult.warning}`);
        }
      } else if (predicateName === "priority") {
        const priorityResult = normalizePriority(triple.object.value);
        definition.priority = priorityResult.priority;
        if (priorityResult.warning) {
          warnings.push(`Imported resource ${triple.subject} ${priorityResult.warning}`);
        }
      }
    } else if (["relateddefinition", "related", "broader", "narrower", "subclassof"].includes(predicateName)) {
      relationships.push({
        sourceRef: triple.subject,
        targetRef: triple.object.value,
        type: predicateName === "subclassof" ? "is_a" : "related_to",
        label: predicateName.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim(),
      });
    }
  });

  const rows = Array.from(definitions.values()).filter((definition) => {
    const types = subjectTypes.get(definition.externalId) || new Set<string>();
    const isOntologyLevelResource = [...types].some((value) => /ontology|conceptscheme/i.test(value));

    return !isOntologyLevelResource && definition.title && (definition.description || definition.content);
  });

  if (rows.length === 0) {
    throw new Error("No mappable concepts or definitions were found in this file.");
  }

  return {
    rows,
    relationships: relationships.filter(
      (relationship) =>
        definitions.has(relationship.sourceRef) &&
        definitions.has(relationship.targetRef) &&
        relationship.sourceRef !== relationship.targetRef,
    ),
    warnings,
  };
}

function parseNTriples(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^<([^>]+)>\s+<([^>]+)>\s+(?:(<[^>]+>)|"((?:[^"\\]|\\.)*)")\s*\.$/);

      if (!match) {
        return null;
      }

      return {
        subject: match[1],
        predicate: match[2],
        object: match[3]
          ? { type: "uri" as const, value: match[3].slice(1, -1) }
          : { type: "literal" as const, value: (match[4] || "").replace(/\\"/g, '"').replace(/\\n/g, "\n") },
      };
    })
    .filter(Boolean) as Triple[];
}

class NTriplesImporter implements Importer {
  format = "ntriples";
  label = "N-Triples";
  extensions = [".nt"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseNTriples(await file.text()), []);
  }
}

function parseTurtle(text: string) {
  const triples: Triple[] = [];
  const blocks = text
    .replace(/^@prefix.*$/gm, "")
    .split(/\.\s*(?=<|$)/)
    .map((block) => block.trim())
    .filter(Boolean);

  blocks.forEach((block) => {
    const subjectMatch = block.match(/^<([^>]+)>\s+/);
    if (!subjectMatch) {
      return;
    }

    const subject = subjectMatch[1];
    const statementText = block.slice(subjectMatch[0].length);
    const statements = statementText.split(/\s*;\s*/).map((statement) => statement.trim()).filter(Boolean);

    statements.forEach((statement) => {
      const match = statement.match(/^([^\s]+)\s+(.+)$/);
      if (!match) {
        return;
      }

      const predicate = match[1];
      const objectText = match[2];
      const uriMatch = objectText.match(/^<([^>]+)>$/);
      const literalMatch = objectText.match(/^"([\s\S]*)"$/);

      triples.push({
        subject,
        predicate,
        object: uriMatch
          ? { type: "uri", value: uriMatch[1] }
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
    ]);
  }
}

class JsonLdImporter implements Importer {
  format = "jsonld";
  label = "JSON-LD";
  extensions = [".jsonld", ".json"];

  async parse(file: File): Promise<ParsedImportBundle> {
    const data = JSON.parse(await file.text());
    const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
    const warnings: string[] = ["JSON-LD import maps common labels, descriptions, and linked concept relations."];
    const rows: ParsedImportRow[] = [];
    const relationships: ParsedImportRelationship[] = [];

    graph.forEach((node, index) => {
      const nodeTypes = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]].filter(Boolean);

      if (nodeTypes.some((value: string) => /owl:Ontology|ConceptScheme/i.test(value))) {
        return;
      }

      const row = buildRowFromRecord(
        {
          "@id": node["@id"],
          title: node["rdfs:label"] || node.title || node.name,
          description: node["rdfs:comment"] || node.description || node["skos:definition"],
          content: node["onto:context"] || node.context,
          tags: node["onto:tags"] || node["skos:altLabel"] || [],
          status: node["onto:status"] || node.status,
          priority: node["onto:priority"] || node.priority,
        },
        index + 1,
        warnings,
        String(node["@id"] || node.id || index),
      );

      if (row) {
        rows.push(row);
      }

      const relationNodes = node["onto:relatedDefinition"] || node["skos:related"] || [];
      const normalizedRelationNodes = Array.isArray(relationNodes) ? relationNodes : [relationNodes];
      normalizedRelationNodes.forEach((relation: any) => {
        const targetRef = typeof relation === "string" ? relation : relation?.["@id"];
        if (!targetRef) {
          return;
        }

        relationships.push({
          sourceRef: String(node["@id"] || node.id || index),
          targetRef: String(targetRef),
          type: "related_to",
          label: relation?.["onto:relationshipType"] || "related",
        });
      });
    });

    validateRows(rows, warnings);

    return { rows, relationships, warnings };
  }
}

function parseXmlTriples(text: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  const triples: Triple[] = [];
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

    Array.from(node.children).forEach((child) => {
      const predicate = child.tagName;
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
        predicate: "name",
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
    ]);
  }
}

class OwlImporter implements Importer {
  format = "owl";
  label = "OWL RDF";
  extensions = [".owl.rdf", ".owl"];

  async parse(file: File): Promise<ParsedImportBundle> {
    return buildBundleFromTriples(parseXmlTriples(await file.text()), [
      "OWL import currently maps ontology classes, labels, comments, and subclass-style links.",
    ]);
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
    ]);
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
    const rows: ParsedImportRow[] = [];
    const relationships: ParsedImportRelationship[] = [];
    const classes = Array.from(xml.querySelectorAll("packagedElement[xmi\\:type='uml:Class'], packagedElement[xmi:type='uml:Class']"));

    classes.forEach((classNode, index) => {
      const row = buildRowFromRecord(
        {
          id: classNode.getAttribute("xmi:id") || classNode.getAttribute("id") || index,
          title: classNode.getAttribute("name") || "",
          description: classNode.querySelector("ownedComment")?.getAttribute("body") || "",
        },
        index + 1,
        warnings,
        classNode.getAttribute("xmi:id") || classNode.getAttribute("id") || String(index),
      );

      if (row) {
        rows.push(row);
      }
    });

    Array.from(xml.querySelectorAll("packagedElement[xmi\\:type='uml:Association'], packagedElement[xmi:type='uml:Association']")).forEach((association) => {
      const members = (association.getAttribute("memberEnd") || "").split(/\s+/).filter(Boolean);
      if (members.length >= 2) {
        relationships.push({
          sourceRef: members[0],
          targetRef: members[1],
          type: "related_to",
          label: association.getAttribute("name") || "association",
        });
      }
    });

    return {
      ...validateRows(rows, warnings),
      relationships,
    };
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
];

export class ImportFactory {
  static getAll() {
    return importers;
  }

  static createFromFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const importer = importers.find((candidate) => candidate.extensions.some((extension) => lowerName.endsWith(extension)));

    if (!importer) {
      throw new Error("Unsupported file type. Please upload CSV, Excel, Turtle, JSON-LD, RDF/XML, N-Triples, OWL, SKOS, or XMI.");
    }

    return importer;
  }
}
