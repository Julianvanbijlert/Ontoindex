import type { StandardsFindingInput, StandardsPackDefinition, StandardsRuleDefinition } from "@/lib/standards/engine/types";
import type { StandardsConcept, StandardsConceptRelation, StandardsConceptScheme, StandardsModel } from "@/lib/standards/model";
import {
  createFinding,
  createInvalidIriFinding,
  createPlaceholderRule,
  createRuleDefinition,
  isAbsoluteIri,
  isNonEmptyString,
  normalizeComparisonValue,
} from "@/lib/standards/profiles/shared";
import { getSkosRelationSuggestions } from "@/lib/standards/profiles/skos/suggestions";

const createRule = (input: Omit<StandardsRuleDefinition, "implementationStatus"> & { implementationStatus?: StandardsRuleDefinition["implementationStatus"] }) =>
  createRuleDefinition({ ...input, implementationStatus: input.implementationStatus || "starter" });

function validateOptionalIri(
  findings: StandardsFindingInput[],
  message: string,
  path: string,
  entityKind: string,
  entityId: string,
  field: string,
  iri?: string,
) {
  if (!iri) {
    return;
  }

  if (!isAbsoluteIri(iri)) {
    findings.push(
      createInvalidIriFinding({
        message,
        path,
        entityKind,
        entityId,
        field,
      }),
    );
  }
}

function validateScheme(item: StandardsConceptScheme) {
  const findings: StandardsFindingInput[] = [];

  if (!isNonEmptyString(item.label)) {
    findings.push(createFinding({
      message: `Concept scheme "${item.id}" should have a readable label in this SKOS starter catalog.`,
      path: `conceptSchemes[${item.id}].label`,
      entityKind: "conceptScheme",
      entityId: item.id,
      field: "label",
    }));
  }

  if (!item.iri) {
    findings.push(createFinding({
      message: `Concept scheme "${item.id}" should expose a stable IRI in this SKOS starter catalog.`,
      path: `conceptSchemes[${item.id}].iri`,
      entityKind: "conceptScheme",
      entityId: item.id,
      field: "iri",
      severity: "warning",
    }));
  }

  validateOptionalIri(
    findings,
    `Concept scheme "${item.id}" has an invalid IRI.`,
    `conceptSchemes[${item.id}].iri`,
    "conceptScheme",
    item.id,
    "iri",
    item.iri,
  );

  return findings;
}

function validateConcept(item: StandardsConcept, schemeIds: Set<string>) {
  const findings: StandardsFindingInput[] = [];

  if (!schemeIds.has(item.schemeId)) {
    findings.push(createFinding({
      message: `Concept "${item.id}" references unknown concept scheme "${item.schemeId}".`,
      path: `concepts[${item.id}].schemeId`,
      entityKind: "concept",
      entityId: item.id,
      field: "schemeId",
      relatedEntityId: item.schemeId,
    }));
  }

  if (!isNonEmptyString(item.prefLabel)) {
    findings.push(createFinding({
      message: `Concept "${item.id}" should expose a preferred label in this SKOS starter catalog.`,
      path: `concepts[${item.id}].prefLabel`,
      entityKind: "concept",
      entityId: item.id,
      field: "prefLabel",
    }));
  }

  if (!item.iri) {
    findings.push(createFinding({
      message: `Concept "${item.id}" should expose a stable identifier IRI in this SKOS starter catalog.`,
      path: `concepts[${item.id}].iri`,
      entityKind: "concept",
      entityId: item.id,
      field: "iri",
      severity: "warning",
    }));
  }

  validateOptionalIri(
    findings,
    `Concept "${item.id}" has an invalid IRI.`,
    `concepts[${item.id}].iri`,
    "concept",
    item.id,
    "iri",
    item.iri,
  );

  if (item.altLabels?.some((altLabel) => normalizeComparisonValue(altLabel) === normalizeComparisonValue(item.prefLabel))) {
    findings.push(createFinding({
      message: `Concept "${item.id}" uses an altLabel that duplicates the preferred label.`,
      path: `concepts[${item.id}].altLabels`,
      entityKind: "concept",
      entityId: item.id,
      field: "altLabels",
      severity: "warning",
    }));
  }

  if (item.topConceptOfSchemeId && item.topConceptOfSchemeId !== item.schemeId) {
    findings.push(createFinding({
      message: `Concept "${item.id}" is marked as a top concept for scheme "${item.topConceptOfSchemeId}" but belongs to scheme "${item.schemeId}".`,
      path: `concepts[${item.id}].topConceptOfSchemeId`,
      entityKind: "concept",
      entityId: item.id,
      field: "topConceptOfSchemeId",
      relatedEntityId: item.topConceptOfSchemeId,
      severity: "warning",
    }));
  }

  return findings;
}

function validateRelation(item: StandardsConceptRelation, conceptsById: Map<string, StandardsConcept>) {
  const findings: StandardsFindingInput[] = [];
  const sourceConcept = conceptsById.get(item.sourceConceptId);
  const targetConcept = conceptsById.get(item.targetConceptId);

  if (!sourceConcept) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" references unknown source concept "${item.sourceConceptId}".`,
      path: `conceptRelations[${item.id}].sourceConceptId`,
      entityKind: "conceptRelation",
      entityId: item.id,
      field: "sourceConceptId",
      relatedEntityId: item.sourceConceptId,
    }));
  }

  if (!targetConcept) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" references unknown target concept "${item.targetConceptId}".`,
      path: `conceptRelations[${item.id}].targetConceptId`,
      entityKind: "conceptRelation",
      entityId: item.id,
      field: "targetConceptId",
      relatedEntityId: item.targetConceptId,
    }));
  }

  validateOptionalIri(
    findings,
    `Concept relation "${item.id}" has an invalid predicate IRI.`,
    `conceptRelations[${item.id}].predicateIri`,
    "conceptRelation",
    item.id,
    "predicateIri",
    item.predicateIri,
  );

  if (sourceConcept && targetConcept && (item.kind === "broader" || item.kind === "narrower") && sourceConcept.id === targetConcept.id) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" cannot create a broader or narrower self-reference.`,
      path: `conceptRelations[${item.id}]`,
      entityKind: "conceptRelation",
      entityId: item.id,
      relatedEntityId: targetConcept.id,
    }));
  }

  if (sourceConcept && targetConcept && item.kind === "related" && sourceConcept.id === targetConcept.id) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" should not relate a concept to itself in this SKOS starter catalog.`,
      path: `conceptRelations[${item.id}]`,
      entityKind: "conceptRelation",
      entityId: item.id,
      relatedEntityId: targetConcept.id,
      severity: "warning",
    }));
  }

  if (
    sourceConcept
    && targetConcept
    && (item.kind === "broader" || item.kind === "narrower")
    && sourceConcept.schemeId !== targetConcept.schemeId
  ) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" connects hierarchy concepts from different schemes ("${sourceConcept.schemeId}" and "${targetConcept.schemeId}").`,
      path: `conceptRelations[${item.id}]`,
      entityKind: "conceptRelation",
      entityId: item.id,
      relatedEntityId: targetConcept.id,
      severity: "warning",
    }));
  }

  return findings;
}

function hierarchyCycles(model: StandardsModel) {
  const bySource = new Map<string, string[]>();

  model.conceptRelations.forEach((item) => {
    if (item.kind === "broader" || item.kind === "narrower") {
      bySource.set(item.sourceConceptId, [...(bySource.get(item.sourceConceptId) || []), item.targetConceptId]);
    }
  });

  const findings: StandardsFindingInput[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const walk = (conceptId: string, stack: string[]) => {
    if (visiting.has(conceptId)) {
      const cycle = [...stack.slice(stack.indexOf(conceptId)), conceptId];
      findings.push(createFinding({
        message: `Hierarchy cycle detected: ${cycle.join(" -> ")}.`,
        path: `concepts[${conceptId}]`,
        entityKind: "concept",
        entityId: conceptId,
        severity: "warning",
        metadata: { cycle },
      }));
      return;
    }

    if (visited.has(conceptId)) {
      return;
    }

    visited.add(conceptId);
    visiting.add(conceptId);
    (bySource.get(conceptId) || []).forEach((nextId) => walk(nextId, [...stack, conceptId]));
    visiting.delete(conceptId);
  };

  [...bySource.keys()].forEach((conceptId) => walk(conceptId, []));
  return findings;
}

const requiredRules = [
  createRule({
    ruleId: "skos_scheme_exists",
    title: "SKOS concept scheme required",
    description: "Concepts should belong to at least one concept scheme.",
    rationale: "A ConceptScheme anchors concept ownership, publication, and navigation context.",
    explanation: "Create or import a concept scheme before publishing concepts with this SKOS starter catalog.",
    defaultSeverity: "error",
    category: "required",
    scope: "model",
    requiresGlobalContext: true,
    validate: ({ model }) => model.concepts.length > 0 && model.conceptSchemes.length === 0
      ? [createFinding({
        message: "The canonical model contains concepts but no concept schemes.",
        path: "conceptSchemes",
        entityKind: "conceptScheme",
        entityId: "conceptSchemes",
      })]
      : [],
  }),
  createRule({
    ruleId: "skos_missing_scheme_label",
    title: "SKOS scheme label recommended in starter catalog",
    description: "Concept schemes should expose a readable label in the starter catalog.",
    rationale: "Named schemes make SKOS publication and curation easier to interpret.",
    explanation: "Add a readable scheme label so editors and consumers can understand what the scheme covers.",
    defaultSeverity: "warning",
    category: "required",
    scope: "conceptScheme",
    requiresGlobalContext: false,
    validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "label")),
  }),
  createRule({
    ruleId: "skos_scheme_identifier_recommended",
    title: "SKOS scheme identifier recommended in starter catalog",
    description: "Concept schemes should expose a stable IRI in the starter catalog.",
    rationale: "Stable scheme IRIs support publishable SKOS concept scheme references.",
    explanation: "Add an absolute scheme IRI so the concept scheme can be referenced and published consistently.",
    defaultSeverity: "warning",
    category: "required",
    scope: "conceptScheme",
    requiresGlobalContext: false,
    validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "iri" && finding.severity === "warning")),
  }),
  createRule({
    ruleId: "skos_invalid_scheme_iri",
    title: "SKOS scheme IRI must be absolute",
    description: "Concept scheme IRIs should be absolute when present.",
    rationale: "Absolute scheme IRIs keep SKOS exchange and publication stable across systems.",
    explanation: "Replace the malformed scheme IRI with an absolute IRI so SKOS publication remains reliable.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "conceptScheme",
    requiresGlobalContext: false,
    validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "iri" && !finding.severity)),
  }),
  createRule({
    ruleId: "skos_unknown_scheme",
    title: "SKOS concept scheme reference must resolve",
    description: "Concepts should point to a known concept scheme.",
    rationale: "A concept without a valid scheme cannot participate cleanly in SKOS publication.",
    explanation: "Correct the scheme reference or add the missing concept scheme before publication.",
    defaultSeverity: "error",
    category: "required",
    scope: "concept",
    requiresGlobalContext: true,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "schemeId"));
    },
  }),
  createRule({
    ruleId: "skos_missing_pref_label",
    title: "SKOS preferred label recommended in starter catalog",
    description: "Concepts should expose a preferred label in the starter catalog.",
    rationale: "Preferred labels are the primary human-facing names in SKOS concept publication.",
    explanation: "Add a preferred label so the concept can be recognized and reused consistently.",
    defaultSeverity: "warning",
    category: "required",
    scope: "concept",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "prefLabel"));
    },
  }),
  createRule({
    ruleId: "skos_concept_identifier_recommended",
    title: "SKOS concept identifier recommended in starter catalog",
    description: "Concepts should expose a stable IRI in the starter catalog.",
    rationale: "Concept identifiers support linked-data publication and alignment.",
    explanation: "Add an absolute concept IRI so the concept can be referenced consistently in publication and integration flows.",
    defaultSeverity: "warning",
    category: "required",
    scope: "concept",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "iri" && finding.severity === "warning"));
    },
  }),
  createRule({
    ruleId: "skos_invalid_concept_iri",
    title: "SKOS concept IRI must be absolute",
    description: "Concept IRIs should be absolute when present.",
    rationale: "Absolute concept IRIs make SKOS publication and reuse safer across systems.",
    explanation: "Replace the malformed concept IRI with an absolute IRI so the concept can be published and reused reliably.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "concept",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "iri" && !finding.severity));
    },
  }),
] satisfies StandardsRuleDefinition[];

const consistencyRules = [
  createRule({
    ruleId: "skos_alt_label_duplicates_pref_label",
    title: "SKOS altLabel should not duplicate prefLabel",
    description: "Alternative labels should add useful terminology rather than repeat the preferred label.",
    rationale: "Duplicate labels add noise without improving findability or navigation.",
    explanation: "Remove or change the duplicated altLabel so it contributes a genuine synonym or variant.",
    defaultSeverity: "warning",
    category: "consistency",
    scope: "concept",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "altLabels"));
    },
  }),
  createRule({
    ruleId: "skos_unknown_relation_source",
    title: "SKOS relation source must resolve",
    description: "Concept relations should point to a known source concept.",
    rationale: "A relation with a missing source cannot be projected reliably into a SKOS publication profile.",
    explanation: "Correct the source concept id or add the missing concept before publication.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "conceptRelation",
    requiresGlobalContext: true,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "sourceConceptId"));
    },
  }),
  createRule({
    ruleId: "skos_unknown_relation_target",
    title: "SKOS relation target must resolve",
    description: "Concept relations should point to a known target concept.",
    rationale: "A relation with a missing target cannot be projected reliably into a SKOS publication profile.",
    explanation: "Correct the target concept id or add the missing concept before publication.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "conceptRelation",
    requiresGlobalContext: true,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "targetConceptId"));
    },
  }),
  createRule({
    ruleId: "skos_invalid_predicate_iri",
    title: "SKOS predicate IRI must be absolute",
    description: "Predicate IRIs should be absolute when present.",
    rationale: "Absolute predicate IRIs help keep SKOS relation semantics interoperable outside the app.",
    explanation: "Replace the malformed predicate IRI with an absolute IRI so the relation can be published consistently.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "conceptRelation",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "predicateIri"));
    },
  }),
  createRule({
    ruleId: "skos_hierarchy_no_self_reference",
    title: "SKOS hierarchy should not self-reference",
    description: "Broader and narrower relations should not point back to the same concept.",
    rationale: "Self-referential hierarchy links are structurally broken.",
    explanation: "Remove the self-referential hierarchy link or point it to the intended related concept.",
    defaultSeverity: "error",
    category: "consistency",
    scope: "conceptRelation",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => !finding.field && !finding.severity && finding.relatedEntityId === item.targetConceptId && item.sourceConceptId === item.targetConceptId));
    },
  }),
  createRule({
    ruleId: "skos_related_no_self_reference",
    title: "SKOS related relation should not self-reference in starter catalog",
    description: "Related relations should usually connect distinct concepts in the starter catalog.",
    rationale: "A concept related to itself adds little semantic value and often signals an authoring mistake.",
    explanation: "Replace the self-related link with a relation to the intended concept or remove it if it was added by mistake.",
    defaultSeverity: "warning",
    category: "best-practice",
    scope: "conceptRelation",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => !finding.field && finding.severity === "warning" && finding.relatedEntityId === item.targetConceptId && item.sourceConceptId === item.targetConceptId));
    },
  }),
  createRule({
    ruleId: "skos_hierarchy_cycle",
    title: "SKOS hierarchy should not form cycles",
    description: "Broader and narrower relations should remain acyclic in this starter pack.",
    rationale: "Hierarchy cycles make broader and narrower semantics ambiguous.",
    explanation: "Break the hierarchy cycle so the concept structure remains understandable and publishable.",
    defaultSeverity: "warning",
    category: "consistency",
    scope: "model",
    requiresGlobalContext: true,
    validate: ({ model }) => hierarchyCycles(model),
  }),
  createRule({
    ruleId: "skos_cross_scheme_hierarchy",
    title: "SKOS cross-scheme hierarchy warning",
    description: "Hierarchical links should usually stay inside one concept scheme in this starter pack.",
    rationale: "Cross-scheme broader and narrower links often signal scheme-boundary problems.",
    explanation: "Review the scheme boundaries or replace the hierarchy with a looser relation if the concepts belong to different schemes.",
    defaultSeverity: "warning",
    category: "consistency",
    scope: "conceptRelation",
    requiresGlobalContext: true,
    validate: ({ model }) => {
      const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
      return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => !finding.field && finding.severity === "warning" && !finding.metadata));
    },
  }),
  createRule({
    ruleId: "skos_top_concept_consistency",
    title: "SKOS top concept marker should match scheme membership",
    description: "When top-concept metadata is present, it should align with the concept's own scheme.",
    rationale: "Mismatched top-concept markers can mislead publication tooling and editors.",
    explanation: "Align the top-concept marker with the concept's actual scheme or remove the marker until the scheme is confirmed.",
    defaultSeverity: "warning",
    category: "consistency",
    scope: "concept",
    requiresGlobalContext: false,
    validate: ({ model }) => {
      const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
      return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "topConceptOfSchemeId"));
    },
  }),
] satisfies StandardsRuleDefinition[];

const placeholderRules = [
  createPlaceholderRule({
    ruleId: "skos_hidden_label_quality_placeholder",
    title: "SKOS hiddenLabel quality placeholder",
    description: "Starter placeholder for hiddenLabel quality and conflict checks.",
    rationale: "The current canonical model does not yet carry a first-class hiddenLabel surface across authoring and imports, so hiddenLabel checks should remain explicit placeholders.",
    explanation: "This placeholder reserves space for future hiddenLabel quality checks once the canonical model carries that detail cleanly.",
    scope: "concept",
    requiresGlobalContext: false,
  }),
  createPlaceholderRule({
    ruleId: "skos_related_symmetry_placeholder",
    title: "SKOS related symmetry placeholder",
    description: "Starter placeholder for stronger related-relation symmetry checks.",
    rationale: "Symmetry checks need a clearer authoritative SKOS catalog and, in some flows, fuller graph context than the current starter model provides.",
    explanation: "This placeholder reserves space for future related symmetry validation.",
    scope: "model",
    requiresGlobalContext: true,
  }),
  createPlaceholderRule({
    ruleId: "skos_mapping_properties_placeholder",
    title: "SKOS mapping properties placeholder",
    description: "Starter placeholder for broaderMatch, exactMatch, closeMatch, and related mapping checks.",
    rationale: "The current canonical model does not yet encode explicit SKOS mapping properties, so deeper mapping semantics should remain honest placeholders.",
    explanation: "This placeholder reserves space for future SKOS mapping-property checks once the canonical model represents them directly.",
    scope: "publication",
    requiresGlobalContext: false,
  }),
  createPlaceholderRule({
    ruleId: "skos_publication_profile_placeholder",
    title: "SKOS publication profile placeholder",
    description: "Starter placeholder for richer publication-profile checks such as language-tag completeness and typed publication assertions.",
    rationale: "The current canonical model stores plain labels and definitions rather than a full SKOS publication profile with language-tagged assertions.",
    explanation: "This placeholder reserves space for future SKOS publication-profile checks when the repository models richer publication detail.",
    scope: "publication",
    requiresGlobalContext: false,
  }),
] satisfies StandardsRuleDefinition[];

export const skosStandardsPack: StandardsPackDefinition = {
  standardId: "skos",
  label: "SKOS",
  description: "Starter SKOS catalog for concept schemes, labels, hierarchy integrity, and concept publication structure.",
  getRelationSuggestions: getSkosRelationSuggestions,
  rules: [...requiredRules, ...consistencyRules, ...placeholderRules],
};
