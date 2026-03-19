import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildRelationshipPayload } from "@/lib/relationship-service";
import { ImportFactory, supportedImportColumns, type ParsedImportBundle, type ParsedImportRow } from "@/lib/import-factory";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  warnings: string[];
  errorCount: number;
  warningCount: number;
}

export const REQUIRED_IMPORT_REQUIREMENTS = ["title", "description or context"];
export const SUPPORTED_IMPORT_COLUMNS = supportedImportColumns;

function buildResult(params: Pick<ImportResult, "success" | "imported" | "errors" | "warnings">): ImportResult {
  return {
    ...params,
    errorCount: params.errors.length,
    warningCount: params.warnings.length,
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

        return buildRelationshipPayload({
          sourceId,
          targetId,
          selectedType: "related_to",
          customType: relationship.label || relationship.type,
          createdBy: user.id,
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

    try {
      if (bundle.relationships.length === 0) {
        const rpcResult = await attemptLegacyRpc(client, ontologyId, bundle.rows);

        return buildResult({
          success: true,
          imported: rpcResult.importedCount ?? bundle.rows.length,
          errors: [],
          warnings: [...bundle.warnings, ...(rpcResult.warnings || [])],
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message)
            : String(error);

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
      warnings: [...bundle.warnings, ...relationshipWarnings],
    });
  } catch (error) {
    return buildResult({
      success: false,
      imported: 0,
      errors: [error instanceof Error ? error.message : "Import failed."],
      warnings: [],
    });
  }
}
