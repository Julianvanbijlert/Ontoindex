import type {
  StandardsFindingInput,
  StandardsPackDefinition,
} from "@/lib/standards/engine/types";
import type {
  StandardsConcept,
  StandardsConceptRelation,
  StandardsConceptScheme,
} from "@/lib/standards/model";
import {
  createFinding,
  createInvalidIriFinding,
  isAbsoluteIri,
  isNonEmptyString,
} from "@/lib/standards/profiles/shared";
import { getNlSbbRelationSuggestions } from "@/lib/standards/profiles/nl-sbb/suggestions";

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
    findings.push(createInvalidIriFinding({
      message,
      path,
      entityKind,
      entityId,
      field,
    }));
  }
}

function validateNlSbbScheme(item: StandardsConceptScheme) {
  const findings: StandardsFindingInput[] = [];

  if (!isNonEmptyString(item.label)) {
    findings.push(createFinding({
      message: `Concept scheme "${item.id}" must have a non-empty label.`,
      path: `conceptSchemes[${item.id}].label`,
      entityKind: "conceptScheme",
      entityId: item.id,
      field: "label",
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

function validateNlSbbConcept(item: StandardsConcept, schemeIds: Set<string>) {
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
      message: `Concept "${item.id}" must have a non-empty preferred label.`,
      path: `concepts[${item.id}].prefLabel`,
      entityKind: "concept",
      entityId: item.id,
      field: "prefLabel",
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

  return findings;
}

function validateNlSbbConceptRelation(
  item: StandardsConceptRelation,
  conceptsById: Map<string, StandardsConcept>,
) {
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

  const predicateKey = item.predicateKey?.trim().toLowerCase() || "";

  if (
    item.kind === "custom"
    && !item.predicateIri
    && predicateKey
    && !["broader", "narrower", "related"].includes(predicateKey)
  ) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" uses app-local relation key "${predicateKey}" without an explicit standards predicate IRI mapping.`,
      path: `conceptRelations[${item.id}]`,
      entityKind: "conceptRelation",
      entityId: item.id,
      severity: "warning",
      metadata: {
        predicateKey,
      },
    }));
  }

  if (
    sourceConcept
    && targetConcept
    && (item.kind === "broader" || item.kind === "narrower")
    && sourceConcept.schemeId !== targetConcept.schemeId
  ) {
    findings.push(createFinding({
      message: `Concept relation "${item.id}" connects concepts from different schemes ("${sourceConcept.schemeId}" and "${targetConcept.schemeId}").`,
      path: `conceptRelations[${item.id}]`,
      entityKind: "conceptRelation",
      entityId: item.id,
      relatedEntityId: targetConcept.id,
    }));
  }

  return findings;
}

export const nlSbbStandardsPack: StandardsPackDefinition = {
  standardId: "nl-sbb",
  label: "NL-SBB",
  description: "Initial NL-SBB starter pack with concept-scheme checks and SKOS-oriented relation suggestions.",
  getRelationSuggestions: getNlSbbRelationSuggestions,
  rules: [
    {
      ruleId: "nl_sbb_missing_scheme_label",
      title: "NL-SBB missing scheme label",
      description: "Concept schemes should be named.",
      explanation: "Named schemes make classification and export summaries much clearer.",
      defaultSeverity: "error",
      validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateNlSbbScheme(item).filter((finding) => finding.field === "label")),
    },
    {
      ruleId: "nl_sbb_invalid_scheme_iri",
      title: "NL-SBB invalid scheme IRI",
      description: "Concept scheme IRIs should be absolute when present.",
      explanation: "Absolute scheme IRIs are needed for stable cross-system exchange.",
      defaultSeverity: "error",
      validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateNlSbbScheme(item).filter((finding) => finding.field === "iri")),
    },
    {
      ruleId: "nl_sbb_unknown_scheme",
      title: "NL-SBB unknown concept scheme",
      description: "Concepts should point to a known scheme.",
      explanation: "A concept without a valid scheme cannot participate cleanly in NL-SBB-style organization.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
        return model.concepts.flatMap((item) => validateNlSbbConcept(item, schemeIds).filter((finding) => finding.field === "schemeId"));
      },
    },
    {
      ruleId: "nl_sbb_missing_pref_label",
      title: "NL-SBB missing preferred label",
      description: "Concepts should expose a preferred label.",
      explanation: "The current NL-SBB starter pack expects a readable preferred label for each concept.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
        return model.concepts.flatMap((item) => validateNlSbbConcept(item, schemeIds).filter((finding) => finding.field === "prefLabel"));
      },
    },
    {
      ruleId: "nl_sbb_invalid_concept_iri",
      title: "NL-SBB invalid concept IRI",
      description: "Concept IRIs should be absolute when present.",
      explanation: "Absolute concept IRIs make external alignment and linked-data exports safer.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
        return model.concepts.flatMap((item) => validateNlSbbConcept(item, schemeIds).filter((finding) => finding.field === "iri"));
      },
    },
    {
      ruleId: "nl_sbb_unknown_relation_source",
      title: "NL-SBB unknown relation source",
      description: "Concept relations should point to a known source concept.",
      explanation: "A concept relation with a missing source cannot be projected reliably.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
        return model.conceptRelations.flatMap((item) => validateNlSbbConceptRelation(item, conceptsById).filter((finding) => finding.field === "sourceConceptId"));
      },
    },
    {
      ruleId: "nl_sbb_unknown_relation_target",
      title: "NL-SBB unknown relation target",
      description: "Concept relations should point to a known target concept.",
      explanation: "A concept relation with a missing target cannot be projected reliably.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
        return model.conceptRelations.flatMap((item) => validateNlSbbConceptRelation(item, conceptsById).filter((finding) => finding.field === "targetConceptId"));
      },
    },
    {
      ruleId: "nl_sbb_invalid_predicate_iri",
      title: "NL-SBB invalid predicate IRI",
      description: "Predicate IRIs should be absolute when present.",
      explanation: "Absolute predicate IRIs help keep custom semantic mappings interoperable.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
        return model.conceptRelations.flatMap((item) => validateNlSbbConceptRelation(item, conceptsById).filter((finding) => finding.field === "predicateIri"));
      },
    },
    {
      ruleId: "nl_sbb_unmapped_relation_semantics",
      title: "NL-SBB unmapped relation semantics",
      description: "Custom concept relations should ideally carry an explicit predicate mapping.",
      explanation: "This starter NL-SBB pack warns when a custom relation label does not map to a known SKOS-like predicate.",
      defaultSeverity: "warning",
      validate: ({ model }) => {
        const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
        return model.conceptRelations.flatMap((item) => validateNlSbbConceptRelation(item, conceptsById).filter((finding) => finding.path === `conceptRelations[${item.id}]` && finding.severity === "warning"));
      },
    },
    {
      ruleId: "nl_sbb_cross_scheme_relation",
      title: "NL-SBB cross-scheme hierarchy",
      description: "Hierarchical links should stay inside one concept scheme in this starter pack.",
      explanation: "Cross-scheme broader and narrower links are usually a sign that the concept scheme boundaries need attention.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));
        return model.conceptRelations.flatMap((item) => validateNlSbbConceptRelation(item, conceptsById).filter((finding) => finding.path === `conceptRelations[${item.id}]` && !finding.severity));
      },
    },
  ],
};
