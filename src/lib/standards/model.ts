export type StandardsProfile = "mim" | "nl-sbb" | "rdf";

export interface StandardsTraceability {
  sourceIds?: string[];
  sourceFormat?: string;
}

export interface StandardsPackage {
  id: string;
  label: string;
  iri?: string;
  definition?: string;
  trace?: StandardsTraceability;
}

export interface StandardsDatatype {
  id: string;
  label: string;
  iri?: string;
  definition?: string;
  trace?: StandardsTraceability;
}

export interface StandardsIdentifier {
  id: string;
  name: string;
  label?: string;
  definition?: string;
}

export interface StandardsAttribute {
  id: string;
  name: string;
  label?: string;
  datatypeId?: string;
  cardinality?: string;
  definition?: string;
}

export interface StandardsClass {
  id: string;
  label: string;
  iri?: string;
  packageId?: string;
  definition?: string;
  attributes?: StandardsAttribute[];
  identifiers?: StandardsIdentifier[];
  superClassIds?: string[];
  trace?: StandardsTraceability;
}

export interface StandardsAssociationEnd {
  classId: string;
  role?: string;
  cardinality?: string;
  navigable?: boolean;
}

export interface StandardsAssociation {
  id: string;
  label: string;
  iri?: string;
  packageId?: string;
  definition?: string;
  source: StandardsAssociationEnd;
  target: StandardsAssociationEnd;
  trace?: StandardsTraceability;
}

export interface StandardsConceptScheme {
  id: string;
  label: string;
  iri?: string;
  definition?: string;
  status?: string;
  trace?: StandardsTraceability;
}

export interface StandardsConcept {
  id: string;
  schemeId: string;
  prefLabel: string;
  altLabels?: string[];
  iri?: string;
  definition?: string;
  scopeNote?: string;
  example?: string;
  status?: string;
  namespace?: string;
  section?: string;
  group?: string;
  trace?: StandardsTraceability;
}

export type StandardsConceptRelationKind = "broader" | "narrower" | "related" | "custom";

export interface StandardsConceptRelation {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  kind: StandardsConceptRelationKind;
  label?: string;
  predicateIri?: string;
  predicateKey?: string;
  trace?: StandardsTraceability;
}

export interface StandardsIriTerm {
  termType: "iri";
  value: string;
}

export interface StandardsBlankNodeTerm {
  termType: "blank-node";
  value: string;
}

export interface StandardsLiteralTerm {
  termType: "literal";
  value: string;
  datatypeIri?: string;
  language?: string;
}

export type StandardsResourceTerm = StandardsIriTerm | StandardsBlankNodeTerm;
export type StandardsObjectTerm = StandardsResourceTerm | StandardsLiteralTerm;

export interface StandardsTriple {
  id: string;
  subject: StandardsResourceTerm;
  predicate: StandardsIriTerm;
  object: StandardsObjectTerm;
  graph?: StandardsResourceTerm;
  trace?: StandardsTraceability;
}

export interface StandardsModel {
  profiles: StandardsProfile[];
  packages: StandardsPackage[];
  datatypes: StandardsDatatype[];
  classes: StandardsClass[];
  associations: StandardsAssociation[];
  conceptSchemes: StandardsConceptScheme[];
  concepts: StandardsConcept[];
  conceptRelations: StandardsConceptRelation[];
  triples: StandardsTriple[];
  metadata?: {
    ontologyId?: string;
    sourceFormat?: string;
  };
}

export function createStandardsModel(input: Partial<StandardsModel> = {}): StandardsModel {
  return {
    profiles: [...new Set(input.profiles ?? [])],
    packages: input.packages ?? [],
    datatypes: input.datatypes ?? [],
    classes: (input.classes ?? []).map((item) => ({
      ...item,
      attributes: item.attributes ?? [],
      identifiers: item.identifiers ?? [],
      superClassIds: item.superClassIds ?? [],
    })),
    associations: input.associations ?? [],
    conceptSchemes: input.conceptSchemes ?? [],
    concepts: (input.concepts ?? []).map((item) => ({
      ...item,
      altLabels: item.altLabels ?? [],
    })),
    conceptRelations: input.conceptRelations ?? [],
    triples: input.triples ?? [],
    metadata: input.metadata,
  };
}
