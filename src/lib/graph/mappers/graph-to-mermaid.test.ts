import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { graphModelToMermaid } from "@/lib/graph/mappers/graph-to-mermaid";

function compactLines(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("graphModelToMermaid", () => {
  it("maps a UML class graph into Mermaid class diagram syntax", () => {
    const model: GraphModel = {
      kind: "uml-class",
      nodes: [
        {
          id: "person",
          kind: "class",
          label: "Person",
          semantic: { umlClass: true },
          properties: {
            attributes: [
              { name: "name", type: "string", visibility: "+" },
              { name: "email", type: "string", visibility: "+" },
            ],
            methods: [{ name: "activate", returnType: "void", visibility: "+" }],
          },
        },
        {
          id: "employee",
          kind: "class",
          label: "Employee",
          semantic: { umlClass: true },
          properties: {
            attributes: [{ name: "employeeId", type: "string", visibility: "+" }],
          },
        },
      ],
      edges: [
        {
          id: "inherits",
          source: "employee",
          target: "person",
          kind: "extends",
          label: "inherits",
        },
      ],
    };

    const diagram = compactLines(graphModelToMermaid(model));

    expect(diagram[0]).toBe("classDiagram");
    expect(diagram).toContain('class Person["Person"] {');
    expect(diagram).toContain("+name: string");
    expect(diagram).toContain("+activate() void");
    expect(diagram).toContain('class Employee["Employee"] {');
    expect(diagram).toContain("Person <|-- Employee : inherits");
  });

  it("maps an ER graph into Mermaid ER syntax with cardinalities", () => {
    const model: GraphModel = {
      kind: "er",
      nodes: [
        {
          id: "customer",
          kind: "entity",
          label: "CUSTOMER",
          semantic: { erEntity: true },
          properties: {
            attributes: [
              { name: "id", type: "string" },
              { name: "name", type: "string" },
            ],
          },
        },
        {
          id: "order",
          kind: "entity",
          label: "ORDER",
          semantic: { erEntity: true },
          properties: {
            attributes: [
              { name: "id", type: "string" },
              { name: "total", type: "number" },
            ],
          },
        },
      ],
      edges: [
        {
          id: "places",
          source: "customer",
          target: "order",
          kind: "relationship",
          label: "places",
          cardinality: "1:N",
          semantic: { erRelationship: true },
        },
      ],
    };

    const diagram = compactLines(graphModelToMermaid(model));

    expect(diagram[0]).toBe("erDiagram");
    expect(diagram).toContain("CUSTOMER {");
    expect(diagram).toContain("string id");
    expect(diagram).toContain("number total");
    expect(diagram).toContain("CUSTOMER ||--|{ ORDER : places");
  });

  it("throws for graph kinds Mermaid does not support", () => {
    const model: GraphModel = {
      kind: "ontology",
      nodes: [],
      edges: [],
    };

    expect(() => graphModelToMermaid(model)).toThrow(/does not support graph kind/i);
  });
});
