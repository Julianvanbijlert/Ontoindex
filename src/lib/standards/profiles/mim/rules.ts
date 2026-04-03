import type {
  StandardsFindingInput,
  StandardsPackDefinition,
} from "@/lib/standards/engine/types";
import type {
  StandardsAssociation,
  StandardsAttribute,
  StandardsClass,
} from "@/lib/standards/model";
import {
  createFinding,
  createInvalidIriFinding,
  isAbsoluteIri,
  isNonEmptyString,
} from "@/lib/standards/profiles/shared";
import { getMimRelationSuggestions } from "@/lib/standards/profiles/mim/suggestions";

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

function validateMimAttribute(
  owningClass: StandardsClass,
  attribute: StandardsAttribute,
  datatypeIds: Set<string>,
  findings: StandardsFindingInput[],
) {
  if (!isNonEmptyString(attribute.name)) {
    findings.push(createFinding({
      message: `Attribute "${attribute.id}" on class "${owningClass.id}" must have a non-empty name.`,
      path: `classes[${owningClass.id}].attributes[${attribute.id}].name`,
      entityKind: "attribute",
      entityId: attribute.id,
      field: "name",
      relatedEntityId: owningClass.id,
    }));
  }

  if (attribute.datatypeId && !datatypeIds.has(attribute.datatypeId)) {
    findings.push(createFinding({
      message: `Attribute "${attribute.id}" on class "${owningClass.id}" references unknown datatype "${attribute.datatypeId}".`,
      path: `classes[${owningClass.id}].attributes[${attribute.id}].datatypeId`,
      entityKind: "attribute",
      entityId: attribute.id,
      field: "datatypeId",
      relatedEntityId: attribute.datatypeId,
    }));
  }
}

function validateMimClass(
  item: StandardsClass,
  packageIds: Set<string>,
  datatypeIds: Set<string>,
  classIds: Set<string>,
  findings: StandardsFindingInput[],
) {
  if (!isNonEmptyString(item.label)) {
    findings.push(createFinding({
      message: `Class "${item.id}" must have a non-empty label.`,
      path: `classes[${item.id}].label`,
      entityKind: "class",
      entityId: item.id,
      field: "label",
    }));
  }

  validateOptionalIri(
    findings,
    `Class "${item.id}" has an invalid IRI.`,
    `classes[${item.id}].iri`,
    "class",
    item.id,
    "iri",
    item.iri,
  );

  if (item.packageId && !packageIds.has(item.packageId)) {
    findings.push(createFinding({
      message: `Class "${item.id}" references unknown package "${item.packageId}".`,
      path: `classes[${item.id}].packageId`,
      entityKind: "class",
      entityId: item.id,
      field: "packageId",
      relatedEntityId: item.packageId,
    }));
  }

  item.attributes?.forEach((attribute) => {
    validateMimAttribute(item, attribute, datatypeIds, findings);
  });

  item.identifiers?.forEach((identifier) => {
    if (!isNonEmptyString(identifier.name)) {
      findings.push(createFinding({
        message: `Identifier "${identifier.id}" on class "${item.id}" must have a non-empty name.`,
        path: `classes[${item.id}].identifiers[${identifier.id}].name`,
        entityKind: "identifier",
        entityId: identifier.id,
        field: "name",
        relatedEntityId: item.id,
      }));
    }
  });

  item.superClassIds?.forEach((superClassId) => {
    if (!classIds.has(superClassId)) {
      findings.push(createFinding({
        message: `Class "${item.id}" references unknown superclass "${superClassId}".`,
        path: `classes[${item.id}].superClassIds[${superClassId}]`,
        entityKind: "class",
        entityId: item.id,
        field: "superClassIds",
        relatedEntityId: superClassId,
      }));
    }
  });
}

function validateMimAssociation(
  item: StandardsAssociation,
  packageIds: Set<string>,
  classIds: Set<string>,
  findings: StandardsFindingInput[],
) {
  if (!isNonEmptyString(item.label)) {
    findings.push(createFinding({
      message: `Association "${item.id}" must have a non-empty label.`,
      path: `associations[${item.id}].label`,
      entityKind: "association",
      entityId: item.id,
      field: "label",
    }));
  }

  validateOptionalIri(
    findings,
    `Association "${item.id}" has an invalid IRI.`,
    `associations[${item.id}].iri`,
    "association",
    item.id,
    "iri",
    item.iri,
  );

  if (item.packageId && !packageIds.has(item.packageId)) {
    findings.push(createFinding({
      message: `Association "${item.id}" references unknown package "${item.packageId}".`,
      path: `associations[${item.id}].packageId`,
      entityKind: "association",
      entityId: item.id,
      field: "packageId",
      relatedEntityId: item.packageId,
    }));
  }

  if (!classIds.has(item.source.classId)) {
    findings.push(createFinding({
      message: `Association "${item.id}" references unknown source class "${item.source.classId}".`,
      path: `associations[${item.id}].source.classId`,
      entityKind: "association",
      entityId: item.id,
      field: "source.classId",
      relatedEntityId: item.source.classId,
    }));
  }

  if (!classIds.has(item.target.classId)) {
    findings.push(createFinding({
      message: `Association "${item.id}" references unknown target class "${item.target.classId}".`,
      path: `associations[${item.id}].target.classId`,
      entityKind: "association",
      entityId: item.id,
      field: "target.classId",
      relatedEntityId: item.target.classId,
    }));
  }
}

export const mimStandardsPack: StandardsPackDefinition = {
  standardId: "mim",
  label: "MIM",
  description: "Initial MIM starter pack with structural UML-style checks and authoring suggestions.",
  getRelationSuggestions: getMimRelationSuggestions,
  rules: [
    {
      ruleId: "mim_missing_package_label",
      title: "MIM missing package label",
      description: "Packages should carry a visible label.",
      explanation: "The current MIM starter pack expects named packages so classes can be grouped clearly.",
      defaultSeverity: "error",
      validate: ({ model }) => model.packages.flatMap((item) => (
        !isNonEmptyString(item.label)
          ? [createFinding({
              message: `Package "${item.id}" must have a non-empty label.`,
              path: `packages[${item.id}].label`,
              entityKind: "package",
              entityId: item.id,
              field: "label",
            })]
          : []
      )),
    },
    {
      ruleId: "mim_invalid_package_iri",
      title: "MIM invalid package IRI",
      description: "Package IRIs should be absolute when present.",
      explanation: "Absolute IRIs keep exported package references stable across tooling.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const findings: StandardsFindingInput[] = [];
        model.packages.forEach((item) => {
          validateOptionalIri(
            findings,
            `Package "${item.id}" has an invalid IRI.`,
            `packages[${item.id}].iri`,
            "package",
            item.id,
            "iri",
            item.iri,
          );
        });
        return findings;
      },
    },
    {
      ruleId: "mim_missing_datatype_label",
      title: "MIM missing datatype label",
      description: "Datatypes should be labelled.",
      explanation: "Named datatypes make generated attributes and exports easier to review.",
      defaultSeverity: "error",
      validate: ({ model }) => model.datatypes.flatMap((item) => (
        !isNonEmptyString(item.label)
          ? [createFinding({
              message: `Datatype "${item.id}" must have a non-empty label.`,
              path: `datatypes[${item.id}].label`,
              entityKind: "datatype",
              entityId: item.id,
              field: "label",
            })]
          : []
      )),
    },
    {
      ruleId: "mim_invalid_datatype_iri",
      title: "MIM invalid datatype IRI",
      description: "Datatype IRIs should be absolute when present.",
      explanation: "Absolute datatype IRIs preserve compatibility with downstream type systems.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const findings: StandardsFindingInput[] = [];
        model.datatypes.forEach((item) => {
          validateOptionalIri(
            findings,
            `Datatype "${item.id}" has an invalid IRI.`,
            `datatypes[${item.id}].iri`,
            "datatype",
            item.id,
            "iri",
            item.iri,
          );
        });
        return findings;
      },
    },
    {
      ruleId: "mim_missing_class_label",
      title: "MIM missing class label",
      description: "Classes should have a visible label.",
      explanation: "The initial MIM pack expects every modeled class to be explicitly named.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "label");
      },
    },
    {
      ruleId: "mim_invalid_class_iri",
      title: "MIM invalid class IRI",
      description: "Class IRIs should be absolute when present.",
      explanation: "Absolute class IRIs make MIM exports and traceability more reliable.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "iri");
      },
    },
    {
      ruleId: "mim_unknown_package",
      title: "MIM unknown package reference",
      description: "Classes should only point to known packages.",
      explanation: "Unknown package references usually indicate incomplete imported UML metadata.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "packageId" && finding.entityKind === "class");
      },
    },
    {
      ruleId: "mim_missing_attribute_name",
      title: "MIM missing attribute name",
      description: "Attributes should have a stable name.",
      explanation: "Unnamed attributes are hard to serialize and cannot be referenced reliably.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "name" && finding.entityKind === "attribute");
      },
    },
    {
      ruleId: "mim_unknown_datatype",
      title: "MIM unknown datatype reference",
      description: "Attributes should reference known datatypes.",
      explanation: "Unknown datatypes usually mean imported class metadata is incomplete or inconsistent.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "datatypeId");
      },
    },
    {
      ruleId: "mim_missing_identifier_name",
      title: "MIM missing identifier name",
      description: "Identifiers should have a stable name.",
      explanation: "Named identifiers are needed to keep primary keys and semantic identifiers readable.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.entityKind === "identifier");
      },
    },
    {
      ruleId: "mim_unknown_superclass",
      title: "MIM unknown superclass reference",
      description: "Superclass references should resolve to known classes.",
      explanation: "Unknown superclass links can break inheritance projections and UML exports.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const datatypeIds = new Set(model.datatypes.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.classes.forEach((item) => validateMimClass(item, packageIds, datatypeIds, classIds, findings));
        return findings.filter((finding) => finding.field === "superClassIds");
      },
    },
    {
      ruleId: "mim_missing_association_label",
      title: "MIM missing association label",
      description: "Associations should carry a readable label.",
      explanation: "Named associations are easier to review in UML views and exported interchange formats.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.associations.forEach((item) => validateMimAssociation(item, packageIds, classIds, findings));
        return findings.filter((finding) => finding.field === "label");
      },
    },
    {
      ruleId: "mim_invalid_association_iri",
      title: "MIM invalid association IRI",
      description: "Association IRIs should be absolute when present.",
      explanation: "Absolute association IRIs keep exported relationship semantics stable.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.associations.forEach((item) => validateMimAssociation(item, packageIds, classIds, findings));
        return findings.filter((finding) => finding.field === "iri");
      },
    },
    {
      ruleId: "mim_unknown_association_package",
      title: "MIM unknown association package",
      description: "Associations should only point to known packages.",
      explanation: "Unknown package references usually mean the imported UML package structure is incomplete.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.associations.forEach((item) => validateMimAssociation(item, packageIds, classIds, findings));
        return findings.filter((finding) => finding.field === "packageId");
      },
    },
    {
      ruleId: "mim_unknown_association_source",
      title: "MIM unknown association source",
      description: "Association sources should resolve to existing classes.",
      explanation: "An association with a missing source class cannot be projected consistently.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.associations.forEach((item) => validateMimAssociation(item, packageIds, classIds, findings));
        return findings.filter((finding) => finding.field === "source.classId");
      },
    },
    {
      ruleId: "mim_unknown_association_target",
      title: "MIM unknown association target",
      description: "Association targets should resolve to existing classes.",
      explanation: "An association with a missing target class cannot be projected consistently.",
      defaultSeverity: "error",
      validate: ({ model }) => {
        const packageIds = new Set(model.packages.map((item) => item.id));
        const classIds = new Set(model.classes.map((item) => item.id));
        const findings: StandardsFindingInput[] = [];
        model.associations.forEach((item) => validateMimAssociation(item, packageIds, classIds, findings));
        return findings.filter((finding) => finding.field === "target.classId");
      },
    },
  ],
};
