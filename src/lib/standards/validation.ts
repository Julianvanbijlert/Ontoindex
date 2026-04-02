import type {
  StandardsAssociation,
  StandardsAttribute,
  StandardsClass,
  StandardsConcept,
  StandardsConceptRelation,
  StandardsConceptScheme,
  StandardsModel,
  StandardsProfile,
  StandardsResourceTerm,
  StandardsTriple,
} from "@/lib/standards/model";

export type StandardsValidationSeverity = "error" | "warning";

export interface StandardsValidationIssue {
  profile: StandardsProfile | "core";
  severity: StandardsValidationSeverity;
  code: string;
  message: string;
  path: string;
}

export interface StandardsValidationResult {
  valid: boolean;
  issues: StandardsValidationIssue[];
  errors: StandardsValidationIssue[];
  warnings: StandardsValidationIssue[];
}

function createIssue(issue: StandardsValidationIssue): StandardsValidationIssue {
  return issue;
}

function isNonEmptyString(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

function isAbsoluteIri(value: string) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:.+/.test(value.trim());
}

function isValidBlankNodeId(value: string) {
  return /^_:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.trim());
}

function validateOptionalIri(
  issues: StandardsValidationIssue[],
  profile: StandardsProfile | "core",
  code: string,
  message: string,
  path: string,
  iri?: string,
) {
  if (!iri) {
    return;
  }

  if (!isAbsoluteIri(iri)) {
    issues.push(createIssue({
      profile,
      severity: "error",
      code,
      message,
      path,
    }));
  }
}

function validateMimProfile(model: StandardsModel, issues: StandardsValidationIssue[]) {
  const packageIds = new Set(model.packages.map((item) => item.id));
  const datatypeIds = new Set(model.datatypes.map((item) => item.id));
  const classIds = new Set(model.classes.map((item) => item.id));

  model.packages.forEach((item) => {
    if (!isNonEmptyString(item.label)) {
      issues.push(createIssue({
        profile: "mim",
        severity: "error",
        code: "mim_missing_package_label",
        message: `Package "${item.id}" must have a non-empty label.`,
        path: `packages[${item.id}].label`,
      }));
    }

    validateOptionalIri(
      issues,
      "mim",
      "mim_invalid_package_iri",
      `Package "${item.id}" has an invalid IRI.`,
      `packages[${item.id}].iri`,
      item.iri,
    );
  });

  model.datatypes.forEach((item) => {
    if (!isNonEmptyString(item.label)) {
      issues.push(createIssue({
        profile: "mim",
        severity: "error",
        code: "mim_missing_datatype_label",
        message: `Datatype "${item.id}" must have a non-empty label.`,
        path: `datatypes[${item.id}].label`,
      }));
    }

    validateOptionalIri(
      issues,
      "mim",
      "mim_invalid_datatype_iri",
      `Datatype "${item.id}" has an invalid IRI.`,
      `datatypes[${item.id}].iri`,
      item.iri,
    );
  });

  model.classes.forEach((item) => {
    validateMimClass(item, packageIds, datatypeIds, classIds, issues);
  });

  model.associations.forEach((item) => {
    validateMimAssociation(item, packageIds, classIds, issues);
  });
}

function validateMimClass(
  item: StandardsClass,
  packageIds: Set<string>,
  datatypeIds: Set<string>,
  classIds: Set<string>,
  issues: StandardsValidationIssue[],
) {
  if (!isNonEmptyString(item.label)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_missing_class_label",
      message: `Class "${item.id}" must have a non-empty label.`,
      path: `classes[${item.id}].label`,
    }));
  }

  validateOptionalIri(
    issues,
    "mim",
    "mim_invalid_class_iri",
    `Class "${item.id}" has an invalid IRI.`,
    `classes[${item.id}].iri`,
    item.iri,
  );

  if (item.packageId && !packageIds.has(item.packageId)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_unknown_package",
      message: `Class "${item.id}" references unknown package "${item.packageId}".`,
      path: `classes[${item.id}].packageId`,
    }));
  }

  item.attributes?.forEach((attribute) => {
    validateMimAttribute(item, attribute, datatypeIds, issues);
  });

  item.identifiers?.forEach((identifier) => {
    if (!isNonEmptyString(identifier.name)) {
      issues.push(createIssue({
        profile: "mim",
        severity: "error",
        code: "mim_missing_identifier_name",
        message: `Identifier "${identifier.id}" on class "${item.id}" must have a non-empty name.`,
        path: `classes[${item.id}].identifiers[${identifier.id}].name`,
      }));
    }
  });

  item.superClassIds?.forEach((superClassId) => {
    if (!classIds.has(superClassId)) {
      issues.push(createIssue({
        profile: "mim",
        severity: "error",
        code: "mim_unknown_superclass",
        message: `Class "${item.id}" references unknown superclass "${superClassId}".`,
        path: `classes[${item.id}].superClassIds[${superClassId}]`,
      }));
    }
  });
}

function validateMimAttribute(
  owningClass: StandardsClass,
  attribute: StandardsAttribute,
  datatypeIds: Set<string>,
  issues: StandardsValidationIssue[],
) {
  if (!isNonEmptyString(attribute.name)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_missing_attribute_name",
      message: `Attribute "${attribute.id}" on class "${owningClass.id}" must have a non-empty name.`,
      path: `classes[${owningClass.id}].attributes[${attribute.id}].name`,
    }));
  }

  if (attribute.datatypeId && !datatypeIds.has(attribute.datatypeId)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_unknown_datatype",
      message: `Attribute "${attribute.id}" on class "${owningClass.id}" references unknown datatype "${attribute.datatypeId}".`,
      path: `classes[${owningClass.id}].attributes[${attribute.id}].datatypeId`,
    }));
  }
}

function validateMimAssociation(
  item: StandardsAssociation,
  packageIds: Set<string>,
  classIds: Set<string>,
  issues: StandardsValidationIssue[],
) {
  if (!isNonEmptyString(item.label)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_missing_association_label",
      message: `Association "${item.id}" must have a non-empty label.`,
      path: `associations[${item.id}].label`,
    }));
  }

  validateOptionalIri(
    issues,
    "mim",
    "mim_invalid_association_iri",
    `Association "${item.id}" has an invalid IRI.`,
    `associations[${item.id}].iri`,
    item.iri,
  );

  if (item.packageId && !packageIds.has(item.packageId)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_unknown_association_package",
      message: `Association "${item.id}" references unknown package "${item.packageId}".`,
      path: `associations[${item.id}].packageId`,
    }));
  }

  if (!classIds.has(item.source.classId)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_unknown_association_source",
      message: `Association "${item.id}" references unknown source class "${item.source.classId}".`,
      path: `associations[${item.id}].source.classId`,
    }));
  }

  if (!classIds.has(item.target.classId)) {
    issues.push(createIssue({
      profile: "mim",
      severity: "error",
      code: "mim_unknown_association_target",
      message: `Association "${item.id}" references unknown target class "${item.target.classId}".`,
      path: `associations[${item.id}].target.classId`,
    }));
  }
}

function validateNlSbbProfile(model: StandardsModel, issues: StandardsValidationIssue[]) {
  const schemeIds = new Set(model.conceptSchemes.map((item) => item.id));
  const conceptsById = new Map(model.concepts.map((item) => [item.id, item]));

  model.conceptSchemes.forEach((item) => validateNlSbbScheme(item, issues));
  model.concepts.forEach((item) => validateNlSbbConcept(item, schemeIds, issues));
  model.conceptRelations.forEach((item) => validateNlSbbConceptRelation(item, conceptsById, issues));
}

function validateNlSbbScheme(item: StandardsConceptScheme, issues: StandardsValidationIssue[]) {
  if (!isNonEmptyString(item.label)) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_missing_scheme_label",
      message: `Concept scheme "${item.id}" must have a non-empty label.`,
      path: `conceptSchemes[${item.id}].label`,
    }));
  }

  validateOptionalIri(
    issues,
    "nl-sbb",
    "nl_sbb_invalid_scheme_iri",
    `Concept scheme "${item.id}" has an invalid IRI.`,
    `conceptSchemes[${item.id}].iri`,
    item.iri,
  );
}

function validateNlSbbConcept(
  item: StandardsConcept,
  schemeIds: Set<string>,
  issues: StandardsValidationIssue[],
) {
  if (!schemeIds.has(item.schemeId)) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_unknown_scheme",
      message: `Concept "${item.id}" references unknown concept scheme "${item.schemeId}".`,
      path: `concepts[${item.id}].schemeId`,
    }));
  }

  if (!isNonEmptyString(item.prefLabel)) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_missing_pref_label",
      message: `Concept "${item.id}" must have a non-empty preferred label.`,
      path: `concepts[${item.id}].prefLabel`,
    }));
  }

  validateOptionalIri(
    issues,
    "nl-sbb",
    "nl_sbb_invalid_concept_iri",
    `Concept "${item.id}" has an invalid IRI.`,
    `concepts[${item.id}].iri`,
    item.iri,
  );
}

function validateNlSbbConceptRelation(
  item: StandardsConceptRelation,
  conceptsById: Map<string, StandardsConcept>,
  issues: StandardsValidationIssue[],
) {
  const sourceConcept = conceptsById.get(item.sourceConceptId);
  const targetConcept = conceptsById.get(item.targetConceptId);

  if (!sourceConcept) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_unknown_relation_source",
      message: `Concept relation "${item.id}" references unknown source concept "${item.sourceConceptId}".`,
      path: `conceptRelations[${item.id}].sourceConceptId`,
    }));
  }

  if (!targetConcept) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_unknown_relation_target",
      message: `Concept relation "${item.id}" references unknown target concept "${item.targetConceptId}".`,
      path: `conceptRelations[${item.id}].targetConceptId`,
    }));
  }

  validateOptionalIri(
    issues,
    "nl-sbb",
    "nl_sbb_invalid_predicate_iri",
    `Concept relation "${item.id}" has an invalid predicate IRI.`,
    `conceptRelations[${item.id}].predicateIri`,
    item.predicateIri,
  );

  if (
    sourceConcept
    && targetConcept
    && (item.kind === "broader" || item.kind === "narrower")
    && sourceConcept.schemeId !== targetConcept.schemeId
  ) {
    issues.push(createIssue({
      profile: "nl-sbb",
      severity: "error",
      code: "nl_sbb_cross_scheme_relation",
      message: `Concept relation "${item.id}" connects concepts from different schemes ("${sourceConcept.schemeId}" and "${targetConcept.schemeId}").`,
      path: `conceptRelations[${item.id}]`,
    }));
  }
}

function validateRdfProfile(model: StandardsModel, issues: StandardsValidationIssue[]) {
  model.triples.forEach((triple) => validateRdfTriple(triple, issues));
}

function validateResourceTerm(
  term: StandardsResourceTerm,
  path: string,
  issues: StandardsValidationIssue[],
  invalidIriCode: string,
  invalidIriMessage: string,
) {
  if (term.termType === "blank-node") {
    if (!isValidBlankNodeId(term.value)) {
      issues.push(createIssue({
        profile: "rdf",
        severity: "error",
        code: "rdf_invalid_blank_node",
        message: `Blank node at "${path}" must start with "_:" and contain a stable identifier.`,
        path,
      }));
    }

    return;
  }

  if (!isAbsoluteIri(term.value)) {
    issues.push(createIssue({
      profile: "rdf",
      severity: "error",
      code: invalidIriCode,
      message: invalidIriMessage,
      path,
    }));
  }
}

function validateRdfTriple(triple: StandardsTriple, issues: StandardsValidationIssue[]) {
  validateResourceTerm(
    triple.subject,
    `triples[${triple.id}].subject`,
    issues,
    "rdf_invalid_subject_iri",
    `Triple "${triple.id}" has an invalid subject IRI.`,
  );

  if (!isAbsoluteIri(triple.predicate.value)) {
    issues.push(createIssue({
      profile: "rdf",
      severity: "error",
      code: "rdf_invalid_predicate_iri",
      message: `Triple "${triple.id}" has an invalid predicate IRI.`,
      path: `triples[${triple.id}].predicate`,
    }));
  }

  if (triple.object.termType === "literal") {
    if (triple.object.datatypeIri && !isAbsoluteIri(triple.object.datatypeIri)) {
      issues.push(createIssue({
        profile: "rdf",
        severity: "error",
        code: "rdf_invalid_literal_datatype_iri",
        message: `Triple "${triple.id}" literal object has an invalid datatype IRI.`,
        path: `triples[${triple.id}].object.datatypeIri`,
      }));
    }

    if (triple.object.datatypeIri && triple.object.language) {
      issues.push(createIssue({
        profile: "rdf",
        severity: "error",
        code: "rdf_literal_datatype_language_conflict",
        message: `Triple "${triple.id}" literal object cannot declare both a datatype IRI and a language tag.`,
        path: `triples[${triple.id}].object`,
      }));
    }
  } else {
    validateResourceTerm(
      triple.object,
      `triples[${triple.id}].object`,
      issues,
      "rdf_invalid_object_iri",
      `Triple "${triple.id}" has an invalid object IRI.`,
    );
  }

  if (triple.graph) {
    validateResourceTerm(
      triple.graph,
      `triples[${triple.id}].graph`,
      issues,
      "rdf_invalid_graph_iri",
      `Triple "${triple.id}" has an invalid graph IRI.`,
    );
  }
}

export function validateStandardsModel(model: StandardsModel): StandardsValidationResult {
  const issues: StandardsValidationIssue[] = [];

  if (model.profiles.includes("mim")) {
    validateMimProfile(model, issues);
  }

  if (model.profiles.includes("nl-sbb")) {
    validateNlSbbProfile(model, issues);
  }

  if (model.profiles.includes("rdf")) {
    validateRdfProfile(model, issues);
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}
