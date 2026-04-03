import type { StandardsRelationSuggestion, StandardsRuleContext } from "@/lib/standards/engine/types";

export function getRdfRelationSuggestions(context: StandardsRuleContext): StandardsRelationSuggestion[] {
  if (!context.relationshipDraft?.sourceDefinitionId || !context.relationshipDraft?.targetDefinitionId) {
    return [];
  }

  return [
    {
      id: "rdf-suggestion-related",
      standardId: "rdf",
      label: "Use related",
      explanation: "A safe generic fallback while richer predicate packs are still being added.",
      selectedType: "related_to",
      metadata: {
        standards: {
          relation: {
            kind: "related",
            predicateKey: "related",
            predicateIri: "http://www.w3.org/2004/02/skos/core#related",
          },
        },
      },
    },
  ];
}
