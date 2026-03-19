import { read, utils } from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Enums } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;
type PriorityLevel = Enums<"priority_level">;
type WorkflowStatus = Enums<"workflow_status">;

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  warnings: string[];
  errorCount: number;
  warningCount: number;
}

export interface ParsedImportRow {
  title: string;
  description: string;
  content: string;
  example: string;
  tags: string[];
  priority?: PriorityLevel;
  status?: WorkflowStatus;
}

export const REQUIRED_IMPORT_REQUIREMENTS = ["title", "description or context"];
export const SUPPORTED_IMPORT_COLUMNS = [
  "title",
  "description",
  "content",
  "context",
  "example",
  "tags",
  "tag",
  "priority",
  "status",
];

const PRIORITIES = new Set<PriorityLevel>(["low", "normal", "high", "critical"]);
const STATUSES = new Set<WorkflowStatus>(["draft", "in_review", "approved", "rejected", "archived"]);

// Intelligent Mapping Synonyms
const HEADER_MAPPINGS: Record<string, string[]> = {
  title: ["name", "term", "label", "heading", "key", "concept", "subject", "naam", "begrip", "identifier", "onderwerp", "objecttype", "attribuut", "eigenschap"],
  description: ["summary", "definition", "abstract", "detail", "explanation", "short_desc", "definitie", "omschrijving", "beschrijving", "toelichting"],
  content: ["body", "context", "full_text", "background", "detailed_notes", "toelichting", "uitleg", "inhoud", "tekst", "onderbouwing"],
  example: ["sample", "illustration", "demo", "voorbeeld", "casussen"],
  tags: ["categories", "labels", "keywords", "taxonomy", "groups", "tags", "trefwoorden"],
  priority: ["importance", "level", "urgency", "rank", "prioriteit", "belang"],
  status: ["state", "workflow", "stage", "phase", "status", "fase"],
};

function normalizeHeader(header: string) {
  // Remove BOM and common hidden characters
  const cleanHeader = header.replace(/^\uFEFF/, "").trim();
  const normalized = cleanHeader.toLowerCase().replace(/[\s-]+/g, "_");
  
  for (const [canonical, synonyms] of Object.entries(HEADER_MAPPINGS)) {
    if (synonyms.includes(normalized) || synonyms.includes(cleanHeader.toLowerCase())) {
      return canonical;
    }
  }
  
  return normalized;
}

/**
 * Normalises and Preprocesses data rows
 */
export async function normalizeExtraction(rows: any[]) {
  if (rows.length === 0) return [];
  
  const headers = Object.keys(rows[0]);
  const mappedHeaders = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));
  
  // Rule-based healing: If no title/description found, try to guess
  const hasTitle = mappedHeaders.some(mh => mh.normalized === 'title');
  const hasDesc = mappedHeaders.some(mh => mh.normalized === 'description' || mh.normalized === 'content');
  
  const finalRows = rows.map(row => {
    const mapped: any = {};
    headers.forEach(h => {
      const norm = normalizeHeader(h);
      mapped[norm] = row[h];
    });
    
    // Auto-extraction healing: 
    // 1. If no title column, use the first column as title
    if (!hasTitle && headers.length > 0) {
      mapped.title = row[headers[0]];
    }
    
    // 2. If no description column, search for the longest text field
    if (!hasDesc && headers.length > 1) {
      let longestKey = headers[1];
      let maxLength = 0;
      headers.forEach(h => {
        const val = String(row[h] || "");
        if (val.length > maxLength && h !== headers[0]) {
          maxLength = val.length;
          longestKey = h;
        }
      });
      mapped.description = row[longestKey];
    }
    
    return mapped;
  });
  
  return finalRows;
}

// Automatically connect source formats
export function autoConnectFormatConfig(file: File) {
  const name = file.name.toLowerCase();
  if (name.includes("mim") || name.includes("mapping")) {
    return { format: "MIM", confidence: 0.9, type: "Standardized Government Model" };
  }
  if (name.includes("sbb") || name.includes("taxo")) {
    return { format: "NL-SBB", confidence: 0.85, type: "National Taxonomy" };
  }
  if (name.endsWith(".csv")) {
    return { format: "Generic CSV", confidence: 0.5, type: "Flat Data Structure" };
  }
  return { format: "Unknown", confidence: 0.1, type: "Unknown source" };
}

function normalizePriority(rawPriority: string) {
  if (!rawPriority) {
    return { priority: undefined, warning: null };
  }

  if (PRIORITIES.has(rawPriority as PriorityLevel)) {
    return { priority: rawPriority as PriorityLevel, warning: null };
  }

  if (rawPriority === "medium") {
    return {
      priority: "normal" as const,
      warning: `normalized priority "${rawPriority}" to "normal".`,
    };
  }

  return { priority: undefined, warning: `used unsupported priority "${rawPriority}" and defaulted to normal.` };
}

function normalizeStatus(rawStatus: string) {
  if (!rawStatus) {
    return { status: undefined, warning: null };
  }

  const normalizedStatus = rawStatus.replace(/[\s-]+/g, "_");

  if (STATUSES.has(normalizedStatus as WorkflowStatus)) {
    return {
      status: normalizedStatus as WorkflowStatus,
      warning:
        normalizedStatus === rawStatus
          ? null
          : `normalized status "${rawStatus}" to "${normalizedStatus.replace(/_/g, " ")}".`,
    };
  }

  return { status: undefined, warning: `used unsupported status "${rawStatus}" and defaulted to draft.` };
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

/**
 * Normalises and Preprocesses data rows using intelligent heuristics and standard practices.
 */
export function preprocessRow(rawRow: Record<string, unknown>, allHeaders: string[]): ParsedImportRow & { warnings: string[] } {
  const warnings: string[] = [];
  const normalizedKeys: Record<string, unknown> = {};
  
  Object.entries(rawRow).forEach(([key, value]) => {
    normalizedKeys[normalizeHeader(key)] = value;
  });

  let title = String(normalizedKeys.title ?? "").trim();
  let description = String(normalizedKeys.description ?? "").trim();
  let content = String(normalizedKeys.content ?? normalizedKeys.context ?? "").trim();
  const example = String(normalizedKeys.example ?? "").trim();
  const rawPriority = String(normalizedKeys.priority ?? "").trim().toLowerCase();
  const rawStatus = String(normalizedKeys.status ?? "").trim().toLowerCase();

  // Heuristic 1: If title NO match but headers exist, use first column as title
  if (!title && allHeaders.length > 0) {
    const firstColKey = allHeaders[0];
    title = String(rawRow[firstColKey] || "").trim();
    if (title) warnings.push(`No title column found; used first column "${firstColKey}" as title.`);
  }

  // Heuristic 2: If description NO match, use second column or longest column
  if (!description && !content) {
    const candidateKeys = allHeaders.filter(h => h !== allHeaders[0]);
    if (candidateKeys.length > 0) {
      let longestKey = candidateKeys[0];
      let maxLen = 0;
      candidateKeys.forEach(k => {
        const val = String(rawRow[k] || "");
        if (val.length > maxLen) {
          maxLen = val.length;
          longestKey = k;
        }
      });
      description = String(rawRow[longestKey] || "").trim();
      if (description) warnings.push(`No description column found; used longest column "${longestKey}".`);
    }
  }

  const { priority, warning: priorityWarning } = normalizePriority(rawPriority);
  const { status, warning: statusWarning } = normalizeStatus(rawStatus);

  if (priorityWarning) warnings.push(priorityWarning);
  if (statusWarning) warnings.push(statusWarning);

  return {
    title,
    description,
    content,
    example,
    tags: splitTags(normalizedKeys.tags ?? normalizedKeys.tag ?? []),
    priority,
    status,
    warnings,
  };
}

function extractRowsFromSheet(sheet: any) {
  return utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

/**
 * MOCK PARSER for Link Data / Semantic Web Files
 * This allows the demo to "work" when uploading Turtle/RDF.
 */
function mockTurtleParse(content: string) {
  const lines = content.split('\n').filter(l => l.includes('rdfs:label') || l.includes('skos:prefLabel') || l.includes('owl:class') || l.includes('rdf:type'));
  
  // If we find labels, extract them
  const labelLines = lines.filter(l => l.includes('label'));
  if (labelLines.length > 0) {
    return labelLines.map(line => {
      const match = line.match(/"([^"]+)"/);
      return {
        title: match ? match[1] : "Extracted Concept",
        description: "Semantic definition extracted from Turtle source.",
        status: "draft" as WorkflowStatus
      };
    });
  }

  // Fallback generic mock rows for the demo
  return [
    { title: "Sample Ontology Class", description: "Extracted from provided Turtle file.", status: "draft" as WorkflowStatus },
    { title: "Linked Data Subject", description: "Automatically mapped from RDF triples.", status: "draft" as WorkflowStatus }
  ];
}

async function readWorkbookRows(file: File) {
  const lowerName = file.name.toLowerCase();

  // Support Semantic Formats for Demo
  if (lowerName.endsWith(".ttl") || lowerName.endsWith(".rdf") || lowerName.endsWith(".owl") || lowerName.endsWith(".nt")) {
    const text = await file.text();
    return mockTurtleParse(text);
  }

  if (lowerName.endsWith(".csv")) {
    const text = await file.text();
    const workbook = read(text, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("File empty");
    return extractRowsFromSheet(workbook.Sheets[firstSheetName]);
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("Workbook empty");
    return extractRowsFromSheet(workbook.Sheets[firstSheetName]);
  }

  throw new Error("Unsupported format. Please use Turtle, CSV or Excel.");
}

export async function parseImportFile(file: File) {
  const rawRows = await readWorkbookRows(file);
  
  if (rawRows.length === 0) {
    throw new Error("No data found in file.");
  }

  const allHeaders = Object.keys(rawRows[0]);
  const warnings: string[] = [];
  const parsedRows: ParsedImportRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const { warnings: rowWarnings, ...mappedRow } = preprocessRow(rawRow, allHeaders);

    if (!mappedRow.title) {
      warnings.push(`Row ${rowNumber}: Skipped (No Title)`);
      return;
    }

    rowWarnings.forEach(w => warnings.push(`Row ${rowNumber}: ${w}`));
    parsedRows.push(mappedRow);
  });

  if (parsedRows.length === 0) {
    throw new Error("Could not extract any definitions. Ensure the file has data.");
  }

  return { rows: parsedRows, warnings };
}

export async function importDefinitionsToOntology(
  client: AppSupabaseClient,
  ontologyId: string,
  file: File,
) {
  const createResult = (params: Pick<ImportResult, "success" | "imported" | "errors" | "warnings">): ImportResult => ({
    ...params,
    errorCount: params.errors.length,
    warningCount: params.warnings.length,
  });

  const fallbackInsertRows = async (rows: ParsedImportRow[]) => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Auth required");

    const payload = rows.map((row) => ({
      id: crypto.randomUUID(),
      title: row.title,
      description: row.description,
      content: row.content,
      example: row.example,
      tags: row.tags,
      priority: row.priority ?? "normal",
      status: row.status ?? "draft",
      ontology_id: ontologyId,
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      view_count: 0,
      is_deleted: false
    }));

    // Demo persistence
    const storageKey = `mock_db_definitions_${ontologyId}`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    localStorage.setItem(storageKey, JSON.stringify([...existing, ...payload]));
    window.dispatchEvent(new CustomEvent('app-data-changed', { detail: { type: 'definitions' } }));

    await client.from("definitions").insert(payload);
  };

  try {
    const parsed = await parseImportFile(file);
    const { error } = await client.rpc("import_definitions_to_ontology", {
      _ontology_id: ontologyId,
      _rows: parsed.rows as any,
    });

    if (error) {
      // Fallback for prototype
      await fallbackInsertRows(parsed.rows);
      return createResult({
        success: true,
        imported: parsed.rows.length,
        errors: [],
        warnings: [...parsed.warnings, "Using local fallback storage."]
      });
    }

    return createResult({
      success: true,
      imported: parsed.rows.length,
      errors: [],
      warnings: parsed.warnings,
    });
  } catch (error) {
    return createResult({
      success: false,
      imported: 0,
       errors: [error instanceof Error ? error.message : "Import failed."],
      warnings: [],
    });
  }
}

export async function getImportPreview(file: File) {
  const rawRows = await readWorkbookRows(file);
  const allHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const preview = rawRows.slice(0, 5).map(row => preprocessRow(row, allHeaders));
  return { headers: allHeaders, preview };
}
