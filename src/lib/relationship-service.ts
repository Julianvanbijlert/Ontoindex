import type { SupabaseClient } from "@supabase/supabase-js";

import { Constants, type Database, type Enums } from "@/integrations/supabase/types";
import { logActivityEvent } from "@/lib/history-service";

export const predefinedRelationshipTypes = Constants.public.Enums.relationship_type;
export const CUSTOM_RELATION_TYPE = "__custom__";

export type PredefinedRelationshipType = Enums<"relationship_type">;
export type RelationshipSelection = PredefinedRelationshipType | typeof CUSTOM_RELATION_TYPE;
type AppSupabaseClient = SupabaseClient<Database>;

function isPredefinedRelationshipType(value: string): value is PredefinedRelationshipType {
  return predefinedRelationshipTypes.includes(value as PredefinedRelationshipType);
}

async function fetchDefinitionTitles(client: AppSupabaseClient, definitionIds: string[]) {
  const uniqueDefinitionIds = [...new Set(definitionIds.filter(Boolean))];

  if (uniqueDefinitionIds.length === 0) {
    return new Map<string, string>();
  }

  const { data } = await client.from("definitions").select("id, title").in("id", uniqueDefinitionIds);
  return new Map((data || []).map((definition: any) => [definition.id, definition.title]));
}

export function formatRelationshipType(value: string) {
  return value.replace(/_/g, " ");
}

export function getRelationshipDisplayLabel(type: string, label?: string | null) {
  return label?.trim() || formatRelationshipType(type);
}

export function buildRelationshipPayload(input: {
  sourceId: string;
  targetId: string;
  selectedType: RelationshipSelection;
  customType?: string;
  createdBy: string;
}) {
  const customType = input.customType?.trim() || "";

  if (input.selectedType === CUSTOM_RELATION_TYPE) {
    if (!customType) {
      throw new Error("A custom relationship type is required.");
    }

    return {
      source_id: input.sourceId,
      target_id: input.targetId,
      type: "related_to" as const,
      label: customType,
      created_by: input.createdBy,
    };
  }

  return {
    source_id: input.sourceId,
    target_id: input.targetId,
    type: input.selectedType,
    label: null,
    created_by: input.createdBy,
  };
}

export async function createRelationshipRecord(
  client: AppSupabaseClient,
  input: {
    sourceId: string;
    targetId: string;
    selectedType: RelationshipSelection;
    customType?: string;
    createdBy: string;
  },
) {
  const payload = buildRelationshipPayload(input);
  const { data, error } = await client
    .from("relationships")
    .insert(payload)
    .select("id, source_id, target_id, type, label")
    .single();

  if (error) {
    throw error;
  }

  const titleMap = await fetchDefinitionTitles(client, [input.sourceId, input.targetId]);
  const relationLabel = getRelationshipDisplayLabel(data.type, data.label);
  const sourceTitle = titleMap.get(input.sourceId) || "definition";
  const targetTitle = titleMap.get(input.targetId) || "definition";

  await Promise.all([
    logActivityEvent(client, {
      userId: input.createdBy,
      action: "relationship_added",
      entityType: "definition",
      entityId: input.sourceId,
      entityTitle: sourceTitle,
      details: {
        summary: `Added "${relationLabel}" relationship to "${targetTitle}".`,
        relationship_id: data.id,
        related_definition_id: input.targetId,
      },
    }),
    logActivityEvent(client, {
      userId: input.createdBy,
      action: "relationship_added",
      entityType: "definition",
      entityId: input.targetId,
      entityTitle: targetTitle,
      details: {
        summary: `Added "${relationLabel}" relationship from "${sourceTitle}".`,
        relationship_id: data.id,
        related_definition_id: input.sourceId,
      },
    }),
  ]);

  return data;
}

export async function deleteRelationshipRecord(
  client: AppSupabaseClient,
  input: {
    relationshipId: string;
    sourceId: string;
    targetId: string;
    type: string;
    label?: string | null;
    deletedBy?: string | null;
  },
) {
  const titleMap = await fetchDefinitionTitles(client, [input.sourceId, input.targetId]);
  const sourceTitle = titleMap.get(input.sourceId) || "definition";
  const targetTitle = titleMap.get(input.targetId) || "definition";
  const relationLabel = getRelationshipDisplayLabel(input.type, input.label);

  const { error } = await client.from("relationships").delete().eq("id", input.relationshipId);

  if (error) {
    throw error;
  }

  await Promise.all([
    logActivityEvent(client, {
      userId: input.deletedBy,
      action: "relationship_removed",
      entityType: "definition",
      entityId: input.sourceId,
      entityTitle: sourceTitle,
      details: {
        summary: `Removed "${relationLabel}" relationship to "${targetTitle}".`,
        relationship_id: input.relationshipId,
        related_definition_id: input.targetId,
      },
    }),
    logActivityEvent(client, {
      userId: input.deletedBy,
      action: "relationship_removed",
      entityType: "definition",
      entityId: input.targetId,
      entityTitle: targetTitle,
      details: {
        summary: `Removed "${relationLabel}" relationship from "${sourceTitle}".`,
        relationship_id: input.relationshipId,
        related_definition_id: input.sourceId,
      },
    }),
  ]);
}

export function getRelationshipSelection(type: string, label?: string | null): RelationshipSelection {
  if (label?.trim()) {
    return CUSTOM_RELATION_TYPE;
  }

  return isPredefinedRelationshipType(type) ? type : CUSTOM_RELATION_TYPE;
}
