import type { StandardsFindingInput, StandardsPackDefinition, StandardsRuleDefinition } from "@/lib/standards/engine/types";
import type { StandardsAssociation, StandardsAttribute, StandardsClass, StandardsModel } from "@/lib/standards/model";
import {
  createFinding,
  createInvalidIriFinding,
  createPlaceholderRule,
  createRuleDefinition,
  detectNamingStyle,
  isAbsoluteIri,
  isNonEmptyString,
  normalizeComparisonValue,
} from "@/lib/standards/profiles/shared";
import { getMimRelationSuggestions } from "@/lib/standards/profiles/mim/suggestions";

type Lookups = {
  packageIds: Set<string>;
  datatypeIds: Set<string>;
  classIds: Set<string>;
  assocByClassId: Map<string, StandardsAssociation[]>;
  subClassIdsByClassId: Map<string, string[]>;
};

const createRule = (input: Omit<StandardsRuleDefinition, "implementationStatus"> & { implementationStatus?: StandardsRuleDefinition["implementationStatus"] }) =>
  createRuleDefinition({ ...input, implementationStatus: input.implementationStatus || "starter" });

function lookups(model: StandardsModel): Lookups {
  const assocByClassId = new Map<string, StandardsAssociation[]>();
  const subClassIdsByClassId = new Map<string, string[]>();
  model.associations.forEach((item) => {
    assocByClassId.set(item.source.classId, [...(assocByClassId.get(item.source.classId) || []), item]);
    assocByClassId.set(item.target.classId, [...(assocByClassId.get(item.target.classId) || []), item]);
  });
  model.classes.forEach((item) => item.superClassIds?.forEach((superClassId) => {
    subClassIdsByClassId.set(superClassId, [...(subClassIdsByClassId.get(superClassId) || []), item.id]);
  }));
  return {
    packageIds: new Set(model.packages.map((item) => item.id)),
    datatypeIds: new Set(model.datatypes.map((item) => item.id)),
    classIds: new Set(model.classes.map((item) => item.id)),
    assocByClassId,
    subClassIdsByClassId,
  };
}

function validateOptionalIri(findings: StandardsFindingInput[], message: string, path: string, entityKind: string, entityId: string, field: string, iri?: string) {
  if (!iri) return;
  if (!isAbsoluteIri(iri)) findings.push(createInvalidIriFinding({ message, path, entityKind, entityId, field }));
}

function validateAttribute(owner: StandardsClass, attribute: StandardsAttribute, datatypeIds: Set<string>) {
  const findings: StandardsFindingInput[] = [];
  if (!isNonEmptyString(attribute.name)) {
    findings.push(createFinding({ message: `Attribute "${attribute.id}" on class "${owner.id}" must have a non-empty name.`, path: `classes[${owner.id}].attributes[${attribute.id}].name`, entityKind: "attribute", entityId: attribute.id, field: "name", relatedEntityId: owner.id }));
  }
  if (!attribute.datatypeId) {
    findings.push(createFinding({ message: `Attribute "${attribute.id}" on class "${owner.id}" should reference a datatype in this MIM starter catalog.`, path: `classes[${owner.id}].attributes[${attribute.id}].datatypeId`, entityKind: "attribute", entityId: attribute.id, field: "datatypeId", relatedEntityId: owner.id, severity: "warning" }));
  } else if (!datatypeIds.has(attribute.datatypeId)) {
    findings.push(createFinding({ message: `Attribute "${attribute.id}" on class "${owner.id}" references unknown datatype "${attribute.datatypeId}".`, path: `classes[${owner.id}].attributes[${attribute.id}].datatypeId`, entityKind: "attribute", entityId: attribute.id, field: "datatypeId", relatedEntityId: attribute.datatypeId }));
  }
  return findings;
}

function validateClass(item: StandardsClass, refs: Lookups) {
  const findings: StandardsFindingInput[] = [];
  if (!isNonEmptyString(item.label)) findings.push(createFinding({ message: `Class "${item.id}" must have a non-empty label.`, path: `classes[${item.id}].label`, entityKind: "class", entityId: item.id, field: "label" }));
  validateOptionalIri(findings, `Class "${item.id}" has an invalid IRI.`, `classes[${item.id}].iri`, "class", item.id, "iri", item.iri);
  if (item.packageId && !refs.packageIds.has(item.packageId)) findings.push(createFinding({ message: `Class "${item.id}" references unknown package "${item.packageId}".`, path: `classes[${item.id}].packageId`, entityKind: "class", entityId: item.id, field: "packageId", relatedEntityId: item.packageId }));
  item.attributes?.forEach((attribute) => findings.push(...validateAttribute(item, attribute, refs.datatypeIds)));
  if ((item.identifiers?.length || 0) === 0) findings.push(createFinding({ message: `Class "${item.id}" does not define an identifier yet.`, path: `classes[${item.id}].identifiers`, entityKind: "class", entityId: item.id, field: "identifiers", severity: "warning" }));
  item.identifiers?.forEach((identifier) => {
    if (!isNonEmptyString(identifier.name)) findings.push(createFinding({ message: `Identifier "${identifier.id}" on class "${item.id}" must have a non-empty name.`, path: `classes[${item.id}].identifiers[${identifier.id}].name`, entityKind: "identifier", entityId: identifier.id, field: "name", relatedEntityId: item.id }));
  });
  item.superClassIds?.forEach((superClassId) => {
    if (!refs.classIds.has(superClassId)) findings.push(createFinding({ message: `Class "${item.id}" references unknown superclass "${superClassId}".`, path: `classes[${item.id}].superClassIds[${superClassId}]`, entityKind: "class", entityId: item.id, field: "superClassIds", relatedEntityId: superClassId }));
  });
  return findings;
}

function validateAssociation(item: StandardsAssociation, refs: Lookups) {
  const findings: StandardsFindingInput[] = [];
  if (!isNonEmptyString(item.label)) findings.push(createFinding({ message: `Association "${item.id}" must have a non-empty label.`, path: `associations[${item.id}].label`, entityKind: "association", entityId: item.id, field: "label" }));
  validateOptionalIri(findings, `Association "${item.id}" has an invalid IRI.`, `associations[${item.id}].iri`, "association", item.id, "iri", item.iri);
  if (item.packageId && !refs.packageIds.has(item.packageId)) findings.push(createFinding({ message: `Association "${item.id}" references unknown package "${item.packageId}".`, path: `associations[${item.id}].packageId`, entityKind: "association", entityId: item.id, field: "packageId", relatedEntityId: item.packageId }));
  if (!refs.classIds.has(item.source.classId)) findings.push(createFinding({ message: `Association "${item.id}" references unknown source class "${item.source.classId}".`, path: `associations[${item.id}].source.classId`, entityKind: "association", entityId: item.id, field: "source.classId", relatedEntityId: item.source.classId }));
  if (!refs.classIds.has(item.target.classId)) findings.push(createFinding({ message: `Association "${item.id}" references unknown target class "${item.target.classId}".`, path: `associations[${item.id}].target.classId`, entityKind: "association", entityId: item.id, field: "target.classId", relatedEntityId: item.target.classId }));
  return findings;
}

function duplicateLabels(model: StandardsModel) {
  const seen = new Map<string, string>();
  return model.classes.flatMap((item) => {
    const normalized = normalizeComparisonValue(item.label);
    if (!normalized) return [];
    const key = `${item.packageId || "__root__"}::${normalized}`;
    if (seen.has(key)) return [createFinding({ message: `Class label "${item.label}" is duplicated inside the same package scope.`, path: `classes[${item.id}].label`, entityKind: "class", entityId: item.id, field: "label", relatedEntityId: seen.get(key), severity: "warning" })];
    seen.set(key, item.id);
    return [];
  });
}

function duplicateIdentifiers(model: StandardsModel) {
  const seen = new Map<string, string>();
  return model.classes.flatMap((item) => item.identifiers?.flatMap((identifier) => {
    const normalized = normalizeComparisonValue(identifier.id);
    if (!normalized) return [];
    if (seen.has(normalized)) return [createFinding({ message: `Identifier "${identifier.id}" is reused across multiple classes in the same model.`, path: `classes[${item.id}].identifiers[${identifier.id}].id`, entityKind: "identifier", entityId: identifier.id, field: "id", relatedEntityId: seen.get(normalized) })];
    seen.set(normalized, item.id);
    return [];
  }) || []);
}

function circularInheritance(model: StandardsModel) {
  const classesById = new Map(model.classes.map((item) => [item.id, item]));
  const findings: StandardsFindingInput[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (classId: string, stack: string[]) => {
    if (visiting.has(classId)) {
      const cycle = [...stack.slice(stack.indexOf(classId)), classId];
      findings.push(createFinding({ message: `Class inheritance cycle detected: ${cycle.join(" -> ")}.`, path: `classes[${classId}].superClassIds`, entityKind: "class", entityId: classId, field: "superClassIds", severity: "warning", metadata: { cycle } }));
      return;
    }
    if (visited.has(classId)) return;
    visited.add(classId);
    visiting.add(classId);
    const next = classesById.get(classId);
    next?.superClassIds?.forEach((superClassId) => classesById.has(superClassId) && walk(superClassId, [...stack, classId]));
    visiting.delete(classId);
  };
  model.classes.forEach((item) => walk(item.id, []));
  return findings;
}

function namingConsistency(model: StandardsModel) {
  const styled = model.classes.filter((item) => isNonEmptyString(item.label)).map((item) => ({ item, style: detectNamingStyle(item.label) })).filter((entry) => entry.style !== "empty");
  if (styled.length < 2) return [];
  const counts = new Map<string, number>();
  styled.forEach(({ style }) => counts.set(style, (counts.get(style) || 0) + 1));
  if (counts.size < 2) return [];
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return styled.filter(({ style }) => style !== dominant).map(({ item, style }) => createFinding({ message: `Class "${item.id}" uses "${style}" naming while most classes follow "${dominant}" naming.`, path: `classes[${item.id}].label`, entityKind: "class", entityId: item.id, field: "label", severity: "warning", metadata: { dominantStyle: dominant, style } }));
}

function orphaned(model: StandardsModel, refs: Lookups) {
  return model.classes.flatMap((item) => {
    const connected = (item.attributes?.length || 0) > 0 || (item.identifiers?.length || 0) > 0 || (item.superClassIds?.length || 0) > 0 || (refs.subClassIdsByClassId.get(item.id)?.length || 0) > 0 || (refs.assocByClassId.get(item.id)?.length || 0) > 0;
    return connected ? [] : [createFinding({ message: `Class "${item.id}" is not connected to the rest of the starter MIM model yet.`, path: `classes[${item.id}]`, entityKind: "class", entityId: item.id, severity: "warning" })];
  });
}

function packageContext(model: StandardsModel) {
  const hasPackages = model.packages.length > 0 || model.classes.some((item) => !!item.packageId) || model.associations.some((item) => !!item.packageId);
  if (!hasPackages) return [];
  return [
    ...model.classes.flatMap((item) => item.packageId ? [] : [createFinding({ message: `Class "${item.id}" is missing package context while the model uses package grouping.`, path: `classes[${item.id}].packageId`, entityKind: "class", entityId: item.id, field: "packageId", severity: "warning" })]),
    ...model.associations.flatMap((item) => item.packageId ? [] : [createFinding({ message: `Association "${item.id}" is missing package context while the model uses package grouping.`, path: `associations[${item.id}].packageId`, entityKind: "association", entityId: item.id, field: "packageId", severity: "warning" })]),
  ];
}

const requiredRules = [
  createRule({ ruleId: "mim_missing_package_label", title: "MIM package label recommended in starter catalog", description: "Packages should carry a visible label in the starter catalog.", rationale: "Package labels keep model structure reviewable and readable in exports.", explanation: "Add a readable package label so grouped classes remain understandable in diagrams and exports.", defaultSeverity: "warning", category: "required", scope: "package", requiresGlobalContext: false, validate: ({ model }) => model.packages.flatMap((item) => !isNonEmptyString(item.label) ? [createFinding({ message: `Package "${item.id}" should have a readable label in this starter MIM catalog.`, path: `packages[${item.id}].label`, entityKind: "package", entityId: item.id, field: "label", severity: "warning" })] : []) }),
  createRule({ ruleId: "mim_missing_datatype_label", title: "MIM datatype label recommended in starter catalog", description: "Datatypes should carry a visible label in the starter catalog.", rationale: "Named datatypes make attribute typing easier to review.", explanation: "Add a readable datatype label so attribute typing stays understandable.", defaultSeverity: "warning", category: "required", scope: "datatype", requiresGlobalContext: false, validate: ({ model }) => model.datatypes.flatMap((item) => !isNonEmptyString(item.label) ? [createFinding({ message: `Datatype "${item.id}" should have a readable label in this starter MIM catalog.`, path: `datatypes[${item.id}].label`, entityKind: "datatype", entityId: item.id, field: "label", severity: "warning" })] : []) }),
  createRule({ ruleId: "mim_missing_class_label", title: "MIM class label recommended in starter catalog", description: "Classes should carry a visible label in the starter catalog.", rationale: "Unnamed classes are difficult to review or export consistently.", explanation: "Add a readable class label so model reviewers can understand what the class represents.", defaultSeverity: "warning", category: "required", scope: "class", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "label")); } }),
  createRule({ ruleId: "mim_missing_attribute_name", title: "MIM attribute name recommended in starter catalog", description: "Attributes should have a stable name in the starter catalog.", rationale: "Unnamed attributes cannot be interpreted or exchanged reliably.", explanation: "Name the attribute so it can be reviewed and serialized consistently.", defaultSeverity: "warning", category: "required", scope: "attribute", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "name" && finding.entityKind === "attribute")); } }),
  createRule({ ruleId: "mim_attribute_datatype_recommended", title: "MIM attribute datatype recommended", description: "Attributes should reference a datatype in this starter catalog.", rationale: "Untyped attributes are harder to exchange and compare across tools.", explanation: "Add a datatype reference so the attribute meaning and serialization are clearer.", defaultSeverity: "warning", category: "required", scope: "attribute", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "datatypeId" && finding.severity === "warning")); } }),
  createRule({ ruleId: "mim_identifier_required", title: "MIM identifier recommended in starter catalog", description: "Classes should usually define at least one identifier in the starter catalog.", rationale: "Identifier discipline keeps modeled classes traceable and less ambiguous.", explanation: "Add an identifier if the class should be referenced or exchanged beyond the current draft.", defaultSeverity: "warning", category: "required", scope: "class", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "identifiers")); } }),
  createRule({ ruleId: "mim_missing_identifier_name", title: "MIM identifier name recommended in starter catalog", description: "Identifiers should have a stable name in the starter catalog.", rationale: "Named identifiers are easier to review and align with downstream keys.", explanation: "Name the identifier so reviewers can understand how the class is identified.", defaultSeverity: "warning", category: "required", scope: "identifier", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.entityKind === "identifier")); } }),
  createRule({ ruleId: "mim_missing_association_label", title: "MIM association label recommended in starter catalog", description: "Associations should carry a readable label in the starter catalog.", rationale: "Named associations make relation intent easier to review.", explanation: "Add an association label so the relationship meaning is clear to model reviewers.", defaultSeverity: "warning", category: "required", scope: "association", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.associations.flatMap((item) => validateAssociation(item, refs).filter((finding) => finding.field === "label")); } }),
] satisfies StandardsRuleDefinition[];

const consistencyRules = [
  createRule({ ruleId: "mim_invalid_package_iri", title: "MIM package IRI must be absolute", description: "Package IRIs should be absolute when present.", rationale: "Absolute IRIs keep exported package references stable.", explanation: "Replace the malformed package IRI with an absolute IRI or remove the draft value until you have a stable identifier.", defaultSeverity: "error", category: "consistency", scope: "package", requiresGlobalContext: false, validate: ({ model }) => { const findings: StandardsFindingInput[] = []; model.packages.forEach((item) => validateOptionalIri(findings, `Package "${item.id}" has an invalid IRI.`, `packages[${item.id}].iri`, "package", item.id, "iri", item.iri)); return findings; } }),
  createRule({ ruleId: "mim_invalid_datatype_iri", title: "MIM datatype IRI must be absolute", description: "Datatype IRIs should be absolute when present.", rationale: "Absolute datatype IRIs preserve type interoperability.", explanation: "Replace the malformed datatype IRI with an absolute IRI so downstream type references remain stable.", defaultSeverity: "error", category: "consistency", scope: "datatype", requiresGlobalContext: false, validate: ({ model }) => { const findings: StandardsFindingInput[] = []; model.datatypes.forEach((item) => validateOptionalIri(findings, `Datatype "${item.id}" has an invalid IRI.`, `datatypes[${item.id}].iri`, "datatype", item.id, "iri", item.iri)); return findings; } }),
  createRule({ ruleId: "mim_invalid_class_iri", title: "MIM class IRI must be absolute", description: "Class IRIs should be absolute when present.", rationale: "Absolute class IRIs support traceable exports and publication.", explanation: "Replace the malformed class IRI with an absolute IRI so the class can be exchanged and referenced consistently.", defaultSeverity: "error", category: "consistency", scope: "class", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "iri")); } }),
  createRule({ ruleId: "mim_unknown_package", title: "MIM class package reference must resolve", description: "Classes should only point to known packages.", rationale: "Unknown package references usually indicate incomplete or broken model context.", explanation: "Correct the package reference or add the missing package before export.", defaultSeverity: "error", category: "consistency", scope: "class", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "packageId")); } }),
  createRule({ ruleId: "mim_unknown_datatype", title: "MIM datatype reference must resolve", description: "Attributes should reference known datatypes.", rationale: "Unknown datatypes indicate broken type references.", explanation: "Correct the datatype reference or add the missing datatype.", defaultSeverity: "error", category: "consistency", scope: "attribute", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "datatypeId" && !finding.severity)); } }),
  createRule({ ruleId: "mim_identifier_unique_within_model", title: "MIM identifier ids should be unique within one model", description: "Identifier ids should not be reused across classes in the same model.", rationale: "Duplicate identifier ids create ambiguity during traceability and export.", explanation: "Give each identifier a unique id so model traceability stays unambiguous.", defaultSeverity: "error", category: "consistency", scope: "model", requiresGlobalContext: true, validate: ({ model }) => duplicateIdentifiers(model) }),
  createRule({ ruleId: "mim_unknown_superclass", title: "MIM superclass reference must resolve", description: "Superclass references should resolve to known classes.", rationale: "Broken inheritance links make hierarchies unreliable.", explanation: "Correct the superclass id or add the missing class to restore a coherent hierarchy.", defaultSeverity: "error", category: "consistency", scope: "class", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.classes.flatMap((item) => validateClass(item, refs).filter((finding) => finding.field === "superClassIds")); } }),
  createRule({ ruleId: "mim_circular_inheritance", title: "MIM inheritance should not form cycles", description: "Inheritance hierarchies should remain acyclic in this starter pack.", rationale: "Circular inheritance usually points to a modeling mistake.", explanation: "Break the inheritance cycle so the starter MIM hierarchy remains readable and exportable.", defaultSeverity: "warning", category: "consistency", scope: "model", requiresGlobalContext: true, validate: ({ model }) => circularInheritance(model) }),
  createRule({ ruleId: "mim_invalid_association_iri", title: "MIM association IRI must be absolute", description: "Association IRIs should be absolute when present.", rationale: "Absolute association IRIs keep relationship semantics stable.", explanation: "Replace the malformed association IRI with an absolute IRI so the relation can be published consistently.", defaultSeverity: "error", category: "consistency", scope: "association", requiresGlobalContext: false, validate: ({ model }) => { const refs = lookups(model); return model.associations.flatMap((item) => validateAssociation(item, refs).filter((finding) => finding.field === "iri")); } }),
  createRule({ ruleId: "mim_unknown_association_package", title: "MIM association package reference must resolve", description: "Associations should only point to known packages.", rationale: "Broken package references make relation context inconsistent.", explanation: "Correct the package reference or add the missing package.", defaultSeverity: "error", category: "consistency", scope: "association", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.associations.flatMap((item) => validateAssociation(item, refs).filter((finding) => finding.field === "packageId")); } }),
  createRule({ ruleId: "mim_unknown_association_source", title: "MIM association source must resolve", description: "Association sources should resolve to existing classes.", rationale: "An association with a missing source class cannot be projected consistently.", explanation: "Correct the source reference or add the missing class.", defaultSeverity: "error", category: "consistency", scope: "association", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.associations.flatMap((item) => validateAssociation(item, refs).filter((finding) => finding.field === "source.classId")); } }),
  createRule({ ruleId: "mim_unknown_association_target", title: "MIM association target must resolve", description: "Association targets should resolve to existing classes.", rationale: "An association with a missing target class cannot be projected consistently.", explanation: "Correct the target reference or add the missing class.", defaultSeverity: "error", category: "consistency", scope: "association", requiresGlobalContext: true, validate: ({ model }) => { const refs = lookups(model); return model.associations.flatMap((item) => validateAssociation(item, refs).filter((finding) => finding.field === "target.classId")); } }),
  createRule({ ruleId: "mim_package_context_consistency", title: "MIM package context should be consistent", description: "When a model uses packages, classes and associations should consistently carry package context.", rationale: "Mixed package usage often signals incomplete metadata capture.", explanation: "Add package references or simplify the package structure so the model stays coherent.", defaultSeverity: "warning", category: "consistency", scope: "model", requiresGlobalContext: true, validate: ({ model }) => packageContext(model) }),
] satisfies StandardsRuleDefinition[];

const bestPracticeRules = [
  createRule({ ruleId: "mim_duplicate_label_within_scope", title: "MIM duplicate labels within scope", description: "Classes should avoid duplicate labels inside the same package scope.", rationale: "Duplicate labels make model reviews ambiguous.", explanation: "Rename one of the duplicate classes or split the package if they represent different concepts.", defaultSeverity: "warning", category: "best-practice", scope: "model", requiresGlobalContext: true, validate: ({ model }) => duplicateLabels(model) }),
  createRule({ ruleId: "mim_naming_convention_consistency", title: "MIM starter naming consistency hint", description: "Heuristic starter guidance for keeping class naming styles broadly aligned.", rationale: "Consistent naming can make conceptual models easier to scan, but this is editorial guidance rather than a normative MIM rule.", explanation: "This starter hint noticed mixed naming styles. Align names if it improves readability, but treat this as modeling guidance rather than a strict compliance issue.", defaultSeverity: "info", category: "best-practice", scope: "model", requiresGlobalContext: true, validate: ({ model }) => namingConsistency(model).map((finding) => ({ ...finding, severity: "info", explanation: "This starter hint noticed mixed naming styles. Align names if it improves readability, but treat this as modeling guidance rather than a strict compliance issue." })) }),
  createRule({ ruleId: "mim_orphaned_model_element", title: "MIM starter isolated-class hint", description: "Heuristic starter guidance for classes that are currently isolated from the rest of the model.", rationale: "An isolated class can be a valid draft, but it is often a sign that the surrounding model structure is still incomplete.", explanation: "This starter hint noticed that the class is currently isolated. Connect it if more structure is expected, or ignore the hint if the isolation is intentional.", defaultSeverity: "info", category: "best-practice", scope: "class", requiresGlobalContext: true, validate: ({ model }) => orphaned(model, lookups(model)).map((finding) => ({ ...finding, severity: "info", explanation: "This starter hint noticed that the class is currently isolated. Connect it if more structure is expected, or ignore the hint if the isolation is intentional." })) }),
] satisfies StandardsRuleDefinition[];

const placeholderRules = [
  createPlaceholderRule({ ruleId: "mim_cardinality_semantics_placeholder", title: "MIM cardinality semantics placeholder", description: "Starter placeholder for richer MIM cardinality semantics.", rationale: "Authoritative MIM cardinality interpretation needs a fuller normative catalog than the repository currently encodes.", explanation: "This rule slot is intentionally reserved for future MIM cardinality semantics." }),
  createPlaceholderRule({ ruleId: "mim_stereotype_profile_constraints_placeholder", title: "MIM stereotype and profile constraint placeholder", description: "Starter placeholder for MIM stereotypes and profile-specific constraints.", rationale: "Stereotype and profile semantics are normative areas that should not be guessed from incomplete metadata.", explanation: "This rule slot is intentionally reserved for future stereotype and profile constraints." }),
  createPlaceholderRule({ ruleId: "mim_package_section_group_context_placeholder", title: "MIM section and group context placeholder", description: "Starter placeholder for deeper package, section, and grouping semantics.", rationale: "The current canonical MIM model carries package references, but not the full section and grouping semantics needed for a stronger context rule catalog.", explanation: "This rule slot is intentionally reserved for richer package, section, and grouping rules once the canonical model carries enough context." }),
  createPlaceholderRule({ ruleId: "mim_association_end_semantics_placeholder", title: "MIM association-end role and cardinality placeholder", description: "Starter placeholder for richer association-end role and cardinality semantics.", rationale: "The current canonical model carries only shallow association-end metadata, which is not enough for stronger MIM role and cardinality interpretation.", explanation: "This rule slot is intentionally reserved for future MIM association-end role and cardinality semantics." }),
] satisfies StandardsRuleDefinition[];

export const mimStandardsPack: StandardsPackDefinition = {
  standardId: "mim",
  label: "MIM",
  description: "Starter MIM catalog with required structure, consistency, and conceptual-model quality checks.",
  getRelationSuggestions: getMimRelationSuggestions,
  rules: [...requiredRules, ...consistencyRules, ...bestPracticeRules, ...placeholderRules],
};
