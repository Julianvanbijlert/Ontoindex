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

function mapRow(rawRow: Record<string, unknown>) {
  const normalized = Object.entries(rawRow).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[normalizeHeader(key)] = value;
    return accumulator;
  }, {});

  const title = String(normalized.title ?? "").trim();
  const description = String(normalized.description ?? "").trim();
  const content = String(normalized.content ?? normalized.context ?? "").trim();
  const example = String(normalized.example ?? "").trim();
  const priority = String(normalized.priority ?? "").trim().toLowerCase();
  const status = String(normalized.status ?? "").trim().toLowerCase();

  return {
    title,
    description,
    content,
    example,
    tags: splitTags(normalized.tags ?? normalized.tag ?? []),
    priority: PRIORITIES.has(priority as PriorityLevel) ? (priority as PriorityLevel) : undefined,
    status: STATUSES.has(status as WorkflowStatus) ? (status as WorkflowStatus) : undefined,
    rawPriority: priority,
    rawStatus: status,
  };
}

function extractRowsFromSheet(sheet: any) {
  return utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

async function readWorkbookRows(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const text = await file.text();
    const workbook = read(text, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("The CSV file could not be read.");
    }

    return extractRowsFromSheet(workbook.Sheets[firstSheetName]);
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("The workbook does not contain any sheets.");
    }

    return extractRowsFromSheet(workbook.Sheets[firstSheetName]);
  }

  throw new Error("Unsupported file type. Please upload a CSV or Excel file.");
}

export async function parseImportFile(file: File) {
  const rows = await readWorkbookRows(file);

  if (rows.length === 0) {
    throw new Error("The file is empty or does not contain any data rows.");
  }

  const normalizedHeaders = Object.keys(rows[0] || {}).map(normalizeHeader);
  const missingRequiredColumns = ["title"].filter((column) => !normalizedHeaders.includes(column));
  const hasDetailColumn = normalizedHeaders.includes("description") || normalizedHeaders.includes("context") || normalizedHeaders.includes("content");

  if (missingRequiredColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingRequiredColumns.join(", ")}.`);
  }

  if (!hasDetailColumn) {
    throw new Error("Missing required column: description or context.");
  }

  const warnings: string[] = [];
  const parsedRows: ParsedImportRow[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const mappedRow = mapRow(rawRow);

    if (!mappedRow.title) {
      warnings.push(`Row ${rowNumber} was skipped because title is required.`);
      return;
    }

    if (!mappedRow.description && !mappedRow.content) {
      warnings.push(`Row ${rowNumber} was skipped because description or context is required.`);
      return;
    }

    if (mappedRow.rawPriority && !mappedRow.priority) {
      warnings.push(`Row ${rowNumber} used unsupported priority "${mappedRow.rawPriority}" and defaulted to normal.`);
    }

    if (mappedRow.rawStatus && !mappedRow.status) {
      warnings.push(`Row ${rowNumber} used unsupported status "${mappedRow.rawStatus}" and defaulted to draft.`);
    }

    parsedRows.push({
      title: mappedRow.title,
      description: mappedRow.description,
      content: mappedRow.content,
      example: mappedRow.example,
      tags: mappedRow.tags,
      priority: mappedRow.priority,
      status: mappedRow.status,
    });
  });

  if (parsedRows.length === 0) {
    throw new Error("No valid rows were found to import.");
  }

  return {
    rows: parsedRows,
    warnings,
  };
}

export async function importDefinitionsToOntology(
  client: AppSupabaseClient,
  ontologyId: string,
  file: File,
) {
  try {
    const parsed = await parseImportFile(file);
    const { data, error } = await client.rpc("import_definitions_to_ontology", {
      _ontology_id: ontologyId,
      _rows: parsed.rows,
    });

    if (error) {
      return {
        success: false,
        imported: 0,
        errors: [error.message],
        warnings: parsed.warnings,
      } satisfies ImportResult;
    }

    const rpcResult = (data || {}) as { importedCount?: number; warnings?: string[] };

    return {
      success: true,
      imported: rpcResult.importedCount ?? parsed.rows.length,
      errors: [],
      warnings: [...parsed.warnings, ...(rpcResult.warnings || [])],
    } satisfies ImportResult;
  } catch (error) {
    return {
      success: false,
      imported: 0,
      errors: [error instanceof Error ? error.message : "Import failed."],
      warnings: [],
    } satisfies ImportResult;
  }
}
