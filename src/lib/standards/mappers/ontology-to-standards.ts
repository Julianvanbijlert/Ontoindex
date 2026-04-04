import type { Json } from "@/integrations/supabase/types";
import { getRelationshipDisplayLabel } from "@/lib/relationship-service";
import {
  createStandardsModel,
  type StandardsAssociation,
  type StandardsAttribute,
  type StandardsConcept,
  type StandardsConceptRelation,
  type StandardsIdentifier,
  type StandardsIriTerm,
  type StandardsClass,
  type StandardsModel,
  type StandardsTriple,
} from "@/lib/standards/model";

export interface OntologyStandardsRelationship {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  label?: string | null;
  metadata?: Json;
}

export interface OntologyStandardsDefinition {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  example?: string | null;
  status?: string | null;
  metadata?: Json;
  relationships?: OntologyStandardsRelationship[] | null;
}

function readStringMetadata(definition: OntologyStandardsDefinition, key: string) {
  const value = definition.metadata && typeof definition.metadata === "object" && !Array.isArray(definition.metadata)
    ? definition.metadata[key]
    : null;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanMetadata(definition: OntologyStandardsDefinition, key: string) {
  const value = definition.metadata && typeof definition.metadata === "object" && !Array.isArray(definition.metadata)
    ? definition.metadata[key]
    : null;

  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => !!item);
}

function readStandardsMetadata(definition: OntologyStandardsDefinition) {
  if (!isRecord(definition.metadata)) {
    return null;
  }

  const standards = definition.metadata.standards;
  return isRecord(standards) ? standards : null;
}

function readClassMetadata(definition: OntologyStandardsDefinition) {
  const standards = readStandardsMetadata(definition);

  if (!standards) {
    return null;
  }

  const value = standards.class;
  return isRecord(value) ? value : null;
}

function readRelationshipMetadata(relationship: OntologyStandardsRelationship) {
  return isRecord(relationship.metadata) ? relationship.metadata : null;
}

function readRelationshipStandardsMetadata(relationship: OntologyStandardsRelationship) {
  const metadata = readRelationshipMetadata(relationship);

  if (!metadata) {
    return null;
  }

  const standards = metadata.standards;
  return isRecord(standards) ? standards : null;
}

function readRelationMetadata(relationship: OntologyStandardsRelationship) {
  const standards = readRelationshipStandardsMetadata(relationship);

  if (!standards) {
    return null;
  }

  const relation = standards.relation;
  return isRecord(relation) ? relation : null;
}

function readAssociationMetadata(relationship: OntologyStandardsRelationship) {
  const standards = readRelationshipStandardsMetadata(relationship);

  if (!standards) {
    return null;
  }

  const association = standards.association;
  return isRecord(association) ? association : null;
}

function parseStandardsAttributes(prefix: string, value: unknown): StandardsAttribute[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const name = readString(item.name);

    if (!name) {
      return [];
    }

    return [{
      id: readString(item.id) || `${prefix}-attribute-${index + 1}`,
      name,
      label: readString(item.label) || undefined,
      datatypeId: readString(item.datatypeId) || undefined,
      cardinality: readString(item.cardinality) || undefined,
      definition: readString(item.definition) || undefined,
    } satisfies StandardsAttribute];
  });
}

function toValidConceptRelationKind(value: unknown): StandardsConceptRelation["kind"] | null {
  const normalized = readString(value)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "broader" || normalized === "narrower" || normalized === "related" || normalized === "custom") {
    return normalized;
  }

  return null;
}

function parseClassAttributes(definitionId: string, value: unknown): StandardsAttribute[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const name = readString(item.name);

    if (!name) {
      return [];
    }

    return [{
      id: readString(item.id) || `${definitionId}-attribute-${index + 1}`,
      name,
      label: readString(item.label) || undefined,
      datatypeId: readString(item.datatypeId) || undefined,
      cardinality: readString(item.cardinality) || undefined,
      definition: readString(item.definition) || undefined,
    } satisfies StandardsAttribute];
  });
}

function parseClassIdentifiers(definitionId: string, value: unknown): StandardsIdentifier[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const name = readString(item.name);

    if (!name) {
      return [];
    }

    return [{
      id: readString(item.id) || `${definitionId}-identifier-${index + 1}`,
      name,
      label: readString(item.label) || undefined,
      definition: readString(item.definition) || undefined,
    } satisfies StandardsIdentifier];
  });
}

function buildUmlClass(definition: OntologyStandardsDefinition): StandardsClass | null {
  const classMetadata = readClassMetadata(definition);

  if (!classMetadata) {
    return null;
  }

  return {
    id: definition.id,
    label: definition.title,
    iri: readStringMetadata(definition, "iri") ?? undefined,
    packageId: readString(classMetadata.packageId) || undefined,
    definition: definition.description || undefined,
    attributes: parseClassAttributes(definition.id, classMetadata.attributes),
    identifiers: parseClassIdentifiers(definition.id, classMetadata.identifiers),
    superClassIds: readStringArray(classMetadata.superClassIds),
    trace: {
      sourceIds: [definition.id],
      sourceFormat: readString(readStandardsMetadata(definition)?.sourceFormat) || "supabase-ontology",
    },
  };
}

function buildUmlAssociations(
  definitions: OntologyStandardsDefinition[],
  classIds: Set<string>,
): StandardsAssociation[] {
  const byId = new Map<string, StandardsAssociation>();

  for (const definition of definitions) {
    for (const relationship of definition.relationships || []) {
      if (!classIds.has(relationship.source_id) || !classIds.has(relationship.target_id)) {
        continue;
      }

      if (byId.has(relationship.id)) {
        continue;
      }

      const associationMetadata = readAssociationMetadata(relationship);
      const associationAttributes = parseStandardsAttributes(
        `${relationship.id}-association`,
        associationMetadata?.attributes,
      );

      byId.set(relationship.id, {
        id: relationship.id,
        label: readString(associationMetadata?.label)
          || getRelationshipDisplayLabel(relationship.type, relationship.label),
        iri: readString(associationMetadata?.iri) || undefined,
        source: {
          classId: relationship.source_id,
          role: readString(associationMetadata?.sourceRole) || undefined,
          cardinality: readString(associationMetadata?.sourceCardinality) || undefined,
        },
        target: {
          classId: relationship.target_id,
          role: readString(associationMetadata?.targetRole) || undefined,
          cardinality: readString(associationMetadata?.targetCardinality) || undefined,
        },
        ...(associationAttributes.length > 0 ? { attributes: associationAttributes } : {}),
        trace: {
          sourceIds: [relationship.id],
          sourceFormat: "supabase-ontology",
        },
      });
    }
  }

  return [...byId.values()];
}

function toPredicateIri(type: string) {
  const normalized = type.trim().toLowerCase();

  if (normalized === "is_a") {
    return "http://www.w3.org/2004/02/skos/core#broader";
  }

  if (normalized === "broader") {
    return "http://www.w3.org/2004/02/skos/core#broader";
  }

  if (normalized === "narrower") {
    return "http://www.w3.org/2004/02/skos/core#narrower";
  }

  if (normalized === "related") {
    return "http://www.w3.org/2004/02/skos/core#related";
  }

  if (normalized === "part_of") {
    return "http://www.w3.org/2004/02/skos/core#broader";
  }

  if (normalized === "related_to") {
    return "http://www.w3.org/2004/02/skos/core#related";
  }

  return `https://ontologyhub.local/predicate/${normalized}`;
}

function toConceptRelationKind(type: string): StandardsConceptRelation["kind"] {
  const normalized = type.trim().toLowerCase();

  if (normalized === "is_a" || normalized === "part_of" || normalized === "broader") {
    return "broader";
  }

  if (normalized === "narrower") {
    return "narrower";
  }

  if (normalized === "related") {
    return "related";
  }

  if (normalized === "related_to") {
    return "related";
  }

  return "custom";
}

function toIriTerm(value: string | undefined): StandardsIriTerm | null {
  return value?.trim()
    ? {
        termType: "iri",
        value: value.trim(),
      }
    : null;
}

function buildConcept(schemeId: string, definition: OntologyStandardsDefinition): StandardsConcept {
  const topConceptOfSchemeId = readStringMetadata(definition, "topConceptOfSchemeId")
    || (readBooleanMetadata(definition, "topConcept") ? schemeId : null);

  return {
    id: definition.id,
    schemeId,
    prefLabel: definition.title,
    altLabels: [],
    iri: readStringMetadata(definition, "iri") ?? undefined,
    definition: definition.description || undefined,
    scopeNote: definition.content || undefined,
    example: definition.example || undefined,
    sourceReference: readStringMetadata(definition, "sourceReference")
      || readStringMetadata(definition, "source")
      || undefined,
    sourceUrl: readStringMetadata(definition, "sourceUrl") ?? undefined,
    legalBasis: readStringMetadata(definition, "legalBasis") ?? undefined,
    legalBasisRequired: readBooleanMetadata(definition, "legalBasisRequired")
      ?? readBooleanMetadata(definition, "regulatory")
      ?? readBooleanMetadata(definition, "juridical")
      ?? undefined,
    language: readStringMetadata(definition, "language")
      || readStringMetadata(definition, "lang")
      || undefined,
    topConceptOfSchemeId: topConceptOfSchemeId ?? undefined,
    status: definition.status || undefined,
    namespace: readStringMetadata(definition, "namespace") ?? undefined,
    section: readStringMetadata(definition, "section") ?? undefined,
    group: readStringMetadata(definition, "group") ?? undefined,
    trace: {
      sourceIds: [definition.id],
      sourceFormat: "supabase-ontology",
    },
  };
}

function buildConceptRelations(definitions: OntologyStandardsDefinition[]): StandardsConceptRelation[] {
  return definitions.flatMap((definition) =>
    (definition.relationships || []).map((relationship) => {
      const relationMetadata = readRelationMetadata(relationship);
      const kind = toValidConceptRelationKind(relationMetadata?.kind) || toConceptRelationKind(relationship.type);
      const predicateKey = readString(relationMetadata?.predicateKey) || relationship.type;
      const relationAttributes = parseStandardsAttributes(`${relationship.id}-relation`, relationMetadata?.attributes);

      return {
        id: relationship.id,
        sourceConceptId: relationship.source_id,
        targetConceptId: relationship.target_id,
        kind,
        label: readString(relationMetadata?.label) || getRelationshipDisplayLabel(relationship.type, relationship.label),
        predicateIri: readString(relationMetadata?.predicateIri) || toPredicateIri(predicateKey),
        predicateKey,
        ...(relationAttributes.length > 0 ? { attributes: relationAttributes } : {}),
        trace: {
          sourceIds: [relationship.id],
          sourceFormat: "supabase-ontology",
        },
      } satisfies StandardsConceptRelation;
    }),
  );
}

function buildTriples(
  conceptsById: Map<string, StandardsConcept>,
  relations: StandardsConceptRelation[],
): StandardsTriple[] {
  return relations.flatMap((relation) => {
    const sourceConcept = conceptsById.get(relation.sourceConceptId);
    const targetConcept = conceptsById.get(relation.targetConceptId);
    const subject = toIriTerm(sourceConcept?.iri);
    const object = toIriTerm(targetConcept?.iri);

    if (!subject || !object) {
      return [];
    }

    return [
      {
        id: relation.id,
        subject,
        predicate: {
          termType: "iri",
          value: relation.predicateIri ?? toPredicateIri(relation.predicateKey ?? relation.kind),
        },
        object,
        trace: relation.trace,
      },
    ];
  });
}

export function mapOntologyToStandardsModel(input: {
  ontologyId?: string;
  ontologyTitle?: string;
  definitions: OntologyStandardsDefinition[];
}): StandardsModel {
  const schemeId = input.ontologyId ?? "ontology";
  const concepts = input.definitions.map((definition) => buildConcept(schemeId, definition));
  const conceptRelations = buildConceptRelations(input.definitions);
  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
  const classes = input.definitions
    .map((definition) => buildUmlClass(definition))
    .filter((candidate): candidate is StandardsClass => !!candidate);
  const classIds = new Set(classes.map((item) => item.id));
  const associations = buildUmlAssociations(input.definitions, classIds);
  const classSourceFormat = classes
    .map((item) => item.trace?.sourceFormat)
    .find((value): value is string => typeof value === "string" && !!value.trim());
  const profiles = [...new Set([
    "nl-sbb",
    "rdf",
    ...(classes.length > 0 ? ["mim"] : []),
  ])] as StandardsModel["profiles"];

  return createStandardsModel({
    profiles,
    classes,
    associations,
    conceptSchemes: [
      {
        id: schemeId,
        label: input.ontologyTitle?.trim() || input.ontologyId?.trim() || "Ontology",
        trace: {
          sourceIds: input.ontologyId ? [input.ontologyId] : undefined,
          sourceFormat: "supabase-ontology",
        },
      },
    ],
    concepts,
    conceptRelations,
    triples: buildTriples(conceptsById, conceptRelations),
    metadata: {
      ontologyId: input.ontologyId,
      sourceFormat: classSourceFormat || "supabase-ontology",
    },
  });
}
