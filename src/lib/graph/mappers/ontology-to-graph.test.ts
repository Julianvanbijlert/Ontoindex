import { describe, expect, it } from "vitest";

import { mapOntologyToGraphModel } from "@/lib/graph/mappers/ontology-to-graph";

describe("mapOntologyToGraphModel", () => {
  it("maps ontology definitions and relationships into a renderer-agnostic graph model", () => {
    const model = mapOntologyToGraphModel({
      ontologyId: "onto-1",
      definitions: [
        {
          id: "def-1",
          title: "Worker",
          description: "A person who works",
          content: "Business context",
          example: "Factory worker",
          status: "approved",
          relationships: [
            {
              id: "rel-1",
              source_id: "def-1",
              target_id: "def-2",
              type: "related_to",
              label: "related",
            },
          ],
        },
        {
          id: "def-2",
          title: "Employee",
          status: "draft",
          relationships: [],
        },
      ],
    });

    expect(model.kind).toBe("ontology");
    expect(model.metadata).toMatchObject({
      ontologyId: "onto-1",
      sourceFormat: "supabase-ontology",
      layoutHint: "ontology",
    });
    expect(model.nodes).toHaveLength(2);
    expect(model.edges).toHaveLength(1);
    expect(model.nodes[0]).toMatchObject({
      id: "def-1",
      kind: "definition",
      label: "Worker",
      secondaryLabel: "approved",
      properties: {
        status: "approved",
        description: "A person who works",
      },
    });
    expect(model.edges[0]).toMatchObject({
      id: "rel-1",
      source: "def-1",
      target: "def-2",
      kind: "related_to",
      label: "related",
      directed: true,
    });
  });

  it("passes optional metadata-based layout hints through to ontology graph nodes", () => {
    const model = mapOntologyToGraphModel({
      ontologyId: "onto-2",
      definitions: [
        {
          id: "def-1",
          title: "Account",
          status: "approved",
          metadata: {
            iri: "https://example.com/finance#Account",
            namespace: "finance",
            section: "core",
            group: "entities",
          },
          relationships: [],
        },
      ],
    });

    expect(model.nodes[0]).toMatchObject({
      id: "def-1",
      iri: "https://example.com/finance#Account",
      properties: {
        namespace: "finance",
        section: "core",
        group: "entities",
      },
    });
  });

  it("projects canonical UML class hints into a real uml-class graph path", () => {
    const model = mapOntologyToGraphModel({
      ontologyId: "onto-uml-2",
      definitions: [
        {
          id: "class-policy",
          title: "Policy",
          description: "Policy class",
          metadata: {
            iri: "https://example.com/model#Policy",
            standards: {
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
              id: "rel-uml-1",
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

    expect(model.kind).toBe("uml-class");
    expect(model.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "class-policy",
          semantic: expect.objectContaining({
            umlClass: true,
          }),
          properties: expect.objectContaining({
            attributes: [
              expect.objectContaining({
                name: "policyCode",
                type: "string",
              }),
            ],
          }),
        }),
      ]),
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rel-uml-1",
          source: "class-policy",
          target: "class-rule",
          kind: "association",
        }),
      ]),
    );
  });

  it("can project ontology data into an automatic UML view when explicitly requested", () => {
    const model = mapOntologyToGraphModel({
      ontologyId: "onto-uml-auto",
      preferredKind: "uml-class",
      definitions: [
        {
          id: "def-policy",
          title: "Policy",
          description: "Policy description",
          content: "Policy context",
          metadata: {
            iri: "https://example.com/model#Policy",
          },
          relationships: [
            {
              id: "rel-association",
              source_id: "def-policy",
              target_id: "def-control",
              type: "related_to",
              label: "governs",
            },
          ],
        },
        {
          id: "def-rule",
          title: "Rule",
          description: "Rule description",
          relationships: [
            {
              id: "rel-extends",
              source_id: "def-rule",
              target_id: "def-policy",
              type: "is_a",
              label: "inherits",
            },
          ],
        },
        {
          id: "def-control",
          title: "Control",
          description: "Control description",
          relationships: [],
        },
      ],
    });

    expect(model.kind).toBe("uml-class");
    expect(model.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "def-policy",
          semantic: expect.objectContaining({ umlClass: true }),
        }),
      ]),
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "extends",
          source: "def-rule",
          target: "def-policy",
        }),
        expect.objectContaining({
          id: "rel-association",
          kind: "association",
          source: "def-policy",
          target: "def-control",
        }),
      ]),
    );
  });

  it("does not force UML when there is no source data to project", () => {
    const model = mapOntologyToGraphModel({
      ontologyId: "onto-empty",
      preferredKind: "uml-class",
      definitions: [],
    });

    expect(model.kind).toBe("ontology");
    expect(model.nodes).toHaveLength(0);
    expect(model.edges).toHaveLength(0);
  });
});
