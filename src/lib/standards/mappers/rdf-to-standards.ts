import {
  createStandardsModel,
  type StandardsConcept,
  type StandardsConceptRelation,
  type StandardsConceptScheme,
  type StandardsIriTerm,
  type StandardsLiteralTerm,
  type StandardsModel,
  type StandardsObjectTerm,
  type StandardsProfile,
  type StandardsResourceTerm,
  type StandardsTriple,
} from "@/lib/standards/model";

export interface ImportedLiteralObject {
  type: "literal";
  value: string;
  datatypeIri?: string;
  language?: string;
}

export interface ImportedResourceObject {
  type: "uri";
  value: string;
}

export type ImportedTripleObject = ImportedLiteralObject | ImportedResourceObject;

export interface ImportedTriple {
  subject: string;
  predicate: string;
  object: ImportedTripleObject;
  graph?: string;
}

interface ResourceState {
  id: string;
  iri?: string;
  prefLabel?: string;
  altLabels: string[];
  definition?: string;
  scopeNote?: string;
  example?: string;
  status?: string;
  namespace?: string;
  section?: string;
  group?: string;
  schemeId?: string;
  types: Set<string>;
}

const RDF_TYPE_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL_IRI = "http://www.w3.org/2000/01/rdf-schema#label";
const RDFS_COMMENT_IRI = "http://www.w3.org/2000/01/rdf-schema#comment";
const OWL_CLASS_IRI = "http://www.w3.org/2002/07/owl#Class";
const SKOS_CONCEPT_IRI = "http://www.w3.org/2004/02/skos/core#Concept";
const SKOS_CONCEPT_SCHEME_IRI = "http://www.w3.org/2004/02/skos/core#ConceptScheme";
const SKOS_PREF_LABEL_IRI = "http://www.w3.org/2004/02/skos/core#prefLabel";
const SKOS_ALT_LABEL_IRI = "http://www.w3.org/2004/02/skos/core#altLabel";
const SKOS_DEFINITION_IRI = "http://www.w3.org/2004/02/skos/core#definition";
const SKOS_SCOPE_NOTE_IRI = "http://www.w3.org/2004/02/skos/core#scopeNote";
const SKOS_EXAMPLE_IRI = "http://www.w3.org/2004/02/skos/core#example";
const SKOS_IN_SCHEME_IRI = "http://www.w3.org/2004/02/skos/core#inScheme";
const SKOS_BROADER_IRI = "http://www.w3.org/2004/02/skos/core#broader";
const SKOS_NARROWER_IRI = "http://www.w3.org/2004/02/skos/core#narrower";
const SKOS_RELATED_IRI = "http://www.w3.org/2004/02/skos/core#related";
const ONTO_NAMESPACE_IRI = "https://ontologyhub.local/schema#namespace";
const ONTO_SECTION_IRI = "https://ontologyhub.local/schema#section";
const ONTO_GROUP_IRI = "https://ontologyhub.local/schema#group";
const ONTO_CONTEXT_IRI = "https://ontologyhub.local/schema#context";
const ONTO_STATUS_IRI = "https://ontologyhub.local/schema#status";
const ONTO_RELATED_DEFINITION_IRI = "https://ontologyhub.local/schema#relatedDefinition";

function localName(value: string) {
  const normalized = value.trim();
  const fragments = normalized.split(/[#/:]/);
  return fragments[fragments.length - 1]?.toLowerCase() || normalized.toLowerCase();
}

function isBlankNode(value: string) {
  return value.startsWith("_:");
}

function toResourceTerm(value: string): StandardsResourceTerm {
  return isBlankNode(value)
    ? {
        termType: "blank-node",
        value,
      }
    : {
        termType: "iri",
        value,
      };
}

function toObjectTerm(object: ImportedTripleObject): StandardsObjectTerm {
  if (object.type === "literal") {
    const literal: StandardsLiteralTerm = {
      termType: "literal",
      value: object.value,
      ...(object.datatypeIri ? { datatypeIri: object.datatypeIri } : {}),
      ...(object.language ? { language: object.language } : {}),
    };

    return literal;
  }

  return toResourceTerm(object.value);
}

function getOrCreateState(states: Map<string, ResourceState>, id: string) {
  const existing = states.get(id);

  if (existing) {
    return existing;
  }

  const created: ResourceState = {
    id,
    iri: isBlankNode(id) ? undefined : id,
    altLabels: [],
    types: new Set<string>(),
  };
  states.set(id, created);
  return created;
}

function addAltLabel(state: ResourceState, value: string) {
  const normalized = value.trim();

  if (normalized && !state.altLabels.includes(normalized)) {
    state.altLabels.push(normalized);
  }
}

function toConceptRelationKind(predicate: string): StandardsConceptRelation["kind"] {
  const key = localName(predicate);

  if (key === "broader" || key === "subclassof" || key === "partof") {
    return "broader";
  }

  if (key === "narrower") {
    return "narrower";
  }

  if (key === "related" || key === "relateddefinition") {
    return "related";
  }

  return "custom";
}

function createDefaultSchemeId(sourceFormat: string) {
  return `urn:standards:import:${sourceFormat}:scheme`;
}

function createFallbackLabel(id: string) {
  const fragment = id.split(/[#/]/).pop()?.trim();
  return fragment || id;
}

export function mapRdfTriplesToStandardsModel(input: {
  triples: ImportedTriple[];
  sourceFormat: string;
  defaultSchemeLabel?: string;
}): StandardsModel {
  const states = new Map<string, ResourceState>();
  const relationCandidates: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    predicate: string;
  }> = [];
  const standardsTriples: StandardsTriple[] = input.triples.map((triple, index) => ({
    id: `${input.sourceFormat}-triple-${index + 1}`,
    subject: toResourceTerm(triple.subject),
    predicate: {
      termType: "iri",
      value: triple.predicate,
    } satisfies StandardsIriTerm,
    object: toObjectTerm(triple.object),
    ...(triple.graph ? { graph: toResourceTerm(triple.graph) } : {}),
    trace: {
      sourceIds: [String(index + 1)],
      sourceFormat: input.sourceFormat,
    },
  }));

  for (const triple of input.triples) {
    const subjectState = getOrCreateState(states, triple.subject);
    const predicateKey = localName(triple.predicate);

    if (triple.predicate === RDF_TYPE_IRI && triple.object.type === "uri") {
      subjectState.types.add(triple.object.value);
      continue;
    }

    if (triple.object.type === "literal") {
      const literalValue = triple.object.value.trim();

      if (!literalValue) {
        continue;
      }

      if (triple.predicate === SKOS_PREF_LABEL_IRI || triple.predicate === RDFS_LABEL_IRI || ["label", "title", "name"].includes(predicateKey)) {
        subjectState.prefLabel ??= literalValue;
      } else if (triple.predicate === SKOS_ALT_LABEL_IRI || predicateKey === "altlabel") {
        addAltLabel(subjectState, literalValue);
      } else if (triple.predicate === SKOS_DEFINITION_IRI || triple.predicate === RDFS_COMMENT_IRI || ["definition", "description", "comment"].includes(predicateKey)) {
        subjectState.definition ??= literalValue;
      } else if (triple.predicate === SKOS_SCOPE_NOTE_IRI || triple.predicate === ONTO_CONTEXT_IRI || ["scopenote", "context", "note"].includes(predicateKey)) {
        subjectState.scopeNote ??= literalValue;
      } else if (triple.predicate === SKOS_EXAMPLE_IRI || predicateKey === "example") {
        subjectState.example ??= literalValue;
      } else if (triple.predicate === ONTO_STATUS_IRI || predicateKey === "status") {
        subjectState.status ??= literalValue;
      } else if (triple.predicate === ONTO_NAMESPACE_IRI || predicateKey === "namespace") {
        subjectState.namespace ??= literalValue;
      } else if (triple.predicate === ONTO_SECTION_IRI || predicateKey === "section") {
        subjectState.section ??= literalValue;
      } else if (triple.predicate === ONTO_GROUP_IRI || predicateKey === "group") {
        subjectState.group ??= literalValue;
      }

      continue;
    }

    if (triple.predicate === SKOS_IN_SCHEME_IRI || predicateKey === "inscheme") {
      subjectState.schemeId = triple.object.value;
      getOrCreateState(states, triple.object.value);
      continue;
    }

    if (
      triple.predicate === SKOS_BROADER_IRI
      || triple.predicate === SKOS_NARROWER_IRI
      || triple.predicate === SKOS_RELATED_IRI
      || triple.predicate === ONTO_RELATED_DEFINITION_IRI
      || ["broader", "narrower", "related", "relateddefinition", "subclassof", "partof"].includes(predicateKey)
    ) {
      relationCandidates.push({
        id: `${triple.subject}::${triple.predicate}::${triple.object.value}`,
        sourceId: triple.subject,
        targetId: triple.object.value,
        predicate: triple.predicate,
      });
      getOrCreateState(states, triple.object.value);
    }
  }

  const schemeResourceIds = new Set<string>();
  states.forEach((state) => {
    if (state.types.has(SKOS_CONCEPT_SCHEME_IRI) || state.types.has("owl:Ontology") || localName(state.id) === "conceptscheme") {
      schemeResourceIds.add(state.id);
    }

    if (state.schemeId) {
      schemeResourceIds.add(state.schemeId);
    }
  });

  const conceptCandidateIds = Array.from(states.values())
    .filter((state) => {
      if (schemeResourceIds.has(state.id)) {
        return false;
      }

      return (
        state.types.has(SKOS_CONCEPT_IRI)
        || state.types.has(OWL_CLASS_IRI)
        || !!state.schemeId
        || !!state.prefLabel
        || !!state.definition
        || !!state.scopeNote
        || relationCandidates.some((candidate) => candidate.sourceId === state.id || candidate.targetId === state.id)
      );
    })
    .map((state) => state.id);

  const conceptsNeedDefaultScheme = conceptCandidateIds.some((id) => !states.get(id)?.schemeId);
  const defaultSchemeId = conceptsNeedDefaultScheme ? createDefaultSchemeId(input.sourceFormat) : null;

  const conceptSchemes: StandardsConceptScheme[] = [
    ...Array.from(schemeResourceIds).map((id) => {
      const state = states.get(id);
      return {
        id,
        label: state?.prefLabel || createFallbackLabel(id),
        iri: isBlankNode(id) ? undefined : id,
        definition: state?.definition,
        status: state?.status,
        trace: {
          sourceIds: [id],
          sourceFormat: input.sourceFormat,
        },
      };
    }),
    ...(defaultSchemeId
      ? [{
          id: defaultSchemeId,
          label: input.defaultSchemeLabel || "Imported Concepts",
          trace: {
            sourceIds: [defaultSchemeId],
            sourceFormat: input.sourceFormat,
          },
        }]
      : []),
  ];

  const concepts: StandardsConcept[] = conceptCandidateIds.map((id) => {
    const state = states.get(id)!;
    return {
      id,
      schemeId: state.schemeId || defaultSchemeId || createDefaultSchemeId(input.sourceFormat),
      prefLabel: state.prefLabel || createFallbackLabel(id),
      altLabels: state.altLabels,
      iri: state.iri,
      definition: state.definition,
      scopeNote: state.scopeNote,
      example: state.example,
      status: state.status,
      namespace: state.namespace,
      section: state.section,
      group: state.group,
      trace: {
        sourceIds: [id],
        sourceFormat: input.sourceFormat,
      },
    };
  });

  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const conceptRelations: StandardsConceptRelation[] = relationCandidates
    .filter((candidate) => conceptIds.has(candidate.sourceId) && conceptIds.has(candidate.targetId))
    .map((candidate) => ({
      id: candidate.id,
      sourceConceptId: candidate.sourceId,
      targetConceptId: candidate.targetId,
      kind: toConceptRelationKind(candidate.predicate),
      label: localName(candidate.predicate).replace(/_/g, " "),
      predicateIri: candidate.predicate,
      predicateKey: localName(candidate.predicate),
      trace: {
        sourceIds: [candidate.id],
        sourceFormat: input.sourceFormat,
      },
    }));

  const profiles: StandardsProfile[] = ["rdf"];

  if (concepts.length > 0 || conceptSchemes.length > 0) {
    profiles.push("nl-sbb");
  }

  return createStandardsModel({
    profiles,
    conceptSchemes,
    concepts,
    conceptRelations,
    triples: standardsTriples,
    metadata: {
      sourceFormat: input.sourceFormat,
    },
  });
}
