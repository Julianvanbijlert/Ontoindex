import type { StandardsFindingInput, StandardsPackDefinition, StandardsRuleDefinition } from "@/lib/standards/engine/types";
import type { StandardsConcept, StandardsConceptRelation, StandardsConceptScheme, StandardsModel } from "@/lib/standards/model";
import {
  createFinding,
  createInvalidIriFinding,
  createPlaceholderRule,
  createRuleDefinition,
  isAbsoluteIri,
  isLikelyHttpUrl,
  isNonEmptyString,
  normalizeComparisonValue,
} from "@/lib/standards/profiles/shared";
import { getNlSbbRelationSuggestions } from "@/lib/standards/profiles/nl-sbb/suggestions";

const createRule = (input: Omit<StandardsRuleDefinition, "implementationStatus"> & { implementationStatus?: StandardsRuleDefinition["implementationStatus"] }) =>
  createRuleDefinition({ ...input, implementationStatus: input.implementationStatus || "starter" });

const hierarchyPredicateIriByKind = {
  broader: "http://www.w3.org/2004/02/skos/core#broader",
  narrower: "http://www.w3.org/2004/02/skos/core#narrower",
  related: "http://www.w3.org/2004/02/skos/core#related",
} as const;

function isHierarchyKind(value: StandardsConceptRelation["kind"]): value is "broader" | "narrower" {
  return value === "broader" || value === "narrower";
}

function getExpectedInverseKind(kind: "broader" | "narrower") {
  return kind === "broader" ? "narrower" : "broader";
}

function normalizeRelationSemantic(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase() || "";

  if (normalized.endsWith("#broader") || normalized === "broader") {
    return "broader";
  }

  if (normalized.endsWith("#narrower") || normalized === "narrower") {
    return "narrower";
  }

  if (normalized.endsWith("#related") || normalized === "related") {
    return "related";
  }

  return null;
}

function validateOptionalIri(findings: StandardsFindingInput[], message: string, path: string, entityKind: string, entityId: string, field: string, iri?: string) {
  if (!iri) return;
  if (!isAbsoluteIri(iri)) findings.push(createInvalidIriFinding({ message, path, entityKind, entityId, field }));
}

function validateScheme(item: StandardsConceptScheme) {
  const findings: StandardsFindingInput[] = [];
  if (!isNonEmptyString(item.label)) findings.push(createFinding({ message: `Concept scheme "${item.id}" must have a non-empty label.`, path: `conceptSchemes[${item.id}].label`, entityKind: "conceptScheme", entityId: item.id, field: "label" }));
  if (!item.iri) findings.push(createFinding({ message: `Concept scheme "${item.id}" should expose a stable identifier IRI.`, path: `conceptSchemes[${item.id}].iri`, entityKind: "conceptScheme", entityId: item.id, field: "iri", severity: "warning" }));
  validateOptionalIri(findings, `Concept scheme "${item.id}" has an invalid IRI.`, `conceptSchemes[${item.id}].iri`, "conceptScheme", item.id, "iri", item.iri);
  return findings;
}

function validateConcept(item: StandardsConcept, schemeIds: Set<string>) {
  const findings: StandardsFindingInput[] = [];
  if (!schemeIds.has(item.schemeId)) findings.push(createFinding({ message: `Concept "${item.id}" references unknown concept scheme "${item.schemeId}".`, path: `concepts[${item.id}].schemeId`, entityKind: "concept", entityId: item.id, field: "schemeId", relatedEntityId: item.schemeId }));
  if (!isNonEmptyString(item.prefLabel)) findings.push(createFinding({ message: `Concept "${item.id}" must have a non-empty preferred label.`, path: `concepts[${item.id}].prefLabel`, entityKind: "concept", entityId: item.id, field: "prefLabel" }));
  if (!item.definition?.trim()) findings.push(createFinding({ message: `Concept "${item.id}" should include a definition in this NL-SBB starter catalog.`, path: `concepts[${item.id}].definition`, entityKind: "concept", entityId: item.id, field: "definition", severity: "warning" }));
  if (!item.iri) findings.push(createFinding({ message: `Concept "${item.id}" should expose a stable identifier IRI in this starter catalog.`, path: `concepts[${item.id}].iri`, entityKind: "concept", entityId: item.id, field: "iri", severity: "warning" }));
  validateOptionalIri(findings, `Concept "${item.id}" has an invalid IRI.`, `concepts[${item.id}].iri`, "concept", item.id, "iri", item.iri);
  if (item.altLabels?.some((altLabel) => normalizeComparisonValue(altLabel) === normalizeComparisonValue(item.prefLabel))) findings.push(createFinding({ message: `Concept "${item.id}" uses an altLabel that duplicates the preferred label.`, path: `concepts[${item.id}].altLabels`, entityKind: "concept", entityId: item.id, field: "altLabels", severity: "warning" }));
  if (item.definition?.trim() && (/^[A-Za-z0-9:_#-]+$/.test(item.definition.trim()) || item.definition.trim().length < 12)) findings.push(createFinding({ message: `Concept "${item.id}" definition looks terse or code-like for public-facing editorial guidance.`, path: `concepts[${item.id}].definition`, entityKind: "concept", entityId: item.id, field: "definition", severity: "info" }));
  const hasSourceReference = !!item.sourceReference?.trim();
  const hasValidSourceUrl = !!item.sourceUrl?.trim() && isLikelyHttpUrl(item.sourceUrl);
  if (!hasSourceReference && !hasValidSourceUrl) findings.push(createFinding({ message: `Concept "${item.id}" does not record a usable source reference yet in the starter publication guidance.`, path: `concepts[${item.id}].sourceReference`, entityKind: "concept", entityId: item.id, field: "sourceReference", severity: "info" }));
  if (item.sourceUrl?.trim() && !isLikelyHttpUrl(item.sourceUrl)) findings.push(createFinding({ message: `Concept "${item.id}" has a malformed source URL.`, path: `concepts[${item.id}].sourceUrl`, entityKind: "concept", entityId: item.id, field: "sourceUrl", severity: "warning" }));
  if (item.legalBasisRequired && !item.legalBasis?.trim()) findings.push(createFinding({ message: `Concept "${item.id}" explicitly indicates that legal basis metadata is expected, but no legal basis is recorded yet.`, path: `concepts[${item.id}].legalBasis`, entityKind: "concept", entityId: item.id, field: "legalBasis", severity: "info" }));
  if (item.topConceptOfSchemeId && item.topConceptOfSchemeId !== item.schemeId) findings.push(createFinding({ message: `Concept "${item.id}" is marked as a top concept for scheme "${item.topConceptOfSchemeId}" but belongs to scheme "${item.schemeId}".`, path: `concepts[${item.id}].topConceptOfSchemeId`, entityKind: "concept", entityId: item.id, field: "topConceptOfSchemeId", relatedEntityId: item.topConceptOfSchemeId, severity: "warning" }));
  return findings;
}

function validateRelation(item: StandardsConceptRelation, conceptsById: Map<string, StandardsConcept>) {
  const findings: StandardsFindingInput[] = [];
  const sourceConcept = conceptsById.get(item.sourceConceptId);
  const targetConcept = conceptsById.get(item.targetConceptId);
  if (!sourceConcept) findings.push(createFinding({ message: `Concept relation "${item.id}" references unknown source concept "${item.sourceConceptId}".`, path: `conceptRelations[${item.id}].sourceConceptId`, entityKind: "conceptRelation", entityId: item.id, field: "sourceConceptId", relatedEntityId: item.sourceConceptId }));
  if (!targetConcept) findings.push(createFinding({ message: `Concept relation "${item.id}" references unknown target concept "${item.targetConceptId}".`, path: `conceptRelations[${item.id}].targetConceptId`, entityKind: "conceptRelation", entityId: item.id, field: "targetConceptId", relatedEntityId: item.targetConceptId }));
  validateOptionalIri(findings, `Concept relation "${item.id}" has an invalid predicate IRI.`, `conceptRelations[${item.id}].predicateIri`, "conceptRelation", item.id, "predicateIri", item.predicateIri);
  const predicateKey = item.predicateKey?.trim().toLowerCase() || "";
  if (item.kind === "custom" && !item.predicateIri && predicateKey && !["broader", "narrower", "related"].includes(predicateKey)) findings.push(createFinding({ message: `Concept relation "${item.id}" uses app-local relation key "${predicateKey}" without an explicit standards predicate IRI mapping.`, path: `conceptRelations[${item.id}]`, entityKind: "conceptRelation", entityId: item.id, severity: "warning", metadata: { predicateKey } }));
  if (sourceConcept && targetConcept && (item.kind === "broader" || item.kind === "narrower") && sourceConcept.id === targetConcept.id) findings.push(createFinding({ message: `Concept relation "${item.id}" cannot create a broader or narrower self-reference.`, path: `conceptRelations[${item.id}]`, entityKind: "conceptRelation", entityId: item.id, relatedEntityId: targetConcept.id }));
  if (sourceConcept && targetConcept && (item.kind === "broader" || item.kind === "narrower") && sourceConcept.schemeId !== targetConcept.schemeId) findings.push(createFinding({ message: `Concept relation "${item.id}" connects concepts from different schemes ("${sourceConcept.schemeId}" and "${targetConcept.schemeId}").`, path: `conceptRelations[${item.id}]`, entityKind: "conceptRelation", entityId: item.id, relatedEntityId: targetConcept.id, severity: "warning" }));
  return findings;
}

function hierarchySemanticsConsistencyFindings(model: StandardsModel) {
  return model.conceptRelations.flatMap((relation) => {
    if (!isHierarchyKind(relation.kind)) {
      return [];
    }

    const predicateKeySemantic = normalizeRelationSemantic(relation.predicateKey);
    const predicateIriSemantic = normalizeRelationSemantic(relation.predicateIri);
    const mismatchedSemantics = [predicateKeySemantic, predicateIriSemantic]
      .filter((value): value is "broader" | "narrower" | "related" => !!value)
      .filter((value) => value !== relation.kind);

    if (mismatchedSemantics.length === 0) {
      return [];
    }

    const expectedPredicateIri = hierarchyPredicateIriByKind[relation.kind];

    return [createFinding({
      message: `Concept relation "${relation.id}" mixes ${relation.kind} hierarchy semantics with predicate metadata that points to ${mismatchedSemantics.join(", ")}.`,
      path: `conceptRelations[${relation.id}]`,
      entityKind: "conceptRelation",
      entityId: relation.id,
      severity: "warning",
      explanation: `Keep explicit hierarchy metadata aligned. A ${relation.kind} relation should use the ${relation.kind} predicate metadata${expectedPredicateIri ? ` (${expectedPredicateIri})` : ""} so editors and exports read the same hierarchy meaning.`,
      metadata: {
        expectedKind: relation.kind,
        predicateKey: relation.predicateKey,
        predicateIri: relation.predicateIri,
        mismatchedSemantics,
      },
    })];
  });
}

function hierarchyCycles(model: StandardsModel) {
  const bySource = new Map<string, string[]>();
  model.conceptRelations.forEach((item) => {
    if (item.kind === "broader") {
      bySource.set(item.sourceConceptId, [...(bySource.get(item.sourceConceptId) || []), item.targetConceptId]);
    }

    if (item.kind === "narrower") {
      bySource.set(item.targetConceptId, [...(bySource.get(item.targetConceptId) || []), item.sourceConceptId]);
    }
  });
  const findings: StandardsFindingInput[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (conceptId: string, stack: string[]) => {
    if (visiting.has(conceptId)) {
      const cycle = [...stack.slice(stack.indexOf(conceptId)), conceptId];
      findings.push(createFinding({ message: `Hierarchy cycle detected: ${cycle.join(" -> ")}.`, path: `concepts[${conceptId}]`, entityKind: "concept", entityId: conceptId, severity: "warning", metadata: { cycle } }));
      return;
    }
    if (visited.has(conceptId)) return;
    visited.add(conceptId);
    visiting.add(conceptId);
    (bySource.get(conceptId) || []).forEach((nextId) => walk(nextId, [...stack, conceptId]));
    visiting.delete(conceptId);
  };
  [...bySource.keys()].forEach((conceptId) => walk(conceptId, []));
  return findings;
}

function hierarchyReciprocityFindings(model: StandardsModel) {
  const findings: StandardsFindingInput[] = [];
  const hierarchyRelations = model.conceptRelations.filter((item) => item.kind === "broader" || item.kind === "narrower");
  const relationsByDirection = new Map<string, StandardsConceptRelation[]>();

  model.conceptRelations.forEach((relation) => {
    const key = `${relation.sourceConceptId}->${relation.targetConceptId}`;
    relationsByDirection.set(key, [...(relationsByDirection.get(key) || []), relation]);
  });

  const emittedPairs = new Set<string>();

  hierarchyRelations.forEach((relation) => {
    const reverseKey = `${relation.targetConceptId}->${relation.sourceConceptId}`;
    const reverseRelations = relationsByDirection.get(reverseKey) || [];

    if (reverseRelations.length === 0) {
      return;
    }

    const expectedKind = relation.kind === "broader" ? "narrower" : "broader";
    const reverseHierarchyRelations = reverseRelations.filter((candidate) => isHierarchyKind(candidate.kind));

    if (reverseHierarchyRelations.some((candidate) => candidate.kind === expectedKind)) {
      return;
    }

    const pairKey = [relation.sourceConceptId, relation.targetConceptId].sort().join("::");

    if (emittedPairs.has(pairKey)) {
      return;
    }

    emittedPairs.add(pairKey);
    findings.push(createFinding({
      message: `Hierarchy links between "${relation.sourceConceptId}" and "${relation.targetConceptId}" use explicit reverse relations but do not mirror broader/narrower semantics.`,
      path: `conceptRelations[${relation.id}]`,
      entityKind: "conceptRelation",
      entityId: relation.id,
      relatedEntityId: reverseRelations[0]?.id,
      severity: "warning",
      explanation: reverseHierarchyRelations.length > 0
        ? "When both directions are modeled explicitly, the reverse hierarchy link should use the inverse broader or narrower semantic. Replace the reverse hierarchy link so one side is broader and the other side is narrower."
        : "A reverse relation exists, but it is not modeled as the inverse broader or narrower hierarchy link. If you keep both directions explicitly, use broader in one direction and narrower in the reverse direction.",
      metadata: {
        expectedReverseKind: expectedKind,
        reverseKinds: reverseRelations.map((item) => item.kind),
      },
    }));
  });

  return findings;
}

function topConceptHierarchyFindings(model: StandardsModel) {
  const topConceptsById = new Map(
    model.concepts
      .filter((concept) => !!concept.topConceptOfSchemeId)
      .map((concept) => [concept.id, concept]),
  );

  if (topConceptsById.size === 0) {
    return [];
  }

  const findings: StandardsFindingInput[] = [];
  const emitted = new Set<string>();

  model.conceptRelations.forEach((relation) => {
    const topConcept = topConceptsById.get(relation.targetConceptId);

    if (topConcept && relation.kind === "broader") {
      const key = `${topConcept.id}::${relation.id}`;

      if (!emitted.has(key)) {
        emitted.add(key);
        findings.push(createFinding({
          message: `Top concept "${topConcept.id}" is placed under a broader concept by relation "${relation.id}".`,
          path: `concepts[${topConcept.id}].topConceptOfSchemeId`,
          entityKind: "concept",
          entityId: topConcept.id,
          field: "topConceptOfSchemeId",
          relatedEntityId: relation.id,
          severity: "warning",
          explanation: "A concept marked as a top concept should sit at the top of the scheme hierarchy. Remove the broader parent relation or remove the top-concept marker until the hierarchy is corrected.",
          metadata: {
            relationId: relation.id,
            schemeId: topConcept.topConceptOfSchemeId,
          },
        }));
      }
    }

    const narrowerTopConcept = topConceptsById.get(relation.sourceConceptId);

    if (narrowerTopConcept && relation.kind === "narrower") {
      const key = `${narrowerTopConcept.id}::${relation.id}`;

      if (!emitted.has(key)) {
        emitted.add(key);
        findings.push(createFinding({
          message: `Top concept "${narrowerTopConcept.id}" is modeled as narrower than another concept by relation "${relation.id}".`,
          path: `concepts[${narrowerTopConcept.id}].topConceptOfSchemeId`,
          entityKind: "concept",
          entityId: narrowerTopConcept.id,
          field: "topConceptOfSchemeId",
          relatedEntityId: relation.id,
          severity: "warning",
          explanation: "A concept marked as a top concept should not also be modeled as narrower than another concept. Remove the narrower hierarchy relation or remove the top-concept marker until the hierarchy is corrected.",
          metadata: {
            relationId: relation.id,
            schemeId: narrowerTopConcept.topConceptOfSchemeId,
          },
        }));
      }
    }
  });

  return findings;
}

const requiredRules = [
  createRule({ ruleId: "nl_sbb_scheme_exists", title: "NL-SBB concept scheme required", description: "Concepts should belong to at least one concept scheme.", rationale: "A concept scheme anchors concept ownership and publication context.", explanation: "Create or import a concept scheme before publishing concepts with this starter NL-SBB catalog.", defaultSeverity: "error", category: "required", scope: "model", requiresGlobalContext: true, validate: ({ model }) => model.concepts.length > 0 && model.conceptSchemes.length === 0 ? [createFinding({ message: "The canonical model contains concepts but no concept schemes.", path: "conceptSchemes", entityKind: "conceptScheme", entityId: "conceptSchemes" })] : [] }),
  createRule({ ruleId: "nl_sbb_missing_scheme_label", title: "NL-SBB scheme label recommended in starter catalog", description: "Concept schemes should be named in the starter catalog.", rationale: "Named schemes make classification and publication reviews clearer.", explanation: "Add a readable concept scheme label so people can understand what the scheme represents.", defaultSeverity: "warning", category: "required", scope: "conceptScheme", requiresGlobalContext: false, validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "label")) }),
  createRule({ ruleId: "nl_sbb_scheme_identifier_required", title: "NL-SBB scheme identifier recommended in starter catalog", description: "Concept schemes should expose a stable identifier IRI in the starter catalog.", rationale: "Stable scheme identifiers support exchange and RDF publication profiles.", explanation: "Add an absolute scheme IRI so the concept scheme can be referenced consistently across systems.", defaultSeverity: "warning", category: "required", scope: "conceptScheme", requiresGlobalContext: false, validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "iri" && finding.severity === "warning")) }),
  createRule({ ruleId: "nl_sbb_invalid_scheme_iri", title: "NL-SBB scheme IRI must be absolute", description: "Concept scheme IRIs should be absolute when present.", rationale: "Absolute scheme IRIs are needed for stable cross-system exchange.", explanation: "Replace the malformed scheme IRI with an absolute IRI so publication remains stable.", defaultSeverity: "error", category: "consistency", scope: "conceptScheme", requiresGlobalContext: false, validate: ({ model }) => model.conceptSchemes.flatMap((item) => validateScheme(item).filter((finding) => finding.field === "iri" && !finding.severity)) }),
  createRule({ ruleId: "nl_sbb_unknown_scheme", title: "NL-SBB concept scheme reference must resolve", description: "Concepts should point to a known scheme.", rationale: "A concept without a valid scheme cannot participate cleanly in scheme governance.", explanation: "Correct the scheme reference or add the missing concept scheme before publication.", defaultSeverity: "error", category: "required", scope: "concept", requiresGlobalContext: true, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "schemeId")); } }),
  createRule({ ruleId: "nl_sbb_missing_pref_label", title: "NL-SBB preferred label recommended in starter catalog", description: "Concepts should expose a preferred label in the starter catalog.", rationale: "Preferred labels are the primary human-facing names in SKOS-style publication.", explanation: "Add a preferred label so the concept can be recognized and reused consistently.", defaultSeverity: "warning", category: "required", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "prefLabel")); } }),
  createRule({ ruleId: "nl_sbb_concept_definition_required", title: "NL-SBB concept definition recommended in starter catalog", description: "Concepts should usually include a definition in the starter catalog.", rationale: "Definitions make concepts understandable to users beyond the original authors.", explanation: "Add a concept definition that explains what the concept means and when it should be used.", defaultSeverity: "warning", category: "required", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "definition" && !finding.metadata)); } }),
  createRule({ ruleId: "nl_sbb_definition_plain_language_recommended", title: "NL-SBB plain-language definition hint", description: "Heuristic editorial guidance for definitions that look terse or code-like.", rationale: "Code-like or overly terse definitions are harder for editors and publishers to interpret consistently, but this is editorial guidance rather than a normative NL-SBB rule.", explanation: "This starter hint noticed that the definition may be terse or code-like. Rewrite it if clearer public-facing language would help, but treat this as editorial guidance rather than a strict compliance issue.", defaultSeverity: "info", category: "best-practice", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "definition" && finding.severity === "info").map((finding) => ({ ...finding, explanation: "This starter hint noticed that the definition may be terse or code-like. Rewrite it if clearer public-facing language would help, but treat this as editorial guidance rather than a strict compliance issue." }))); } }),
  createRule({ ruleId: "nl_sbb_concept_identifier_required", title: "NL-SBB concept identifier recommended in starter catalog", description: "Concepts should expose a stable identifier IRI in the starter catalog.", rationale: "Concept identifiers support linked-data publication and cross-system alignment.", explanation: "Add an absolute concept IRI so the concept can be referenced consistently in publication and integration flows.", defaultSeverity: "warning", category: "required", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "iri" && finding.severity === "warning")); } }),
  createRule({ ruleId: "nl_sbb_invalid_concept_iri", title: "NL-SBB concept IRI must be absolute", description: "Concept IRIs should be absolute when present.", rationale: "Absolute concept IRIs make external alignment and linked-data exports safer.", explanation: "Replace the malformed concept IRI with an absolute IRI so the concept can be exchanged and published reliably.", defaultSeverity: "error", category: "consistency", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "iri" && !finding.severity)); } }),
] satisfies StandardsRuleDefinition[];

const consistencyRules = [
  createRule({ ruleId: "nl_sbb_alt_label_duplicates_pref_label", title: "NL-SBB altLabel should not duplicate prefLabel", description: "Alternative labels should add useful terminology rather than repeat the preferred label.", rationale: "Duplicate labels add noise without improving findability.", explanation: "Remove or change the duplicated altLabel so it contributes a genuine synonym or variant.", defaultSeverity: "warning", category: "consistency", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "altLabels")); } }),
  createRule({ ruleId: "nl_sbb_unknown_relation_source", title: "NL-SBB relation source must resolve", description: "Concept relations should point to a known source concept.", rationale: "A relation with a missing source cannot be projected reliably.", explanation: "Correct the source concept id or add the missing concept before publication.", defaultSeverity: "error", category: "consistency", scope: "conceptRelation", requiresGlobalContext: true, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "sourceConceptId")); } }),
  createRule({ ruleId: "nl_sbb_unknown_relation_target", title: "NL-SBB relation target must resolve", description: "Concept relations should point to a known target concept.", rationale: "A relation with a missing target cannot be projected reliably.", explanation: "Correct the target concept id or add the missing concept before publication.", defaultSeverity: "error", category: "consistency", scope: "conceptRelation", requiresGlobalContext: true, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "targetConceptId")); } }),
  createRule({ ruleId: "nl_sbb_invalid_predicate_iri", title: "NL-SBB predicate IRI must be absolute", description: "Predicate IRIs should be absolute when present.", rationale: "Absolute predicate IRIs help keep semantic mappings interoperable.", explanation: "Replace the malformed predicate IRI with an absolute IRI so the relation can be published consistently.", defaultSeverity: "error", category: "consistency", scope: "conceptRelation", requiresGlobalContext: false, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.field === "predicateIri")); } }),
  createRule({ ruleId: "nl_sbb_unmapped_relation_semantics", title: "NL-SBB custom relation semantics should be mapped", description: "Custom concept relations should ideally carry an explicit predicate mapping.", rationale: "Mapped predicates make custom relations easier to interpret outside the application.", explanation: "Add an explicit predicate IRI or align the relation to a known broader, narrower, or related mapping where possible.", defaultSeverity: "warning", category: "consistency", scope: "conceptRelation", requiresGlobalContext: false, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => finding.path === `conceptRelations[${item.id}]` && finding.severity === "warning" && !!finding.metadata?.predicateKey)); } }),
  createRule({ ruleId: "nl_sbb_hierarchy_no_self_reference", title: "NL-SBB hierarchy should not self-reference", description: "Broader and narrower relations should not point back to the same concept.", rationale: "Self-referential hierarchy links are structurally broken.", explanation: "Remove the self-referential hierarchy link or point it to the intended related concept.", defaultSeverity: "error", category: "consistency", scope: "conceptRelation", requiresGlobalContext: false, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => !finding.field && !finding.severity && finding.relatedEntityId === item.targetConceptId && item.sourceConceptId === item.targetConceptId)); } }),
  createRule({ ruleId: "nl_sbb_hierarchy_cycle", title: "NL-SBB hierarchy should not form cycles", description: "Broader and narrower relations should remain acyclic in this starter pack.", rationale: "Hierarchy cycles make broader and narrower semantics ambiguous.", explanation: "Break the hierarchy cycle so the concept structure remains understandable and publishable.", defaultSeverity: "warning", category: "consistency", scope: "model", requiresGlobalContext: true, validate: ({ model }) => hierarchyCycles(model) }),
  createRule({ ruleId: "nl_sbb_broader_narrower_reciprocity", title: "NL-SBB explicit reverse hierarchy links should be reciprocal", description: "When broader or narrower links are modeled in both directions, the reverse link should use the inverse hierarchy semantic.", rationale: "Explicit reverse hierarchy links that do not mirror broader/narrower semantics make the hierarchy harder to interpret and can confuse publication mappings.", explanation: "If you model both directions explicitly, use broader in one direction and narrower in the reverse direction.", defaultSeverity: "warning", category: "consistency", scope: "model", requiresGlobalContext: true, validate: ({ model }) => hierarchyReciprocityFindings(model) }),
  createRule({ ruleId: "nl_sbb_hierarchy_semantics_consistency", title: "NL-SBB hierarchy metadata should match the chosen hierarchy relation", description: "Broader and narrower hierarchy relations should keep predicate metadata aligned with the chosen hierarchy semantic.", rationale: "Misaligned broader/narrower metadata makes hierarchy exports and reviews harder to trust, even when the stored relation still points to valid concepts.", explanation: "Keep the hierarchy relation kind and its predicate metadata aligned so broader stays broader and narrower stays narrower everywhere the relation is projected.", defaultSeverity: "warning", category: "consistency", scope: "conceptRelation", requiresGlobalContext: false, validate: ({ model }) => hierarchySemanticsConsistencyFindings(model) }),
  createRule({ ruleId: "nl_sbb_cross_scheme_relation", title: "NL-SBB cross-scheme hierarchy warning", description: "Hierarchical links should usually stay inside one concept scheme in this starter pack.", rationale: "Cross-scheme broader and narrower links often signal scheme-boundary problems.", explanation: "Review the scheme boundaries or replace the hierarchy with a looser relation if the concepts belong to different schemes.", defaultSeverity: "warning", category: "consistency", scope: "conceptRelation", requiresGlobalContext: true, validate: ({ model }) => { const conceptsById = new Map(model.concepts.map((item) => [item.id, item])); return model.conceptRelations.flatMap((item) => validateRelation(item, conceptsById).filter((finding) => !finding.field && finding.severity === "warning" && !finding.metadata)); } }),
  createRule({ ruleId: "nl_sbb_top_concept_consistency", title: "NL-SBB top concept marker should match scheme membership and hierarchy position", description: "When top-concept metadata is present, it should align with the concept's own scheme and not place the concept below a broader parent.", rationale: "Mismatched top-concept markers can mislead publication tooling and editors.", explanation: "Align the top-concept marker with the concept's actual scheme and keep the marked concept at the top of the hierarchy.", defaultSeverity: "warning", category: "consistency", scope: "concept", requiresGlobalContext: true, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return [...model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "topConceptOfSchemeId")), ...topConceptHierarchyFindings(model)]; } }),
] satisfies StandardsRuleDefinition[];

const publicationRules = [
  createRule({ ruleId: "nl_sbb_source_recommended", title: "NL-SBB source reference hint", description: "Starter publication guidance for adding a source reference or source URL when available.", rationale: "Source references help editors explain where the concept came from and support future governance, but missing source metadata is not a strong compliance failure in this starter catalog.", explanation: "This starter hint noticed that no source reference is recorded yet. Add one if provenance matters for review or publication, but treat this as guidance rather than a strict compliance issue.", defaultSeverity: "info", category: "publication", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "sourceReference").map((finding) => ({ ...finding, explanation: "This starter hint noticed that no source reference is recorded yet. Add one if provenance matters for review or publication, but treat this as guidance rather than a strict compliance issue." }))); } }),
  createRule({ ruleId: "nl_sbb_source_link_validity", title: "NL-SBB source link validity", description: "Source URLs should be valid HTTP(S) links when present.", rationale: "Malformed source links weaken publication traceability.", explanation: "Correct the source URL so reviewers can follow it back to the source material.", defaultSeverity: "warning", category: "publication", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "sourceUrl")); } }),
  createRule({ ruleId: "nl_sbb_legal_basis_recommended", title: "NL-SBB legal-basis hint for explicitly flagged concepts", description: "Starter publication guidance for concepts that explicitly indicate legal-basis metadata is expected.", rationale: "Legal-basis context can help users distinguish mandatory concepts from general terminology, but this starter hint should only fire when the model explicitly says legal-basis metadata is expected.", explanation: "This starter hint noticed that legal-basis metadata is expected but not yet recorded. Add a citation if the concept is meant to carry explicit legal grounding.", defaultSeverity: "info", category: "publication", scope: "concept", requiresGlobalContext: false, validate: ({ model }) => { const schemeIds = new Set(model.conceptSchemes.map((item) => item.id)); return model.concepts.flatMap((item) => validateConcept(item, schemeIds).filter((finding) => finding.field === "legalBasis").map((finding) => ({ ...finding, explanation: "This starter hint noticed that legal-basis metadata is expected but not yet recorded. Add a citation if the concept is meant to carry explicit legal grounding." }))); } }),
] satisfies StandardsRuleDefinition[];

const placeholderRules = [
  createPlaceholderRule({ ruleId: "nl_sbb_broader_narrower_reciprocity_placeholder", title: "NL-SBB broader/narrower reciprocity placeholder", description: "Starter placeholder for stronger broader/narrower reciprocity semantics.", rationale: "Full reciprocity checking depends on a more authoritative NL-SBB/SKOS rule catalog than the repository currently encodes.", explanation: "This placeholder reserves space for richer reciprocity checks when the normative catalog is available." }),
  createPlaceholderRule({ ruleId: "nl_sbb_related_symmetry_placeholder", title: "NL-SBB related symmetry placeholder", description: "Starter placeholder for stronger related-relation symmetry checks.", rationale: "Symmetry rules need a clearer authoritative catalog and, in some flows, fuller graph context.", explanation: "This placeholder reserves space for future related symmetry validation." }),
  createPlaceholderRule({ ruleId: "nl_sbb_governance_metadata_depth_placeholder", title: "NL-SBB governance metadata depth placeholder", description: "Starter placeholder for steward, owner, version, and provenance-style governance metadata expectations.", rationale: "The current canonical model does not yet encode a full governance metadata surface, so deeper governance requirements should remain explicit placeholders.", explanation: "This placeholder reserves space for future governance metadata depth checks once the repository carries explicit steward, owner, version, or provenance fields.", scope: "publication", requiresGlobalContext: false }),
  createPlaceholderRule({ ruleId: "nl_sbb_publication_language_recommendation_placeholder", title: "NL-SBB publication language recommendation placeholder", description: "Starter placeholder for richer language-tag recommendations in publication profiles.", rationale: "The current canonical model stores plain strings for labels and definitions, not full language-tagged publication structures.", explanation: "This placeholder reserves space for future language-tag recommendations once the canonical model carries richer publication detail.", scope: "publication", requiresGlobalContext: false }),
  createPlaceholderRule({ ruleId: "nl_sbb_publication_type_profile_placeholder", title: "NL-SBB publication type profile placeholder", description: "Starter placeholder for stricter concept and scheme publication type checks.", rationale: "The current canonical model does not yet encode full publication-type assertions for every concept and scheme.", explanation: "This placeholder reserves space for future publication-profile type checks.", scope: "publication", requiresGlobalContext: false }),
] satisfies StandardsRuleDefinition[];

export const nlSbbStandardsPack: StandardsPackDefinition = {
  standardId: "nl-sbb",
  label: "NL-SBB",
  description: "Dutch NL-SBB starter pack for concept-framework conventions, source/legal-basis guidance, governance-oriented publication practice, and scheme quality on top of generic concept semantics.",
  getRelationSuggestions: getNlSbbRelationSuggestions,
  rules: [...requiredRules, ...consistencyRules, ...publicationRules, ...placeholderRules],
};
