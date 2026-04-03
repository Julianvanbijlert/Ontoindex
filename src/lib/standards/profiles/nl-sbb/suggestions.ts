import type { StandardsRelationSuggestion, StandardsRuleContext } from "@/lib/standards/engine/types";

export function getNlSbbRelationSuggestions(context: StandardsRuleContext): StandardsRelationSuggestion[] {
  if (!context.relationshipDraft?.sourceDefinitionId || !context.relationshipDraft?.targetDefinitionId) {
    return [];
  }

  return [
    {
      id: "nl-sbb-suggestion-broader",
      standardId: "nl-sbb",
      label: "Use broader",
      explanation: "Recommended for hierarchical concept links in the current NL-SBB starter pack.",
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
      id: "nl-sbb-suggestion-related",
      standardId: "nl-sbb",
      label: "Use related",
      explanation: "Recommended when the concepts are associated without hierarchy.",
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
      id: "nl-sbb-suggestion-narrower",
      standardId: "nl-sbb",
      label: "Use narrower",
      explanation: "Keeps the SKOS semantics while still allowing a custom visible label.",
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
