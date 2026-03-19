import { Constants, type Enums } from "@/integrations/supabase/types";

export const predefinedRelationshipTypes = Constants.public.Enums.relationship_type;
export const CUSTOM_RELATION_TYPE = "__custom__";

export type PredefinedRelationshipType = Enums<"relationship_type">;
export type RelationshipSelection = PredefinedRelationshipType | typeof CUSTOM_RELATION_TYPE;

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
