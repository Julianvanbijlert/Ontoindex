import type { StandardsRelationSuggestion, StandardsRuleContext } from "@/lib/standards/engine/types";

export function getSkosRelationSuggestions(context: StandardsRuleContext): StandardsRelationSuggestion[] {
  if (!context.relationshipDraft?.sourceDefinitionId || !context.relationshipDraft?.targetDefinitionId) {
    return [];
  }

  return [
    {
      id: "skos-suggestion-broader",
      standardId: "skos",
      label: "Use broader",
      explanation: "Recommended when the source concept is broader than the target concept in the current SKOS starter pack.",
      selectedType: "is_a",
      metadata: {
        standards: {
          relation: {
            kind: "broader",
            predicateKey: "broader",
            predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
          },
        },
      },
    },
    {
      id: "skos-suggestion-related",
      standardId: "skos",
      label: "Use related",
      explanation: "Recommended for associative concept links that are not hierarchical.",
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
    {
      id: "skos-suggestion-narrower",
      standardId: "skos",
      label: "Use narrower",
      explanation: "Recommended when the source concept is narrower and should retain explicit SKOS narrower semantics.",
      selectedType: "__custom__",
      customType: "narrower",
      metadata: {
        standards: {
          relation: {
            kind: "narrower",
            predicateKey: "narrower",
            predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
          },
        },
      },
    },
  ];
}
