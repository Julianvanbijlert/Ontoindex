import { describe, expect, it } from "vitest";

import { createStandardsModel } from "@/lib/standards/model";
import { validateStandardsModel } from "@/lib/standards/validation";

describe("validateStandardsModel", () => {
  it("passes valid MIM-shaped canonical structures", () => {
    const result = validateStandardsModel(createStandardsModel({
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
          identifiers: [{ id: "identifier-person", name: "personId" }],
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
          iri: "https://example.com/model#employs",
          packageId: "pkg-core",
          source: {
            classId: "class-person",
            role: "manager",
          },
          target: {
            classId: "class-employee",
            role: "staffMember",
          },
        },
      ],
    }));

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails invalid MIM-shaped structures with clear reasons", () => {
    const result = validateStandardsModel(createStandardsModel({
      profiles: ["mim"],
      classes: [
        {
          id: "class-person",
          label: "Person",
          packageId: "pkg-missing",
          attributes: [
            {
              id: "attribute-name",
              name: "name",
              datatypeId: "datatype-missing",
            },
          ],
          superClassIds: ["class-missing"],
        },
      ],
      associations: [
        {
          id: "association-employs",
          label: "employs",
          source: {
            classId: "class-person",
          },
          target: {
            classId: "class-employee",
          },
        },
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        profile: "mim",
        code: "mim_unknown_package",
        path: "classes[class-person].packageId",
      }),
      expect.objectContaining({
        profile: "mim",
        code: "mim_unknown_datatype",
        path: "classes[class-person].attributes[attribute-name].datatypeId",
      }),
      expect.objectContaining({
        profile: "mim",
        code: "mim_unknown_superclass",
        path: "classes[class-person].superClassIds[class-missing]",
      }),
      expect.objectContaining({
        profile: "mim",
        code: "mim_unknown_association_target",
        path: "associations[association-employs].target.classId",
      }),
    ]));
  });

  it("passes valid NL-SBB-shaped concept structures", () => {
    const result = validateStandardsModel(createStandardsModel({
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
          iri: "https://example.com/security#AccessPolicy",
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
          id: "relation-broader",
          sourceConceptId: "concept-policy",
          targetConceptId: "concept-control",
          kind: "broader",
          predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
        },
      ],
    }));

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails invalid NL-SBB-shaped structures with clear reasons", () => {
    const result = validateStandardsModel(createStandardsModel({
      profiles: ["nl-sbb"],
      conceptSchemes: [
        {
          id: "scheme-security",
          label: "Security Vocabulary",
        },
        {
          id: "scheme-risk",
          label: "Risk Vocabulary",
        },
      ],
      concepts: [
        {
          id: "concept-policy",
          schemeId: "scheme-missing",
          prefLabel: "Access policy",
          iri: "https://example.com/security#AccessPolicy",
        },
        {
          id: "concept-control",
          schemeId: "scheme-risk",
          prefLabel: "Control objective",
        },
      ],
      conceptRelations: [
        {
          id: "relation-broader",
          sourceConceptId: "concept-policy",
          targetConceptId: "concept-control",
          kind: "broader",
          predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
        },
        {
          id: "relation-related",
          sourceConceptId: "concept-missing",
          targetConceptId: "concept-control",
          kind: "related",
        },
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        profile: "nl-sbb",
        code: "nl_sbb_unknown_scheme",
        path: "concepts[concept-policy].schemeId",
      }),
      expect.objectContaining({
        profile: "nl-sbb",
        code: "nl_sbb_unknown_relation_source",
        path: "conceptRelations[relation-related].sourceConceptId",
      }),
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        profile: "nl-sbb",
        code: "nl_sbb_cross_scheme_relation",
        path: "conceptRelations[relation-broader]",
      }),
    ]));
  });

  it("warns when NL-SBB concept relations use app-local semantics without explicit predicate mapping", () => {
    const result = validateStandardsModel(createStandardsModel({
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
          iri: "https://example.com/security#AccessPolicy",
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
          id: "relation-local",
          sourceConceptId: "concept-policy",
          targetConceptId: "concept-control",
          kind: "custom",
          predicateKey: "linked_to",
        },
      ],
    }));

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "nl-sbb",
          code: "nl_sbb_unmapped_relation_semantics",
          path: "conceptRelations[relation-local]",
        }),
      ]),
    );
  });

  it("preserves backward-compatible SKOS issues through validateStandardsModel", () => {
    const result = validateStandardsModel(createStandardsModel({
      profiles: ["skos"],
      conceptSchemes: [
        {
          id: "scheme-security",
          label: "Security Vocabulary",
        },
      ],
      concepts: [
        {
          id: "concept-policy",
          schemeId: "scheme-security",
          prefLabel: "Access policy",
          altLabels: ["Access policy"],
        },
      ],
    }));

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "skos",
          code: "skos_alt_label_duplicates_pref_label",
          path: "concepts[concept-policy].altLabels",
        }),
      ]),
    );
  });

  it("passes valid RDF triple structures", () => {
    const result = validateStandardsModel(createStandardsModel({
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
            termType: "blank-node",
            value: "_:b1",
          },
          predicate: {
            termType: "iri",
            value: "http://www.w3.org/2000/01/rdf-schema#label",
          },
          object: {
            termType: "literal",
            value: "Anonymous resource",
          },
          graph: {
            termType: "iri",
            value: "https://example.com/graph/security",
          },
        },
      ],
    }));

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails malformed RDF structures with clear reasons", () => {
    const result = validateStandardsModel(createStandardsModel({
      profiles: ["rdf"],
      triples: [
        {
          id: "triple-1",
          subject: {
            termType: "iri",
            value: "not-a-valid-iri",
          },
          predicate: {
            termType: "iri",
            value: "prefLabel",
          },
          object: {
            termType: "literal",
            value: "Access policy",
            language: "en",
            datatypeIri: "http://www.w3.org/2001/XMLSchema#string",
          },
        },
        {
          id: "triple-2",
          subject: {
            termType: "blank-node",
            value: "b1",
          },
          predicate: {
            termType: "iri",
            value: "http://www.w3.org/2000/01/rdf-schema#label",
          },
          object: {
            termType: "literal",
            value: "Anonymous resource",
            datatypeIri: "not-a-valid-iri",
          },
          graph: {
            termType: "iri",
            value: "not-a-valid-iri",
          },
        },
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_invalid_subject_iri",
        path: "triples[triple-1].subject",
      }),
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_invalid_predicate_iri",
        path: "triples[triple-1].predicate",
      }),
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_literal_datatype_language_conflict",
        path: "triples[triple-1].object",
      }),
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_invalid_blank_node",
        path: "triples[triple-2].subject",
      }),
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_invalid_literal_datatype_iri",
        path: "triples[triple-2].object.datatypeIri",
      }),
      expect.objectContaining({
        profile: "rdf",
        code: "rdf_invalid_graph_iri",
        path: "triples[triple-2].graph",
      }),
    ]));
  });
});
