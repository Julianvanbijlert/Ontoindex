export type GraphKind =
  | "ontology"
  | "knowledge-graph"
  | "property-graph"
  | "uml-class"
  | "er";

export interface GraphModel {
  kind: GraphKind;
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups?: GraphGroup[];
  metadata?: {
    sourceFormat?: string;
    ontologyId?: string;
    layoutHint?: string;
    standards?: string[];
  };
}

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  secondaryLabel?: string;
  properties?: Record<string, unknown>;
  types?: string[];
  iri?: string;
  visual?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    collapsed?: boolean;
  };
  semantic?: {
    rdfClass?: boolean;
    owlClass?: boolean;
    skosConcept?: boolean;
    shaclShape?: boolean;
    umlClass?: boolean;
    erEntity?: boolean;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  predicateIri?: string;
  properties?: Record<string, unknown>;
  cardinality?: string;
  directed?: boolean;
  semantic?: {
    skosRelation?: boolean;
    owlRelation?: boolean;
    shaclConstraint?: boolean;
    umlAssociation?: boolean;
    erRelationship?: boolean;
  };
}

export interface GraphGroup {
  id: string;
  label: string;
  nodeIds: string[];
}
