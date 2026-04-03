import { describe, expect, it } from "vitest";

import { mapOntologyToStandardsModel } from "@/lib/standards/mappers/ontology-to-standards";

describe("mapOntologyToStandardsModel", () => {
  it("maps the current ontology definition path into standards concepts and triples", () => {
    const model = mapOntologyToStandardsModel({
      ontologyId: "onto-1",
      ontologyTitle: "Security Ontology",
      definitions: [
        {
          id: "def-1",
          title: "Access Policy",
          description: "Policy definition",
          content: "Context",
          example: "Example",
          status: "approved",
          metadata: {
            iri: "https://example.com/security#AccessPolicy",
            namespace: "security",
            section: "governance",
            group: "policies",
          },
          relationships: [
            {
              id: "rel-1",
              source_id: "def-1",
              target_id: "def-2",
              type: "is_a",
            },
          ],
        },
        {
          id: "def-2",
          title: "Control Objective",
          status: "draft",
          metadata: {
            iri: "https://example.com/security#ControlObjective",
          },
          relationships: [],
        },
      ],
    });

    expect(model.profiles).toEqual(expect.arrayContaining(["nl-sbb", "rdf"]));
    expect(model.conceptSchemes).toEqual([
      expect.objectContaining({
        id: "onto-1",
        label: "Security Ontology",
      }),
    ]);
    expect(model.concepts[0]).toMatchObject({
      id: "def-1",
      schemeId: "onto-1",
      prefLabel: "Access Policy",
      iri: "https://example.com/security#AccessPolicy",
      definition: "Policy definition",
      status: "approved",
      namespace: "security",
      section: "governance",
      group: "policies",
    });
    expect(model.conceptRelations).toEqual([
      expect.objectContaining({
        id: "rel-1",
        sourceConceptId: "def-1",
        targetConceptId: "def-2",
        kind: "broader",
      }),
    ]);
    expect(model.triples).toEqual([
      expect.objectContaining({
        id: "rel-1",
        subject: expect.objectContaining({ value: "https://example.com/security#AccessPolicy" }),
        predicate: expect.objectContaining({ termType: "iri" }),
        object: expect.objectContaining({ value: "https://example.com/security#ControlObjective" }),
      }),
    ]);
  });

  it("reconstructs canonical UML classes and associations from stored standards metadata", () => {
    const model = mapOntologyToStandardsModel({
      ontologyId: "onto-uml-3",
      definitions: [
        {
          id: "class-policy",
          title: "Policy",
          description: "Policy class",
          metadata: {
            iri: "https://example.com/model#Policy",
            standards: {
              sourceFormat: "xmi",
              class: {
                packageId: "pkg-core",
                attributes: [
                  {
                    id: "attr-policy-code",
                    name: "policyCode",
                    datatypeId: "string",
                  },
                ],
              },
            },
          },
          relationships: [
            {
              id: "assoc-1",
              source_id: "class-policy",
              target_id: "class-rule",
              type: "related_to",
              label: "governs",
            },
          ],
        },
        {
          id: "class-rule",
          title: "Rule",
          metadata: {
            standards: {
              class: {
                packageId: "pkg-core",
                superClassIds: ["class-policy"],
              },
            },
          },
          relationships: [],
        },
      ],
    });

    expect(model.profiles).toEqual(expect.arrayContaining(["mim"]));
    expect(model.metadata?.sourceFormat).toBe("xmi");
    expect(model.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "class-policy",
          label: "Policy",
          packageId: "pkg-core",
          attributes: [
            expect.objectContaining({
              id: "attr-policy-code",
              name: "policyCode",
              datatypeId: "string",
            }),
          ],
        }),
        expect.objectContaining({
          id: "class-rule",
          superClassIds: ["class-policy"],
        }),
      ]),
    );
    expect(model.associations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "assoc-1",
          source: expect.objectContaining({ classId: "class-policy" }),
          target: expect.objectContaining({ classId: "class-rule" }),
          label: "governs",
        }),
      ]),
    );
  });

  it("prefers structured relationship standards metadata for NL-SBB semantics and UML association details", () => {
    const model = mapOntologyToStandardsModel({
      ontologyId: "onto-standards-rel",
      definitions: [
        {
          id: "class-policy",
          title: "Policy",
          metadata: {
            standards: {
              class: {
                packageId: "pkg-core",
              },
            },
          },
          relationships: [
            {
              id: "rel-broader-1",
              source_id: "class-policy",
              target_id: "class-control",
              type: "related_to",
              label: "linked",
              metadata: {
                standards: {
                  relation: {
                    kind: "broader",
                    predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
                    predicateKey: "broader",
                    attributes: [
                      {
                        id: "rel-attr-confidence",
                        name: "confidence",
                        datatypeId: "xsd:decimal",
                      },
                    ],
                  },
                  association: {
                    sourceRole: "broaderConcept",
                    targetRole: "narrowerConcept",
                    sourceCardinality: "0..*",
                    targetCardinality: "1",
                    attributes: [
                      {
                        id: "assoc-attr-evidence",
                        name: "evidenceLevel",
                        datatypeId: "string",
                      },
                    ],
                  },
                },
              },
            } as any,
          ],
        },
        {
          id: "class-control",
          title: "Control",
          metadata: {
            standards: {
              class: {
                packageId: "pkg-core",
              },
            },
          },
          relationships: [],
        },
      ],
    });

    expect(model.conceptRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rel-broader-1",
          kind: "broader",
          predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
          predicateKey: "broader",
          attributes: [
            expect.objectContaining({
              id: "rel-attr-confidence",
              name: "confidence",
              datatypeId: "xsd:decimal",
            }),
          ],
        }),
      ]),
    );
    expect(model.associations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rel-broader-1",
          source: expect.objectContaining({
            classId: "class-policy",
            role: "broaderConcept",
            cardinality: "0..*",
          }),
          target: expect.objectContaining({
            classId: "class-control",
            role: "narrowerConcept",
            cardinality: "1",
          }),
          attributes: [
            expect.objectContaining({
              id: "assoc-attr-evidence",
              name: "evidenceLevel",
              datatypeId: "string",
            }),
          ],
        }),
      ]),
    );
  });
});
