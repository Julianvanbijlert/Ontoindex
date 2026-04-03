import type { GraphEdge, GraphModel, GraphNode } from "@/lib/graph/model";
import type {
  StandardsConceptRelation,
  StandardsLiteralTerm,
  StandardsModel,
  StandardsObjectTerm,
  StandardsResourceTerm,
} from "@/lib/standards/model";

function toGraphEdgeKind(relation: StandardsConceptRelation) {
  if (relation.predicateKey?.trim()) {
    return relation.predicateKey.trim();
  }

  if (relation.kind === "broader") {
    return "is_a";
  }

  if (relation.kind === "narrower") {
    return "narrower";
  }

  return "related_to";
}

function toGraphNode(model: StandardsModel, conceptId: string): GraphNode | null {
  const concept = model.concepts.find((candidate) => candidate.id === conceptId);

  if (!concept) {
    return null;
  }

  return {
    id: concept.id,
    kind: "definition",
    label: concept.prefLabel,
    secondaryLabel: concept.status || undefined,
    types: ["definition", "concept"],
    iri: concept.iri,
    semantic: {
      skosConcept: true,
    },
    properties: {
      description: concept.definition || "",
      content: concept.scopeNote || "",
      example: concept.example || "",
      status: concept.status || "draft",
      ...(concept.namespace ? { namespace: concept.namespace } : {}),
      ...(concept.section ? { section: concept.section } : {}),
      ...(concept.group ? { group: concept.group } : {}),
    },
  };
}

function toGraphEdge(relation: StandardsConceptRelation): GraphEdge {
  return {
    id: relation.id,
    source: relation.sourceConceptId,
    target: relation.targetConceptId,
    kind: toGraphEdgeKind(relation),
    label: relation.label || relation.kind.replace(/_/g, " "),
    predicateIri: relation.predicateIri,
    directed: true,
    semantic: {
      skosRelation: relation.kind === "broader" || relation.kind === "narrower" || relation.kind === "related",
    },
    properties: {
      type: relation.predicateKey ?? relation.kind,
      conceptRelationKind: relation.kind,
    },
  };
}

const RDF_TYPE_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_CLASS_IRI = "http://www.w3.org/2000/01/rdf-schema#Class";
const OWL_CLASS_IRI = "http://www.w3.org/2002/07/owl#Class";
const SKOS_CONCEPT_IRI = "http://www.w3.org/2004/02/skos/core#Concept";
const LABEL_PREDICATE_IRIS = new Set([
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2004/02/skos/core#prefLabel",
]);

function iriLocalName(value: string) {
  const normalized = value.trim().replace(/[\\/#]+$/, "");
  const splitIndex = Math.max(
    normalized.lastIndexOf("#"),
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf(":"),
  );

  if (splitIndex < 0 || splitIndex === normalized.length - 1) {
    return normalized;
  }

  return normalized.slice(splitIndex + 1);
}

function toResourceTermKey(term: StandardsResourceTerm) {
  return `${term.termType}:${term.value}`;
}

function toResourceNodeId(term: StandardsResourceTerm) {
  return `resource:${term.termType}:${encodeURIComponent(term.value)}`;
}

function toLiteralTermKey(term: StandardsLiteralTerm) {
  return `${term.value}\u0000${term.datatypeIri || ""}\u0000${term.language || ""}`;
}

function toLiteralNodeId(term: StandardsLiteralTerm) {
  return `literal:${encodeURIComponent(toLiteralTermKey(term))}`;
}

function literalNodeLabel(term: StandardsLiteralTerm) {
  const value = term.value.replace(/\s+/g, " ").trim();

  if (!value) {
    return "<empty literal>";
  }

  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function getResourceFallbackLabel(term: StandardsResourceTerm) {
  if (term.termType === "blank-node") {
    return term.value;
  }

  return iriLocalName(term.value) || term.value;
}

function normalizePredicateKey(predicateIri: string) {
  const key = iriLocalName(predicateIri).trim();
  return key || "related";
}

export function projectStandardsOntologyToGraphModel(
  model: StandardsModel,
  options: {
    ontologyId?: string;
  } = {},
): GraphModel {
  const nodes = model.concepts
    .map((concept) => toGraphNode(model, concept.id))
    .filter((node): node is GraphNode => !!node);
  const edges = model.conceptRelations.map(toGraphEdge);

  return {
    kind: "ontology",
    nodes,
    edges,
    metadata: {
      ontologyId: options.ontologyId ?? model.metadata?.ontologyId,
      sourceFormat: model.metadata?.sourceFormat ?? "standards-canonical",
      layoutHint: "ontology",
      standards: model.profiles,
    },
  };
}

type RdfGraphKind = Extract<GraphModel["kind"], "knowledge-graph" | "property-graph">;

function buildRdfLabelByResource(model: StandardsModel) {
  const labelsByResource = new Map<string, string>();

  for (const triple of model.triples) {
    if (triple.object.termType !== "literal" || !LABEL_PREDICATE_IRIS.has(triple.predicate.value)) {
      continue;
    }

    const label = triple.object.value.trim();

    if (!label) {
      continue;
    }

    const key = toResourceTermKey(triple.subject);

    if (!labelsByResource.has(key)) {
      labelsByResource.set(key, label);
    }
  }

  return labelsByResource;
}

function buildRdfTypesByResource(model: StandardsModel) {
  const rdfTypesByResource = new Map<string, Set<string>>();

  for (const triple of model.triples) {
    if (triple.predicate.value !== RDF_TYPE_IRI || triple.object.termType !== "iri") {
      continue;
    }

    const key = toResourceTermKey(triple.subject);
    const bucket = rdfTypesByResource.get(key) ?? new Set<string>();
    bucket.add(triple.object.value);
    rdfTypesByResource.set(key, bucket);
  }

  return rdfTypesByResource;
}

function buildResourceGraphNode(input: {
  term: StandardsResourceTerm;
  labelsByResource: Map<string, string>;
  rdfTypesByResource: Map<string, Set<string>>;
}): GraphNode {
  const key = toResourceTermKey(input.term);
  const rdfTypes = [...(input.rdfTypesByResource.get(key) ?? new Set<string>())];

  return {
    id: toResourceNodeId(input.term),
    kind: "resource",
    label: input.labelsByResource.get(key) ?? getResourceFallbackLabel(input.term),
    iri: input.term.termType === "iri" ? input.term.value : undefined,
    types: rdfTypes.length > 0 ? rdfTypes : undefined,
    semantic: {
      rdfClass: rdfTypes.includes(RDFS_CLASS_IRI) || rdfTypes.includes(OWL_CLASS_IRI),
      owlClass: rdfTypes.includes(OWL_CLASS_IRI),
      skosConcept: rdfTypes.includes(SKOS_CONCEPT_IRI),
    },
    properties: {
      termType: input.term.termType,
      ...(rdfTypes.length > 0 ? { rdfTypes } : {}),
    },
  };
}

function buildLiteralGraphNode(term: StandardsLiteralTerm): GraphNode {
  const secondaryLabel = term.language?.trim() || term.datatypeIri?.trim() || undefined;

  return {
    id: toLiteralNodeId(term),
    kind: "literal",
    label: literalNodeLabel(term),
    secondaryLabel,
    types: ["literal"],
    properties: {
      termType: "literal",
      value: term.value,
      ...(term.language ? { language: term.language } : {}),
      ...(term.datatypeIri ? { datatypeIri: term.datatypeIri } : {}),
    },
  };
}

function ensureRdfNode(
  term: StandardsResourceTerm | StandardsObjectTerm,
  context: {
    nodesById: Map<string, GraphNode>;
    labelsByResource: Map<string, string>;
    rdfTypesByResource: Map<string, Set<string>>;
  },
): string {
  if (term.termType === "literal") {
    const nodeId = toLiteralNodeId(term);

    if (!context.nodesById.has(nodeId)) {
      context.nodesById.set(nodeId, buildLiteralGraphNode(term));
    }

    return nodeId;
  }

  const nodeId = toResourceNodeId(term);

  if (!context.nodesById.has(nodeId)) {
    context.nodesById.set(nodeId, buildResourceGraphNode({
      term,
      labelsByResource: context.labelsByResource,
      rdfTypesByResource: context.rdfTypesByResource,
    }));
  }

  return nodeId;
}

export function projectStandardsRdfToGraphModel(
  model: StandardsModel,
  options: {
    ontologyId?: string;
    kind?: RdfGraphKind;
  } = {},
): GraphModel {
  const kind = options.kind ?? "knowledge-graph";
  const labelsByResource = buildRdfLabelByResource(model);
  const rdfTypesByResource = buildRdfTypesByResource(model);
  const nodesById = new Map<string, GraphNode>();

  const edges = model.triples.map((triple) => {
    const source = ensureRdfNode(triple.subject, {
      nodesById,
      labelsByResource,
      rdfTypesByResource,
    });
    const target = ensureRdfNode(triple.object, {
      nodesById,
      labelsByResource,
      rdfTypesByResource,
    });
    const predicateKey = normalizePredicateKey(triple.predicate.value);

    return {
      id: triple.id,
      source,
      target,
      kind: predicateKey,
      label: predicateKey,
      predicateIri: triple.predicate.value,
      directed: true,
      semantic: {
        owlRelation: triple.predicate.value === RDF_TYPE_IRI,
      },
      properties: {
        predicateKey,
        objectTermType: triple.object.termType,
        ...(triple.graph ? { graphTermType: triple.graph.termType, graphValue: triple.graph.value } : {}),
      },
    } satisfies GraphEdge;
  });

  return {
    kind,
    nodes: [...nodesById.values()],
    edges,
    metadata: {
      ontologyId: options.ontologyId ?? model.metadata?.ontologyId,
      sourceFormat: model.metadata?.sourceFormat ?? "standards-canonical",
      layoutHint: kind,
      standards: model.profiles,
    },
  };
}

function toUmlAttributeType(model: StandardsModel, datatypeId: string | undefined) {
  if (!datatypeId) {
    return undefined;
  }

  const datatype = model.datatypes.find((candidate) => candidate.id === datatypeId);
  return datatype?.label || datatypeId;
}

function toUmlGraphNode(model: StandardsModel, classId: string): GraphNode | null {
  const sourceClass = model.classes.find((candidate) => candidate.id === classId);

  if (!sourceClass) {
    return null;
  }

  const attributes = sourceClass.attributes?.map((attribute) => ({
    name: attribute.label?.trim() || attribute.name,
    type: toUmlAttributeType(model, attribute.datatypeId),
    visibility: "+" as const,
  }));

  return {
    id: sourceClass.id,
    kind: "class",
    label: sourceClass.label,
    secondaryLabel: sourceClass.packageId,
    iri: sourceClass.iri,
    semantic: {
      umlClass: true,
    },
    properties: {
      description: sourceClass.definition || "",
      ...(sourceClass.packageId ? { packageId: sourceClass.packageId } : {}),
      ...(attributes && attributes.length > 0 ? { attributes } : {}),
      ...(sourceClass.identifiers && sourceClass.identifiers.length > 0
        ? {
            identifiers: sourceClass.identifiers.map((identifier) => identifier.label?.trim() || identifier.name),
          }
        : {}),
    },
  };
}

function buildUmlInheritanceEdges(model: StandardsModel) {
  const knownClassIds = new Set(model.classes.map((candidate) => candidate.id));

  return model.classes.flatMap((sourceClass) =>
    (sourceClass.superClassIds ?? [])
      .filter((targetClassId) => knownClassIds.has(targetClassId))
      .map((targetClassId) => ({
        id: `${sourceClass.id}::extends::${targetClassId}`,
        source: sourceClass.id,
        target: targetClassId,
        kind: "extends",
        label: "inherits",
        directed: true,
      } satisfies GraphEdge)),
  );
}

function buildUmlAssociationEdges(model: StandardsModel) {
  const knownClassIds = new Set(model.classes.map((candidate) => candidate.id));

  return model.associations
    .filter(
      (association) =>
        knownClassIds.has(association.source.classId) && knownClassIds.has(association.target.classId),
    )
    .map((association) => ({
      id: association.id,
      source: association.source.classId,
      target: association.target.classId,
      kind: "association",
      label: association.label,
      directed: true,
      semantic: {
        umlAssociation: true,
      },
      properties: {
        ...(association.source.role ? { sourceRole: association.source.role } : {}),
        ...(association.target.role ? { targetRole: association.target.role } : {}),
        ...(association.source.cardinality ? { sourceCardinality: association.source.cardinality } : {}),
        ...(association.target.cardinality ? { targetCardinality: association.target.cardinality } : {}),
        ...(association.attributes && association.attributes.length > 0
          ? {
              associationAttributes: association.attributes.map((attribute) => ({
                id: attribute.id,
                name: attribute.name,
                ...(attribute.label ? { label: attribute.label } : {}),
                ...(attribute.datatypeId ? { datatypeId: attribute.datatypeId } : {}),
                ...(attribute.cardinality ? { cardinality: attribute.cardinality } : {}),
                ...(attribute.definition ? { definition: attribute.definition } : {}),
              })),
            }
          : {}),
      },
    } satisfies GraphEdge));
}

function buildUmlGroups(model: StandardsModel) {
  const packageById = new Map(model.packages.map((item) => [item.id, item]));
  const classIdsByPackage = model.classes.reduce<Map<string, string[]>>((accumulator, item) => {
    if (!item.packageId) {
      return accumulator;
    }

    const bucket = accumulator.get(item.packageId) ?? [];
    bucket.push(item.id);
    accumulator.set(item.packageId, bucket);
    return accumulator;
  }, new Map<string, string[]>());

  const groups = Array.from(classIdsByPackage.entries())
    .map(([packageId, nodeIds]) => ({
      id: packageId,
      label: packageById.get(packageId)?.label || packageId,
      nodeIds: [...nodeIds].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return groups.length > 0 ? groups : undefined;
}

export function projectStandardsUmlToGraphModel(
  model: StandardsModel,
  options: {
    ontologyId?: string;
  } = {},
): GraphModel {
  const nodes = model.classes
    .map((sourceClass) => toUmlGraphNode(model, sourceClass.id))
    .filter((node): node is GraphNode => !!node);
  const edges = [...buildUmlInheritanceEdges(model), ...buildUmlAssociationEdges(model)];

  return {
    kind: "uml-class",
    nodes,
    edges,
    groups: buildUmlGroups(model),
    metadata: {
      ontologyId: options.ontologyId ?? model.metadata?.ontologyId,
      sourceFormat: model.metadata?.sourceFormat ?? "standards-canonical",
      layoutHint: "uml-class",
      standards: model.profiles,
    },
  };
}

export function projectStandardsToGraphModel(
  model: StandardsModel,
  options: {
    ontologyId?: string;
    preferredKind?: GraphModel["kind"];
  } = {},
): GraphModel {
  if (options.preferredKind === "ontology") {
    return projectStandardsOntologyToGraphModel(model, options);
  }

  if (options.preferredKind === "uml-class") {
    return model.classes.length > 0
      ? projectStandardsUmlToGraphModel(model, options)
      : projectStandardsOntologyToGraphModel(model, options);
  }

  if (options.preferredKind === "knowledge-graph" || options.preferredKind === "property-graph") {
    if (model.triples.length > 0) {
      return projectStandardsRdfToGraphModel(model, {
        ...options,
        kind: options.preferredKind,
      });
    }

    return projectStandardsOntologyToGraphModel(model, options);
  }

  const hasCanonicalUmlData = model.classes.length > 0;
  const prefersUml = hasCanonicalUmlData && (model.profiles.includes("mim") || model.concepts.length === 0);

  if (prefersUml) {
    return projectStandardsUmlToGraphModel(model, options);
  }

  const hasRdfOnlyData = model.triples.length > 0 && model.concepts.length === 0 && model.classes.length === 0;

  if (hasRdfOnlyData) {
    return projectStandardsRdfToGraphModel(model, options);
  }

  return projectStandardsOntologyToGraphModel(model, options);
}
