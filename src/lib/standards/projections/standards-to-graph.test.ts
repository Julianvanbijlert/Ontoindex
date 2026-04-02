import { describe, expect, it } from "vitest";

import { createStandardsModel } from "@/lib/standards/model";
import {
  projectStandardsOntologyToGraphModel,
  projectStandardsRdfToGraphModel,
  projectStandardsToGraphModel,
  projectStandardsUmlToGraphModel,
} from "@/lib/standards/projections/standards-to-graph";

describe("projectStandardsOntologyToGraphModel", () => {
  it("projects ontology-style standards concepts into the current GraphModel view", () => {
    const graphModel = projectStandardsOntologyToGraphModel(
      createStandardsModel({
        profiles: ["nl-sbb", "rdf"],
        conceptSchemes: [
          {
            id: "onto-7",
            label: "Security Ontology",
          },
        ],
        concepts: [
          {
            id: "def-1",
            schemeId: "onto-7",
            prefLabel: "Access Policy",
            iri: "https://example.com/security#AccessPolicy",
            definition: "Policy definition",
            status: "approved",
            namespace: "security",
            section: "governance",
            group: "policies",
          },
          {
            id: "def-2",
            schemeId: "onto-7",
            prefLabel: "Control Objective",
            status: "draft",
          },
        ],
        conceptRelations: [
          {
            id: "rel-1",
            sourceConceptId: "def-1",
            targetConceptId: "def-2",
            kind: "related",
            label: "supports",
          },
        ],
      }),
      {
        ontologyId: "onto-7",
      },
    );

    expect(graphModel).toMatchObject({
      kind: "ontology",
      metadata: {
        ontologyId: "onto-7",
        standards: ["nl-sbb", "rdf"],
      },
    });
    expect(graphModel.nodes[0]).toMatchObject({
      id: "def-1",
      label: "Access Policy",
      iri: "https://example.com/security#AccessPolicy",
      properties: {
        description: "Policy definition",
        status: "approved",
        namespace: "security",
        section: "governance",
        group: "policies",
      },
    });
    expect(graphModel.edges).toEqual([
      expect.objectContaining({
        id: "rel-1",
        source: "def-1",
        target: "def-2",
        kind: "related_to",
        label: "supports",
        directed: true,
      }),
    ]);
  });
});

describe("projectStandardsUmlToGraphModel", () => {
  it("projects canonical MIM/UML class data into a UML graph view model", () => {
    const graphModel = projectStandardsUmlToGraphModel(
      createStandardsModel({
        profiles: ["mim"],
        datatypes: [
          {
            id: "datatype-string",
            label: "string",
          },
        ],
        classes: [
          {
            id: "class-person",
            label: "Person",
            attributes: [
              {
                id: "attr-name",
                name: "name",
                datatypeId: "datatype-string",
              },
            ],
          },
          {
            id: "class-employee",
            label: "Employee",
            superClassIds: ["class-person"],
          },
        ],
        associations: [
          {
            id: "assoc-reports-to",
            label: "reportsTo",
            source: {
              classId: "class-employee",
              role: "employee",
              cardinality: "0..*",
            },
            target: {
              classId: "class-person",
              role: "manager",
              cardinality: "1",
            },
          },
        ],
      }),
      {
        ontologyId: "onto-uml-1",
      },
    );

    expect(graphModel.kind).toBe("uml-class");
    expect(graphModel.metadata).toMatchObject({
      ontologyId: "onto-uml-1",
      layoutHint: "uml-class",
      standards: ["mim"],
    });
    expect(graphModel.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "class-person",
          label: "Person",
          semantic: expect.objectContaining({
            umlClass: true,
          }),
          properties: expect.objectContaining({
            attributes: [
              expect.objectContaining({
                name: "name",
                type: "string",
              }),
            ],
          }),
        }),
      ]),
    );
    expect(graphModel.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "class-employee",
          target: "class-person",
          kind: "extends",
        }),
        expect.objectContaining({
          id: "assoc-reports-to",
          source: "class-employee",
          target: "class-person",
          kind: "association",
          semantic: {
            umlAssociation: true,
          },
          properties: expect.objectContaining({
            sourceCardinality: "0..*",
            targetCardinality: "1",
          }),
        }),
      ]),
    );
  });

  it("resolves to UML view automatically when canonical model carries class structures", () => {
    const graphModel = projectStandardsToGraphModel(
      createStandardsModel({
        profiles: ["mim"],
        classes: [
          {
            id: "class-policy",
            label: "Policy",
          },
        ],
      }),
    );

    expect(graphModel.kind).toBe("uml-class");
  });
});

describe("projectStandardsRdfToGraphModel", () => {
  it("projects canonical RDF triples into a renderer-compatible graph with uri and literal nodes", () => {
    const graphModel = projectStandardsRdfToGraphModel(
      createStandardsModel({
        profiles: ["rdf"],
        triples: [
          {
            id: "triple-1",
            subject: {
              termType: "iri",
              value: "https://example.com/security#AccessPolicy",
            },
            predicate: {
              termType: "iri",
              value: "http://www.w3.org/2000/01/rdf-schema#label",
            },
            object: {
              termType: "literal",
              value: "Access Policy",
            },
          },
          {
            id: "triple-2",
            subject: {
              termType: "iri",
              value: "https://example.com/security#AccessPolicy",
            },
            predicate: {
              termType: "iri",
              value: "http://www.w3.org/2004/02/skos/core#broader",
            },
            object: {
              termType: "iri",
              value: "https://example.com/security#ControlObjective",
            },
          },
          {
            id: "triple-3",
            subject: {
              termType: "iri",
              value: "https://example.com/security#AccessPolicy",
            },
            predicate: {
              termType: "iri",
              value: "https://example.com/meta#status",
            },
            object: {
              termType: "literal",
              value: "approved",
              datatypeIri: "http://www.w3.org/2001/XMLSchema#string",
            },
          },
        ],
      }),
      {
        kind: "knowledge-graph",
      },
    );

    expect(graphModel.kind).toBe("knowledge-graph");
    expect(graphModel.metadata).toMatchObject({
      layoutHint: "knowledge-graph",
      standards: ["rdf"],
    });
    expect(graphModel.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          iri: "https://example.com/security#AccessPolicy",
          label: "Access Policy",
          kind: "resource",
        }),
        expect.objectContaining({
          iri: "https://example.com/security#ControlObjective",
          label: "ControlObjective",
          kind: "resource",
        }),
        expect.objectContaining({
          kind: "literal",
          label: "approved",
          properties: expect.objectContaining({
            termType: "literal",
            datatypeIri: "http://www.w3.org/2001/XMLSchema#string",
          }),
        }),
      ]),
    );
    expect(graphModel.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "triple-2",
          kind: "broader",
          label: "broader",
          predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
          directed: true,
        }),
        expect.objectContaining({
          id: "triple-3",
          kind: "status",
          label: "status",
          predicateIri: "https://example.com/meta#status",
          directed: true,
        }),
      ]),
    );
  });

  it("resolves RDF visualization mode through the central projection selector", () => {
    const graphModel = projectStandardsToGraphModel(
      createStandardsModel({
        profiles: ["rdf"],
        triples: [
          {
            id: "triple-1",
            subject: {
              termType: "iri",
              value: "https://example.com/security#AccessPolicy",
            },
            predicate: {
              termType: "iri",
              value: "http://www.w3.org/2004/02/skos/core#broader",
            },
            object: {
              termType: "iri",
              value: "https://example.com/security#ControlObjective",
            },
          },
        ],
      }),
      {
        preferredKind: "property-graph",
      },
    );

    expect(graphModel.kind).toBe("property-graph");
    expect(graphModel.edges).toEqual([
      expect.objectContaining({
        id: "triple-1",
        kind: "broader",
        label: "broader",
      }),
    ]);
  });
});
