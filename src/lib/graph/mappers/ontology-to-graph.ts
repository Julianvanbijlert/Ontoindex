import type { Json } from "@/integrations/supabase/types";
import type { GraphModel } from "@/lib/graph/model";
import { mapOntologyToStandardsModel } from "@/lib/standards/mappers/ontology-to-standards";
import {
  createStandardsModel,
  type StandardsAssociation,
  type StandardsClass,
  type StandardsModel,
  type StandardsProfile,
} from "@/lib/standards/model";
import { projectStandardsToGraphModel } from "@/lib/standards/projections/standards-to-graph";

export interface OntologyGraphRelationship {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  label?: string | null;
  metadata?: Json;
}

export interface OntologyGraphDefinition {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  example?: string | null;
  status?: string | null;
  metadata?: Json;
  relationships?: OntologyGraphRelationship[] | null;
}

function readMetadataRecord(definition: OntologyGraphDefinition) {
  if (!definition.metadata || typeof definition.metadata !== "object" || Array.isArray(definition.metadata)) {
    return null;
  }

  return definition.metadata as Record<string, unknown>;
}

function readMetadataString(definition: OntologyGraphDefinition, key: string) {
  const metadata = readMetadataRecord(definition);
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toSyntheticPackageId(definition: OntologyGraphDefinition) {
  return readMetadataString(definition, "group")
    || readMetadataString(definition, "section")
    || readMetadataString(definition, "namespace");
}

function normalizeRelationKind(value: string) {
  return value.trim().toLowerCase();
}

function isInheritanceRelation(value: string) {
  const normalized = normalizeRelationKind(value);
  return normalized === "is_a"
    || normalized === "broader"
    || normalized === "extends"
    || normalized === "subclass_of"
    || normalized === "subclassof";
}

function buildSyntheticUmlClasses(definitions: OntologyGraphDefinition[]) {
  const knownDefinitionIds = new Set(definitions.map((definition) => definition.id));

  return definitions.map((definition) => {
    const superClassIds = (definition.relationships ?? [])
      .filter((relationship) =>
        relationship.source_id === definition.id
        && isInheritanceRelation(relationship.type)
        && knownDefinitionIds.has(relationship.target_id),
      )
      .map((relationship) => relationship.target_id);

    return {
      id: definition.id,
      label: definition.title,
      iri: readMetadataString(definition, "iri"),
      packageId: toSyntheticPackageId(definition),
      definition: definition.description || undefined,
      superClassIds,
      trace: {
        sourceIds: [definition.id],
        sourceFormat: "supabase-ontology-auto-uml",
      },
    } satisfies StandardsClass;
  });
}

function buildSyntheticUmlAssociations(definitions: OntologyGraphDefinition[]) {
  const knownDefinitionIds = new Set(definitions.map((definition) => definition.id));
  const byId = new Map<string, StandardsAssociation>();

  for (const definition of definitions) {
    for (const relationship of definition.relationships ?? []) {
      if (relationship.source_id !== definition.id) {
        continue;
      }

      if (isInheritanceRelation(relationship.type)) {
        continue;
      }

      if (!knownDefinitionIds.has(relationship.source_id) || !knownDefinitionIds.has(relationship.target_id)) {
        continue;
      }

      const label = relationship.label?.trim() || relationship.type.replace(/_/g, " ");

      if (byId.has(relationship.id)) {
        continue;
      }

      byId.set(relationship.id, {
        id: relationship.id,
        label,
        source: {
          classId: relationship.source_id,
        },
        target: {
          classId: relationship.target_id,
        },
        trace: {
          sourceIds: [relationship.id],
          sourceFormat: "supabase-ontology-auto-uml",
        },
      });
    }
  }

  return [...byId.values()];
}

function withSyntheticUmlProjection(
  model: StandardsModel,
  definitions: OntologyGraphDefinition[],
) {
  if (model.classes.length > 0 || definitions.length === 0) {
    return model;
  }

  const syntheticClasses = buildSyntheticUmlClasses(definitions);

  if (syntheticClasses.length === 0) {
    return model;
  }

  return createStandardsModel({
    ...model,
    profiles: [...new Set<StandardsProfile>([...model.profiles, "mim"])],
    classes: syntheticClasses,
    associations: buildSyntheticUmlAssociations(definitions),
    metadata: {
      ...model.metadata,
      sourceFormat: model.metadata?.sourceFormat || "supabase-ontology-auto-uml",
    },
  });
}

export function mapOntologyToGraphModel(input: {
  ontologyId?: string;
  ontologyTitle?: string;
  definitions: OntologyGraphDefinition[];
  preferredKind?: GraphModel["kind"];
}): GraphModel {
  const standardsModel = mapOntologyToStandardsModel({
    ontologyId: input.ontologyId,
    ontologyTitle: input.ontologyTitle,
    definitions: input.definitions,
  });
  const projectedStandardsModel = input.preferredKind === "uml-class"
    ? withSyntheticUmlProjection(standardsModel, input.definitions)
    : standardsModel;

  return projectStandardsToGraphModel(
    projectedStandardsModel,
    {
      ontologyId: input.ontologyId,
      preferredKind: input.preferredKind,
    },
  );
}
