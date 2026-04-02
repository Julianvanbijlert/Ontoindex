import { describe, expect, it } from "vitest";

import { createStandardsModel } from "@/lib/standards/model";

describe("createStandardsModel", () => {
  it("represents MIM-style classes, attributes, associations, and inheritance", () => {
    const model = createStandardsModel({
      profiles: ["mim"],
      packages: [
        {
          id: "pkg-core",
          label: "Core",
          iri: "https://example.com/model/core",
        },
      ],
      datatypes: [
        {
          id: "datatype-string",
          label: "string",
          iri: "http://www.w3.org/2001/XMLSchema#string",
        },
      ],
      classes: [
        {
          id: "class-person",
          label: "Person",
          iri: "https://example.com/model#Person",
          packageId: "pkg-core",
          identifiers: [
            {
              id: "identifier-person-id",
              name: "personId",
            },
          ],
          attributes: [
            {
              id: "attribute-name",
              name: "name",
              datatypeId: "datatype-string",
              cardinality: "1",
            },
          ],
        },
        {
          id: "class-employee",
          label: "Employee",
          iri: "https://example.com/model#Employee",
          packageId: "pkg-core",
          superClassIds: ["class-person"],
        },
      ],
      associations: [
        {
          id: "association-employs",
          label: "employs",
          source: {
            classId: "class-person",
            role: "manager",
            cardinality: "0..*",
          },
          target: {
            classId: "class-employee",
            role: "staffMember",
            cardinality: "1..*",
          },
        },
      ],
    });

    expect(model.profiles).toEqual(["mim"]);
    expect(model.classes[0]).toMatchObject({
      id: "class-person",
      packageId: "pkg-core",
      attributes: [
        expect.objectContaining({
          name: "name",
          datatypeId: "datatype-string",
          cardinality: "1",
        }),
      ],
      identifiers: [
        expect.objectContaining({
          name: "personId",
        }),
      ],
    });
    expect(model.classes[1].superClassIds).toEqual(["class-person"]);
    expect(model.associations[0]).toMatchObject({
      source: {
        classId: "class-person",
        role: "manager",
      },
      target: {
        classId: "class-employee",
        role: "staffMember",
      },
    });
  });

  it("represents NL-SBB-style concept schemes, concepts, and semantic relations", () => {
    const model = createStandardsModel({
      profiles: ["nl-sbb"],
      conceptSchemes: [
        {
          id: "scheme-security",
          label: "Security Vocabulary",
          iri: "https://example.com/scheme/security",
        },
      ],
      concepts: [
        {
          id: "concept-policy",
          schemeId: "scheme-security",
          prefLabel: "Access policy",
          altLabels: ["Authorization policy"],
          iri: "https://example.com/security#AccessPolicy",
          definition: "A policy that governs access.",
          status: "approved",
        },
        {
          id: "concept-control",
          schemeId: "scheme-security",
          prefLabel: "Control objective",
          iri: "https://example.com/security#ControlObjective",
        },
      ],
      conceptRelations: [
        {
          id: "rel-broader",
          sourceConceptId: "concept-policy",
          targetConceptId: "concept-control",
          kind: "broader",
        },
        {
          id: "rel-related",
          sourceConceptId: "concept-policy",
          targetConceptId: "concept-control",
          kind: "related",
        },
      ],
    });

    expect(model.conceptSchemes[0]).toMatchObject({
      id: "scheme-security",
      iri: "https://example.com/scheme/security",
    });
    expect(model.concepts[0]).toMatchObject({
      schemeId: "scheme-security",
      prefLabel: "Access policy",
      altLabels: ["Authorization policy"],
      definition: "A policy that governs access.",
    });
    expect(model.conceptRelations).toEqual([
      expect.objectContaining({ kind: "broader" }),
      expect.objectContaining({ kind: "related" }),
    ]);
  });

  it("represents RDF triples while preserving iri and literal details", () => {
    const model = createStandardsModel({
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
            value: "http://www.w3.org/2004/02/skos/core#prefLabel",
          },
          object: {
            termType: "literal",
            value: "Access policy",
            language: "en",
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
      ],
    });

    expect(model.triples[0]).toMatchObject({
      subject: {
        termType: "iri",
        value: "https://example.com/security#AccessPolicy",
      },
      predicate: {
        value: "http://www.w3.org/2004/02/skos/core#prefLabel",
      },
      object: {
        termType: "literal",
        value: "Access policy",
        language: "en",
      },
    });
    expect(model.triples[1].object).toMatchObject({
      termType: "iri",
      value: "https://example.com/security#ControlObjective",
    });
  });
});
