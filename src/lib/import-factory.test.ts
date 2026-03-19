import { describe, expect, it } from "vitest";

import { ImportFactory } from "@/lib/import-factory";

describe("ImportFactory", () => {
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
});
