import { describe, expect, it } from "vitest";

import { ImportFactory } from "@/lib/import-factory";

describe("ImportFactory", () => {
  it("parses JSON-LD into the standards model while preserving concept schemes, relations, and literals", async () => {
    const file = {
      name: "scheme.jsonld",
      text: async () =>
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/schemes/security",
              "@type": "skos:ConceptScheme",
              "rdfs:label": "Security Scheme",
              "rdfs:comment": "Security concept scheme",
            },
            {
              "@id": "https://example.com/concepts/control",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Control",
              "skos:definition": "Control definition",
            },
            {
              "@id": "https://example.com/concepts/access-policy",
              "@type": "skos:Concept",
              "skos:inScheme": { "@id": "https://example.com/schemes/security" },
              "skos:prefLabel": "Access Policy",
              "skos:definition": "Policy definition",
              "skos:scopeNote": "Used to govern access",
              "skos:broader": { "@id": "https://example.com/concepts/control" },
            },
          ],
        }),
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.standardsModel?.conceptSchemes).toEqual([
      expect.objectContaining({
        id: "https://example.com/schemes/security",
        iri: "https://example.com/schemes/security",
        label: "Security Scheme",
      }),
    ]);
    expect(bundle.standardsModel?.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "https://example.com/concepts/access-policy",
          schemeId: "https://example.com/schemes/security",
          iri: "https://example.com/concepts/access-policy",
          prefLabel: "Access Policy",
          definition: "Policy definition",
          scopeNote: "Used to govern access",
        }),
      ]),
    );
    expect(bundle.standardsModel?.conceptRelations).toEqual([
      expect.objectContaining({
        sourceConceptId: "https://example.com/concepts/access-policy",
        targetConceptId: "https://example.com/concepts/control",
        kind: "broader",
      }),
    ]);
    expect(bundle.standardsModel?.triples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: { termType: "iri", value: "https://example.com/concepts/access-policy" },
          predicate: { termType: "iri", value: "http://www.w3.org/2004/02/skos/core#prefLabel" },
          object: { termType: "literal", value: "Access Policy" },
        }),
        expect.objectContaining({
          subject: { termType: "iri", value: "https://example.com/concepts/access-policy" },
          predicate: { termType: "iri", value: "http://www.w3.org/2004/02/skos/core#broader" },
          object: { termType: "iri", value: "https://example.com/concepts/control" },
        }),
      ]),
    );
    expect(bundle.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "https://example.com/concepts/access-policy",
          title: "Access Policy",
          description: "Policy definition",
          content: "Used to govern access",
        }),
      ]),
    );
    expect(bundle.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRef: "https://example.com/concepts/access-policy",
          targetRef: "https://example.com/concepts/control",
          type: "broader",
        }),
      ]),
    );
  });

  it("parses JSON-LD definitions and relationships", async () => {
    const file = {
      name: "ontology.jsonld",
      text: async () =>
        JSON.stringify({
          "@graph": [
            {
              "@id": "urn:def:1",
              "rdfs:label": "Access Policy",
              "rdfs:comment": "Policy definition",
              "onto:relatedDefinition": [{ "@id": "urn:def:2", "onto:relationshipType": "governs" }],
            },
            {
              "@id": "urn:def:2",
              "rdfs:label": "Control Set",
              "rdfs:comment": "Controls",
            },
          ],
        }),
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.rows).toHaveLength(2);
    expect(bundle.relationships[0]).toMatchObject({
      sourceRef: "urn:def:1",
      targetRef: "urn:def:2",
    });
  });

  it("preserves layout-relevant ontology metadata from semantic imports", async () => {
    const file = {
      name: "ontology.jsonld",
      text: async () =>
        JSON.stringify({
          "@graph": [
            {
              "@id": "https://example.com/security#AccessPolicy",
              "rdfs:label": "Access Policy",
              "rdfs:comment": "Policy definition",
              "onto:namespace": "security",
              "onto:section": "governance",
              "onto:group": "policies",
            },
          ],
        }),
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.rows[0]).toMatchObject({
      externalId: "https://example.com/security#AccessPolicy",
      metadata: {
        iri: "https://example.com/security#AccessPolicy",
        namespace: "security",
        section: "governance",
        group: "policies",
      },
    });
  });

  it("parses RDF/XML resources into definitions", async () => {
    const file = {
      name: "ontology.rdf",
      text: async () => `<?xml version="1.0"?>
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
          <rdf:Description rdf:about="urn:def:1">
            <rdfs:label>Access Policy</rdfs:label>
            <rdfs:comment>Policy definition</rdfs:comment>
          </rdf:Description>
        </rdf:RDF>`,
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.rows).toHaveLength(1);
    expect(bundle.rows[0]).toMatchObject({
      title: "Access Policy",
      description: "Policy definition",
    });
  });

  it("preserves RDF literal objects in the standards model without forcing them into ontology rows", async () => {
    const file = {
      name: "ontology.nt",
      text: async () => [
        '<https://example.com/concepts/access-policy> <http://www.w3.org/2004/02/skos/core#prefLabel> "Access Policy" .',
        '<https://example.com/concepts/access-policy> <http://www.w3.org/2004/02/skos/core#definition> "Policy definition" .',
        '<https://example.com/concepts/access-policy> <https://example.com/meta#status> "approved" .',
      ].join("\n"),
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.standardsModel?.triples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: expect.objectContaining({ value: "http://www.w3.org/2004/02/skos/core#prefLabel" }),
          object: expect.objectContaining({ termType: "literal", value: "Access Policy" }),
        }),
        expect.objectContaining({
          predicate: expect.objectContaining({ value: "https://example.com/meta#status" }),
          object: expect.objectContaining({ termType: "literal", value: "approved" }),
        }),
      ]),
    );
    expect(bundle.rows).toHaveLength(1);
    expect(bundle.rows[0]).toMatchObject({
      externalId: "https://example.com/concepts/access-policy",
      title: "Access Policy",
      description: "Policy definition",
      status: "approved",
    });
    expect(bundle.rows.some((row) => row.externalId === "approved")).toBe(false);
  });

  it("parses XMI classes and associations", async () => {
    const file = {
      name: "ontology.xmi",
      text: async () => `<?xml version="1.0"?>
        <xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001">
          <uml:Model xmlns:uml="http://www.omg.org/spec/UML/20161101">
            <packagedElement xmi:type="uml:Class" xmi:id="def-1" name="Access Policy">
              <ownedComment body="Policy definition" />
            </packagedElement>
            <packagedElement xmi:type="uml:Class" xmi:id="def-2" name="Control Set">
              <ownedComment body="Controls" />
            </packagedElement>
            <packagedElement xmi:type="uml:Association" xmi:id="rel-1" name="governs" memberEnd="def-1 def-2" />
          </uml:Model>
        </xmi:XMI>`,
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.rows).toHaveLength(2);
    expect(bundle.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceRef: "def-1", targetRef: "def-2", label: "governs" }),
      ]),
    );
  });

  it("preserves MIM and UML-relevant structure in the standards model when importing XMI", async () => {
    const file = {
      name: "model.xmi",
      text: async () => `<?xml version="1.0"?>
        <xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001">
          <uml:Model xmlns:uml="http://www.omg.org/spec/UML/20161101">
            <packagedElement xmi:type="uml:Package" xmi:id="pkg-1" name="Core">
              <packagedElement xmi:type="uml:Class" xmi:id="class-1" name="AccessPolicy">
                <ownedAttribute xmi:id="attr-1" name="policyCode" type="string" />
                <ownedComment body="Policy definition" />
              </packagedElement>
              <packagedElement xmi:type="uml:Class" xmi:id="class-2" name="ControlSet" />
              <packagedElement xmi:type="uml:Association" xmi:id="assoc-1" name="governs" memberEnd="class-1 class-2" />
            </packagedElement>
          </uml:Model>
        </xmi:XMI>`,
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);

    expect(bundle.standardsModel?.profiles).toContain("mim");
    expect(bundle.standardsModel?.packages).toEqual([
      expect.objectContaining({
        id: "pkg-1",
        label: "Core",
      }),
    ]);
    expect(bundle.standardsModel?.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "class-1",
          label: "AccessPolicy",
          packageId: "pkg-1",
          definition: "Policy definition",
          attributes: [
            expect.objectContaining({
              id: "attr-1",
              name: "policyCode",
              datatypeId: "string",
            }),
          ],
        }),
      ]),
    );
    expect(bundle.standardsModel?.associations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "assoc-1",
          label: "governs",
          packageId: "pkg-1",
          source: expect.objectContaining({ classId: "class-1" }),
          target: expect.objectContaining({ classId: "class-2" }),
        }),
      ]),
    );
    expect(bundle.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "class-1",
          title: "AccessPolicy",
          description: "Policy definition",
        }),
      ]),
    );
  });

  it("preserves canonical UML class hints in import rows for downstream graph projection", async () => {
    const file = {
      name: "model.xmi",
      text: async () => `<?xml version="1.0"?>
        <xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001">
          <uml:Model xmlns:uml="http://www.omg.org/spec/UML/20161101">
            <packagedElement xmi:type="uml:Package" xmi:id="pkg-core" name="Core">
              <packagedElement xmi:type="uml:Class" xmi:id="class-1" name="AccessPolicy">
                <ownedAttribute xmi:id="attr-1" name="policyCode" type="string" />
                <ownedComment body="Access policy class" />
              </packagedElement>
              <packagedElement xmi:type="uml:Class" xmi:id="class-2" name="ControlSet">
                <generalization general="class-1" />
                <ownedComment body="Control set class" />
              </packagedElement>
            </packagedElement>
          </uml:Model>
        </xmi:XMI>`,
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);
    const policyRow = bundle.rows.find((row) => row.externalId === "class-1");
    const controlRow = bundle.rows.find((row) => row.externalId === "class-2");

    expect(policyRow?.metadata).toMatchObject({
      standards: {
        sourceFormat: "xmi",
        class: {
          packageId: "pkg-core",
          attributes: [
            expect.objectContaining({
              id: "attr-1",
              name: "policyCode",
              datatypeId: "string",
            }),
          ],
        },
      },
    });
    expect(controlRow?.metadata).toMatchObject({
      standards: {
        class: {
          superClassIds: ["class-1"],
        },
      },
    });
  });

  it("parses TypeScript source into canonical UML-ready class metadata", async () => {
    const file = {
      name: "model.ts",
      text: async () => `
        export class Policy {
          policyCode: string;
          level: number;

          validate(): boolean {
            return true;
          }
        }

        export class Rule extends Policy {
          evaluate(input: string): void {}
        }
      `,
    } as unknown as File;

    const bundle = await ImportFactory.createFromFile(file).parse(file);
    const policyRow = bundle.rows.find((row) => row.externalId === "Policy");
    const ruleRow = bundle.rows.find((row) => row.externalId === "Rule");

    expect(bundle.standardsModel?.profiles).toContain("mim");
    expect(bundle.standardsModel?.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "Policy",
          label: "Policy",
        }),
        expect.objectContaining({
          id: "Rule",
          label: "Rule",
          superClassIds: ["Policy"],
        }),
      ]),
    );
    expect(policyRow?.metadata).toMatchObject({
      standards: {
        class: {
          attributes: expect.arrayContaining([
            expect.objectContaining({ name: "policyCode" }),
            expect.objectContaining({ name: "level" }),
          ]),
        },
      },
    });
    expect(ruleRow?.metadata).toMatchObject({
      standards: {
        class: {
          superClassIds: ["Policy"],
        },
      },
    });
  });

  it("rejects TypeScript UML generation when no classes are present", async () => {
    const file = {
      name: "helpers.ts",
      text: async () => `
        export const add = (left: number, right: number) => left + right;
      `,
    } as unknown as File;

    await expect(ImportFactory.createFromFile(file).parse(file)).rejects.toThrow(
      /no class declarations/i,
    );
  });
});
