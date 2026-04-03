import type { SupabaseClient } from "@supabase/supabase-js";

import type { Json } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";
import type { StandardsFinding } from "@/lib/standards/engine/types";
import {
  buildRelationshipPayload,
  CUSTOM_RELATION_TYPE,
  predefinedRelationshipTypes,
  type PredefinedRelationshipType,
  type RelationshipSelection,
} from "@/lib/relationship-service";
import { ImportFactory, supportedImportColumns, type ParsedImportBundle, type ParsedImportRow } from "@/lib/import-factory";
import { extractErrorMessage, normalizeSearchSyncErrorMessage } from "@/lib/search-index-errors";
import {
  evaluateStandardsModelCompliance,
  formatStandardsFindingsAsWarnings,
} from "@/lib/standards/compliance";
import { fetchStandardsRuntimeSettings } from "@/lib/standards/settings-service";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  warnings: string[];
  standardsFindings: StandardsFinding[];
  errorCount: number;
  warningCount: number;
}

export const REQUIRED_IMPORT_REQUIREMENTS = ["title", "description or context"];
export const SUPPORTED_IMPORT_COLUMNS = supportedImportColumns;

function buildResult(params: Pick<ImportResult, "success" | "imported" | "errors" | "warnings" | "standardsFindings">): ImportResult {
  return {
    ...params,
    errorCount: params.errors.length,
    warningCount: params.warnings.length,
  };
}

function normalizeImportFailureMessage(error: unknown) {
  return normalizeSearchSyncErrorMessage(error, "Import", "Import failed.");
}

function hasPersistableRowMetadata(rows: ParsedImportRow[]) {
  return rows.some((row) => row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPredefinedRelationshipType(value: string): value is PredefinedRelationshipType {
  return predefinedRelationshipTypes.includes(value as PredefinedRelationshipType);
}

function readRelationStandardsMetadata(metadata: Json | undefined) {
  if (!isRecord(metadata)) {
    return null;
  }

  const standards = metadata.standards;

  if (!isRecord(standards)) {
    return null;
  }

  const relation = standards.relation;
  return isRecord(relation) ? relation : null;
}

function toRelationshipSelection(input: {
  type: string;
  label?: string;
  metadata?: Json;
}): { selectedType: RelationshipSelection; customType?: string } {
  const relationMetadata = readRelationStandardsMetadata(input.metadata);
  const semanticKind = typeof relationMetadata?.kind === "string" ? relationMetadata.kind.trim().toLowerCase() : "";
  const normalizedType = input.type.trim().toLowerCase();

  if (isPredefinedRelationshipType(normalizedType)) {
    return {
      selectedType: normalizedType,
    };
  }

  if (semanticKind === "broader" || normalizedType === "broader") {
    return {
      selectedType: "is_a",
    };
  }

  if (semanticKind === "related" || normalizedType === "related") {
    return {
      selectedType: "related_to",
    };
  }

  if (semanticKind === "narrower" || normalizedType === "narrower") {
    return {
      selectedType: CUSTOM_RELATION_TYPE,
      customType: input.label?.trim() || "narrower",
    };
  }

  return {
    selectedType: CUSTOM_RELATION_TYPE,
    customType: input.label?.trim() || input.type,
  };
}

async function buildImportStandardsWarnings(
  client: AppSupabaseClient,
  bundle: ParsedImportBundle,
) {
  if (!bundle.standardsModel) {
    return {
      warnings: [] as string[],
      findings: [] as StandardsFinding[],
      hasBlockingFindings: false,
    };
  }

  const settings = await fetchStandardsRuntimeSettings(client);
  const compliance = evaluateStandardsModelCompliance(bundle.standardsModel, settings);

  return {
    warnings: formatStandardsFindingsAsWarnings(compliance),
    findings: compliance.findings,
    hasBlockingFindings: compliance.hasBlockingFindings,
  };
}

export async function parseImportFile(file: File) {
  const importer = ImportFactory.createFromFile(file);
  return importer.parse(file);
}

async function directPersistImportBundle(
  client: AppSupabaseClient,
  ontologyId: string,
  bundle: ParsedImportBundle,
) {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Authentication required.");
  }

  const referenceMap = new Map<string, string>();

  for (const row of bundle.rows) {
    const { data, error } = await client
      .from("definitions")
      .insert({
        title: row.title,
        description: row.description,
        content: row.content,
        example: row.example,
        tags: row.tags,
        priority: row.priority ?? "normal",
        status: row.status ?? "draft",
        metadata: row.metadata ?? null,
        ontology_id: ontologyId,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    referenceMap.set(row.externalId, data.id);
    referenceMap.set(row.title, data.id);
    referenceMap.set(row.title.trim().toLowerCase(), data.id);
  }

  const relationshipWarnings: string[] = [];

  if (bundle.relationships.length > 0) {
    const relationshipPayloads = bundle.relationships
      .map((relationship) => {
        const sourceId =
          referenceMap.get(relationship.sourceRef)
          || referenceMap.get(relationship.sourceRef.trim().toLowerCase());
        const targetId =
          referenceMap.get(relationship.targetRef)
          || referenceMap.get(relationship.targetRef.trim().toLowerCase());

        if (!sourceId || !targetId) {
          relationshipWarnings.push(
            `Skipped relationship "${relationship.label || relationship.type}" because one of its definitions was not imported.`,
          );
          return null;
        }
        const relationshipSelection = toRelationshipSelection({
          type: relationship.type,
          label: relationship.label,
          metadata: relationship.metadata,
        });

        return buildRelationshipPayload({
          sourceId,
          targetId,
          selectedType: relationshipSelection.selectedType,
          customType: relationshipSelection.customType,
          createdBy: user.id,
          metadata: relationship.metadata,
        });
      })
      .filter(Boolean);

    if (relationshipPayloads.length > 0) {
      const { error } = await client.from("relationships").insert(relationshipPayloads as any[]);

      if (error) {
        throw error;
      }
    }
  }

  await client.from("activity_events").insert({
    user_id: user.id,
    action: "imported",
    entity_type: "ontology",
    entity_id: ontologyId,
    entity_title: `${bundle.rows.length} imported definitions`,
    details: {
      imported_count: bundle.rows.length,
      relationship_count: bundle.relationships.length,
      transport: "direct",
    },
  });

  return relationshipWarnings;
}

async function attemptLegacyRpc(
  client: AppSupabaseClient,
  ontologyId: string,
  rows: ParsedImportRow[],
) {
  const { data, error } = await client.rpc("import_definitions_to_ontology", {
    _ontology_id: ontologyId,
    _rows: rows.map((row) => ({
      title: row.title,
      description: row.description,
      content: row.content,
      example: row.example,
      tags: row.tags,
      priority: row.priority,
      status: row.status,
    })),
  });

  if (error) {
    throw error;
  }

  return (data || {}) as { importedCount?: number; warnings?: string[] };
}

export async function importDefinitionsToOntology(
  client: AppSupabaseClient,
  ontologyId: string,
  file: File,
) {
  try {
    const bundle = await parseImportFile(file);
    const standardsValidation = await buildImportStandardsWarnings(client, bundle);

    if (standardsValidation.hasBlockingFindings) {
      throw new Error("Import blocked by a blocking standards compliance issue.");
    }

    if (bundle.rows.length === 0) {
      throw new Error("No valid rows were found to import.");
    }

    try {
      if (bundle.relationships.length === 0 && !hasPersistableRowMetadata(bundle.rows)) {
        const rpcResult = await attemptLegacyRpc(client, ontologyId, bundle.rows);

        return buildResult({
          success: true,
          imported: rpcResult.importedCount ?? bundle.rows.length,
          errors: [],
          warnings: [...bundle.warnings, ...standardsValidation.warnings, ...(rpcResult.warnings || [])],
          standardsFindings: standardsValidation.findings,
        });
      }

      if (bundle.relationships.length === 0 && hasPersistableRowMetadata(bundle.rows)) {
        bundle.warnings.push("The import included ontology metadata that the legacy database RPC cannot preserve, so the import completed through the direct persistence fallback.");
      }
    } catch (error) {
      const message = extractErrorMessage(error) || String(error);

      if (!/import_definitions_to_ontology/i.test(message) || !/schema cache|could not find/i.test(message)) {
        throw error;
      }

      bundle.warnings.push("The database import RPC was unavailable, so the import completed through the direct persistence fallback.");
    }

    const relationshipWarnings = await directPersistImportBundle(client, ontologyId, bundle);

    return buildResult({
      success: true,
      imported: bundle.rows.length,
      errors: [],
      warnings: [...bundle.warnings, ...standardsValidation.warnings, ...relationshipWarnings],
      standardsFindings: standardsValidation.findings,
    });
  } catch (error) {
    return buildResult({
      success: false,
      imported: 0,
      errors: [normalizeImportFailureMessage(error)],
      warnings: [],
      standardsFindings: [],
    });
  }
}
