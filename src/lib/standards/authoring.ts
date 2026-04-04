import type { Json } from "@/integrations/supabase/types";
import {
  CUSTOM_RELATION_TYPE,
  predefinedRelationshipTypes,
  type RelationshipSelection,
} from "@/lib/relationship-service";
import type {
  StandardsRelationSuggestion,
  StandardsRuntimeSettings,
} from "@/lib/standards/engine/types";

export interface DefinitionStandardsMetadataDraft {
  iri: string;
  namespace: string;
  section: string;
  group: string;
  sourceReference: string;
  sourceUrl: string;
  legalBasis: string;
  legalBasisRequired: boolean;
  topConcept: boolean;
}

export interface DefinitionAuthoringFieldConfig {
  key: keyof DefinitionStandardsMetadataDraft;
  label: string;
  description: string;
  placeholder?: string;
  input: "text" | "textarea" | "url" | "switch";
  standards: string[];
}

export interface DefinitionAuthoringSectionConfig {
  id: string;
  title: string;
  description: string;
  standards: string[];
  fields: DefinitionAuthoringFieldConfig[];
}

export interface DefinitionAuthoringConfig {
  activeStandards: string[];
  titleLabel: string;
  titleHint: string;
  descriptionLabel: string;
  descriptionHint: string;
  contentLabel: string;
  contentHint: string;
  exampleLabel: string;
  exampleHint: string;
  relationshipGuidance: string;
  sections: DefinitionAuthoringSectionConfig[];
}

function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringMetadata(metadata: Json | null | undefined, key: string) {
  if (!isRecord(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function readBooleanMetadata(metadata: Json | null | undefined, key: string) {
  if (!isRecord(metadata)) {
    return false;
  }

  return metadata[key] === true;
}

function setStringMetadata(target: Record<string, Json>, key: string, value: string) {
  const trimmed = value.trim();

  if (trimmed) {
    target[key] = trimmed;
  } else {
    delete target[key];
  }
}

function setBooleanMetadata(target: Record<string, Json>, key: string, value: boolean) {
  if (value) {
    target[key] = true;
  } else {
    delete target[key];
  }
}

const emptyDefinitionStandardsMetadataDraft: DefinitionStandardsMetadataDraft = {
  iri: "",
  namespace: "",
  section: "",
  group: "",
  sourceReference: "",
  sourceUrl: "",
  legalBasis: "",
  legalBasisRequired: false,
  topConcept: false,
};

export function readDefinitionStandardsMetadataDraft(metadata: Json | null | undefined): DefinitionStandardsMetadataDraft {
  return {
    iri: readStringMetadata(metadata, "iri"),
    namespace: readStringMetadata(metadata, "namespace"),
    section: readStringMetadata(metadata, "section"),
    group: readStringMetadata(metadata, "group"),
    sourceReference: readStringMetadata(metadata, "sourceReference") || readStringMetadata(metadata, "source"),
    sourceUrl: readStringMetadata(metadata, "sourceUrl"),
    legalBasis: readStringMetadata(metadata, "legalBasis"),
    legalBasisRequired: readBooleanMetadata(metadata, "legalBasisRequired"),
    topConcept: readBooleanMetadata(metadata, "topConcept"),
  };
}

export function createEmptyDefinitionStandardsMetadataDraft(): DefinitionStandardsMetadataDraft {
  return { ...emptyDefinitionStandardsMetadataDraft };
}

export function buildDefinitionStandardsMetadata(
  baseMetadata: Json | null | undefined,
  draft: DefinitionStandardsMetadataDraft,
): Json | null {
  const nextMetadata: Record<string, Json> = isRecord(baseMetadata)
    ? { ...baseMetadata }
    : {};

  setStringMetadata(nextMetadata, "iri", draft.iri);
  setStringMetadata(nextMetadata, "namespace", draft.namespace);
  setStringMetadata(nextMetadata, "section", draft.section);
  setStringMetadata(nextMetadata, "group", draft.group);
  setStringMetadata(nextMetadata, "sourceReference", draft.sourceReference);
  delete nextMetadata.source;
  setStringMetadata(nextMetadata, "sourceUrl", draft.sourceUrl);
  setStringMetadata(nextMetadata, "legalBasis", draft.legalBasis);
  setBooleanMetadata(nextMetadata, "legalBasisRequired", draft.legalBasisRequired);
  setBooleanMetadata(nextMetadata, "topConcept", draft.topConcept);

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
}

export function getDefinitionAuthoringConfig(settings: StandardsRuntimeSettings | null): DefinitionAuthoringConfig {
  const activeStandards = settings?.enabledStandards || [];
  const hasNlSbb = activeStandards.includes("nl-sbb");
  const hasSkos = activeStandards.includes("skos");
  const hasMim = activeStandards.includes("mim");
  const hasConceptSchemeStandards = hasNlSbb || hasSkos;

  const sections: DefinitionAuthoringSectionConfig[] = [];

  if (hasConceptSchemeStandards || hasMim) {
    sections.push({
      id: "identifiers-and-publication",
      title: "Identifiers and publication",
      description: hasConceptSchemeStandards && hasMim
        ? "These fields help keep the definition usable as both a concept entry and a modeled element."
        : hasNlSbb
          ? "These fields help publish the definition as a clearer NL-SBB-style concept."
          : hasSkos
            ? "These fields help publish the definition as a cleaner SKOS-style concept."
          : "These fields help keep the definition traceable in the starter MIM catalog.",
      standards: [...new Set([
        ...(hasNlSbb ? ["nl-sbb"] : []),
        ...(hasSkos ? ["skos"] : []),
        ...(hasMim ? ["mim"] : []),
      ])],
      fields: [
        {
          key: "iri",
          label: "Identifier IRI",
          description: "Useful for stable identifiers, publication, and cross-system references.",
          placeholder: "https://example.com/concepts/AccessPolicy",
          input: "url",
          standards: [...new Set([
            ...(hasNlSbb ? ["nl-sbb"] : []),
            ...(hasSkos ? ["skos"] : []),
            ...(hasMim ? ["mim"] : []),
          ])],
        },
        ...(hasConceptSchemeStandards
          ? [
              {
                key: "topConcept",
                label: "Top concept",
                description: hasNlSbb
                  ? "Marks the definition as a top concept within the current ontology-backed scheme."
                  : "Marks the definition as a top concept within the current ontology-backed concept scheme.",
                input: "switch",
                standards: hasNlSbb ? ["nl-sbb"] : ["skos"],
              } satisfies DefinitionAuthoringFieldConfig,
            ]
          : []),
        ...(hasNlSbb
          ? [
              {
                key: "sourceReference",
                label: "Source reference",
                description: "Record the source text, publication, or citation that grounds this definition.",
                placeholder: "AVG article 6",
                input: "text",
                standards: ["nl-sbb"],
              } satisfies DefinitionAuthoringFieldConfig,
              {
                key: "sourceUrl",
                label: "Source URL",
                description: "Optional link back to the source material when it is available online.",
                placeholder: "https://example.com/source",
                input: "url",
                standards: ["nl-sbb"],
              } satisfies DefinitionAuthoringFieldConfig,
              {
                key: "legalBasisRequired",
                label: "Legal basis expected",
                description: "Use when this concept is meant to carry explicit legal or regulatory grounding.",
                input: "switch",
                standards: ["nl-sbb"],
              } satisfies DefinitionAuthoringFieldConfig,
              {
                key: "legalBasis",
                label: "Legal basis citation",
                description: "Optional citation to the legal basis when the concept is explicitly flagged.",
                placeholder: "AVG article 6",
                input: "text",
                standards: ["nl-sbb"],
              } satisfies DefinitionAuthoringFieldConfig,
            ]
          : []),
      ],
    });
  }

  if (hasMim) {
    sections.push({
      id: "model-context",
      title: "Model context",
      description: "Starter MIM guidance uses these fields to keep context and grouping more explicit.",
      standards: ["mim"],
      fields: [
        {
          key: "namespace",
          label: "Namespace",
          description: "Optional namespace or short context marker for model organization.",
          placeholder: "security",
          input: "text",
          standards: ["mim"],
        },
        {
          key: "section",
          label: "Section",
          description: "Optional section marker used by the starter catalog for context consistency hints.",
          placeholder: "governance",
          input: "text",
          standards: ["mim"],
        },
        {
          key: "group",
          label: "Group",
          description: "Optional grouping field for starter MIM package/context hints.",
          placeholder: "policies",
          input: "text",
          standards: ["mim"],
        },
      ],
    });
  }

  return {
    activeStandards,
    titleLabel: hasConceptSchemeStandards ? "Preferred label / title" : "Title",
    titleHint: hasConceptSchemeStandards
      ? "Use the clearest human-facing preferred label for the concept."
      : "Use a clear title for the definition.",
    descriptionLabel: hasConceptSchemeStandards ? "Definition" : "Description",
    descriptionHint: hasConceptSchemeStandards
      ? "Capture what the concept means in a definition that others can reuse."
      : "Summarize the definition clearly.",
    contentLabel: hasConceptSchemeStandards ? "Context / scope note" : "Context",
    contentHint: hasConceptSchemeStandards
      ? "Add scope notes, interpretation guidance, or context that helps publishers and editors."
      : "Add supporting context, notes, or details.",
    exampleLabel: "Example",
    exampleHint: "Optional example or usage note.",
    relationshipGuidance: hasNlSbb
      ? "When NL-SBB is active, prefer broader, narrower, or related before falling back to generic app relations."
      : hasSkos
        ? "When SKOS is active, prefer broader, narrower, or related before falling back to generic app relations."
      : hasMim
        ? "When MIM is active, prefer structural model relations before falling back to custom labels."
        : "Choose a clear relation type or use a custom relation when needed.",
    sections,
  };
}

function createConceptRelationChoice(input: {
  standardId: "nl-sbb" | "skos";
  id: string;
  label: string;
  explanation: string;
  selectedType: RelationshipSelection;
  customType?: string;
  kind: "broader" | "narrower" | "related";
  predicateKey: string;
  predicateIri: string;
}): StandardsRelationSuggestion {
  return {
    id: input.id,
    standardId: input.standardId,
    label: input.label,
    explanation: input.explanation,
    selectedType: input.selectedType,
    customType: input.customType,
    metadata: {
      standards: {
        relation: {
          kind: input.kind,
          label: input.label.replace(/^Use\s+/i, "").toLowerCase(),
          predicateKey: input.predicateKey,
          predicateIri: input.predicateIri,
        },
      },
    },
  };
}

export function getStandardsFirstRelationshipChoices(settings: StandardsRuntimeSettings | null): StandardsRelationSuggestion[] {
  const enabledStandards = settings?.enabledStandards || [];

  if (enabledStandards.includes("nl-sbb")) {
    return [
      createConceptRelationChoice({
        standardId: "nl-sbb",
        id: "nl-sbb-primary-broader",
        label: "Use broader",
        explanation: "Recommended for concept hierarchy links where the source is broader than the target.",
        selectedType: "is_a",
        kind: "broader",
        predicateKey: "broader",
        predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
      }),
      createConceptRelationChoice({
        standardId: "nl-sbb",
        id: "nl-sbb-primary-narrower",
        label: "Use narrower",
        explanation: "Recommended when the source is the narrower concept and should retain SKOS narrower semantics.",
        selectedType: CUSTOM_RELATION_TYPE,
        customType: "narrower",
        kind: "narrower",
        predicateKey: "narrower",
        predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
      }),
      createConceptRelationChoice({
        standardId: "nl-sbb",
        id: "nl-sbb-primary-related",
        label: "Use related",
        explanation: "Recommended for associative concept links without hierarchy.",
        selectedType: "related_to",
        kind: "related",
        predicateKey: "related",
        predicateIri: "http://www.w3.org/2004/02/skos/core#related",
      }),
    ];
  }

  if (enabledStandards.includes("skos")) {
    return [
      createConceptRelationChoice({
        standardId: "skos",
        id: "skos-primary-broader",
        label: "Use broader",
        explanation: "Recommended for SKOS hierarchy links where the source is broader than the target.",
        selectedType: "is_a",
        kind: "broader",
        predicateKey: "broader",
        predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
      }),
      createConceptRelationChoice({
        standardId: "skos",
        id: "skos-primary-narrower",
        label: "Use narrower",
        explanation: "Recommended when the source is the narrower concept and should retain explicit SKOS narrower semantics.",
        selectedType: CUSTOM_RELATION_TYPE,
        customType: "narrower",
        kind: "narrower",
        predicateKey: "narrower",
        predicateIri: "http://www.w3.org/2004/02/skos/core#narrower",
      }),
      createConceptRelationChoice({
        standardId: "skos",
        id: "skos-primary-related",
        label: "Use related",
        explanation: "Recommended for associative SKOS concept links without hierarchy.",
        selectedType: "related_to",
        kind: "related",
        predicateKey: "related",
        predicateIri: "http://www.w3.org/2004/02/skos/core#related",
      }),
    ];
  }

  if (enabledStandards.includes("mim")) {
    return [
      {
        id: "mim-primary-is-a",
        standardId: "mim",
        label: "Use subclass / is a",
        explanation: "Recommended for starter MIM inheritance-style modeling links.",
        selectedType: "is_a",
      },
      {
        id: "mim-primary-part-of",
        standardId: "mim",
        label: "Use part of",
        explanation: "Recommended for starter MIM structural containment links.",
        selectedType: "part_of",
      },
      {
        id: "mim-primary-depends-on",
        standardId: "mim",
        label: "Use depends on",
        explanation: "Recommended when the relation expresses dependency rather than hierarchy.",
        selectedType: "depends_on",
      },
    ];
  }

  return [];
}

export function mergeStandardsFirstRelationshipChoices(
  primaryChoices: StandardsRelationSuggestion[],
  complianceSuggestions: StandardsRelationSuggestion[],
) {
  const seen = new Set(
    primaryChoices.map((choice) => `${choice.selectedType}::${choice.customType || ""}::${choice.label.toLowerCase()}`),
  );

  return [
    ...primaryChoices,
    ...complianceSuggestions.filter((choice) => {
      const key = `${choice.selectedType}::${choice.customType || ""}::${choice.label.toLowerCase()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }),
  ];
}

export function getFallbackRelationshipTypes(settings: StandardsRuntimeSettings | null) {
  const enabledStandards = settings?.enabledStandards || [];
  const excluded = new Set<string>();

  if (enabledStandards.includes("nl-sbb") || enabledStandards.includes("skos")) {
    excluded.add("is_a");
    excluded.add("related_to");
  } else if (enabledStandards.includes("mim")) {
    excluded.add("is_a");
    excluded.add("part_of");
    excluded.add("depends_on");
  }

  return predefinedRelationshipTypes.filter((type) => !excluded.has(type));
}
