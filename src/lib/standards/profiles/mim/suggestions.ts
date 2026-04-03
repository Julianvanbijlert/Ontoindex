import type { StandardsRelationSuggestion, StandardsRuleContext } from "@/lib/standards/engine/types";

export function getMimRelationSuggestions(context: StandardsRuleContext): StandardsRelationSuggestion[] {
  if (!context.relationshipDraft?.sourceDefinitionId || !context.relationshipDraft?.targetDefinitionId) {
    return [];
  }

  return [
    {
      id: "mim-suggestion-part-of",
      standardId: "mim",
      label: "Use part of",
      explanation: "A useful default for structural containment in the initial MIM pack.",
      selectedType: "part_of",
    },
    {
      id: "mim-suggestion-depends-on",
      standardId: "mim",
      label: "Use depends on",
      explanation: "A better fit than a custom label when the relation expresses dependency.",
      selectedType: "depends_on",
    },
  ];
}
