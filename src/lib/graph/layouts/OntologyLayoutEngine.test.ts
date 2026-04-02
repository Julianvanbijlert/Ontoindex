import { describe, expect, it } from "vitest";

import type { GraphModel } from "@/lib/graph/model";
import { ontologyLayoutEngine } from "@/lib/graph/layouts/OntologyLayoutEngine";

function buildOntologyModel(): GraphModel {
  return {
    kind: "ontology",
    nodes: [
      { id: "animal", kind: "definition", label: "Animal" },
      { id: "mammal", kind: "definition", label: "Mammal" },
      { id: "bird", kind: "definition", label: "Bird" },
      { id: "dog", kind: "definition", label: "Dog" },
      { id: "cat", kind: "definition", label: "Cat" },
      { id: "note", kind: "definition", label: "Note" },
    ],
    edges: [
      { id: "mammal-is-a-animal", source: "mammal", target: "animal", kind: "is_a", label: "is a" },
      { id: "bird-is-a-animal", source: "bird", target: "animal", kind: "is_a", label: "is a" },
      { id: "dog-is-a-mammal", source: "dog", target: "mammal", kind: "is_a", label: "is a" },
      { id: "cat-is-a-mammal", source: "cat", target: "mammal", kind: "is_a", label: "is a" },
      { id: "note-related-to-animal", source: "note", target: "animal", kind: "related_to", label: "related" },
    ],
  };
}

function getPosition(model: GraphModel, nodeId: string) {
  const node = model.nodes.find((candidate) => candidate.id === nodeId);

  if (!node?.visual) {
    throw new Error(`Missing position for ${nodeId}`);
  }

  return node.visual;
}

function getClusterSpan(layouted: GraphModel, nodeIds: string[]) {
  const xs = nodeIds.map((nodeId) => getPosition(layouted, nodeId).x ?? 0).sort((left, right) => left - right);

  return {
    min: xs[0] ?? 0,
    max: xs[xs.length - 1] ?? 0,
  };
}

describe("ontologyLayoutEngine", () => {
  it("places ontology hierarchies top-down and keeps root layers centered", () => {
    const layouted = ontologyLayoutEngine.layout(buildOntologyModel());
    const animal = getPosition(layouted, "animal");
    const mammal = getPosition(layouted, "mammal");
    const bird = getPosition(layouted, "bird");
    const dog = getPosition(layouted, "dog");
    const cat = getPosition(layouted, "cat");
    const note = getPosition(layouted, "note");

    expect(animal.y).toBeLessThan(mammal.y);
    expect(mammal.y).toBeLessThan(dog.y);
    expect(mammal.y).toBeLessThan(cat.y);
    expect(animal.y).toBeLessThan(bird.y);
    expect(note.y).toBeGreaterThanOrEqual(animal.y);
    expect(Math.abs(animal.x - ((mammal.x + bird.x) / 2))).toBeLessThan(220);
  });

  it("is deterministic for the same ontology model", () => {
    const first = ontologyLayoutEngine.layout(buildOntologyModel());
    const second = ontologyLayoutEngine.layout(buildOntologyModel());

    expect(first.nodes.map((node) => node.visual)).toEqual(second.nodes.map((node) => node.visual));
  });

  it("supports ontology graphs only", () => {
    expect(ontologyLayoutEngine.supports("ontology")).toBe(true);
    expect(ontologyLayoutEngine.supports("knowledge-graph")).toBe(false);
    expect(ontologyLayoutEngine.supports("property-graph")).toBe(false);
    expect(ontologyLayoutEngine.supports("uml-class")).toBe(false);
    expect(ontologyLayoutEngine.supports("er")).toBe(false);
  });

  it("adds stronger spacing between explicit ontology groups within the same layer", () => {
    const layouted = ontologyLayoutEngine.layout({
      kind: "ontology",
      nodes: [
        { id: "thing", kind: "definition", label: "Thing" },
        { id: "dog", kind: "definition", label: "Dog" },
        { id: "mammal", kind: "definition", label: "Mammal" },
        { id: "car", kind: "definition", label: "Car" },
        { id: "truck", kind: "definition", label: "Truck" },
      ],
      groups: [
        { id: "animals", label: "Animals", nodeIds: ["dog", "mammal"] },
        { id: "vehicles", label: "Vehicles", nodeIds: ["car", "truck"] },
      ],
      edges: [
        { id: "dog-is-a-thing", source: "dog", target: "thing", kind: "is_a", label: "is a" },
        { id: "mammal-is-a-thing", source: "mammal", target: "thing", kind: "is_a", label: "is a" },
        { id: "car-is-a-thing", source: "car", target: "thing", kind: "is_a", label: "is a" },
        { id: "truck-is-a-thing", source: "truck", target: "thing", kind: "is_a", label: "is a" },
      ],
    });

    const animalSpan = getClusterSpan(layouted, ["dog", "mammal"]);
    const vehicleSpan = getClusterSpan(layouted, ["car", "truck"]);
    const withinAnimalGap = Math.abs(getPosition(layouted, "dog").x - getPosition(layouted, "mammal").x);
    const withinVehicleGap = Math.abs(getPosition(layouted, "car").x - getPosition(layouted, "truck").x);
    const betweenClusterGap = vehicleSpan.min - animalSpan.max;

    expect(betweenClusterGap).toBeGreaterThan(withinAnimalGap);
    expect(betweenClusterGap).toBeGreaterThan(withinVehicleGap);
  });

  it("clusters ontology nodes by IRI namespace when explicit group hints are absent", () => {
    const layouted = ontologyLayoutEngine.layout({
      kind: "ontology",
      nodes: [
        { id: "thing", kind: "definition", label: "Thing" },
        { id: "alpha-animal", kind: "definition", label: "Alpha", iri: "https://example.com/animals#Alpha" },
        { id: "beta-vehicle", kind: "definition", label: "Beta", iri: "https://example.com/vehicles#Beta" },
        { id: "gamma-animal", kind: "definition", label: "Gamma", iri: "https://example.com/animals#Gamma" },
        { id: "delta-vehicle", kind: "definition", label: "Delta", iri: "https://example.com/vehicles#Delta" },
      ],
      edges: [
        { id: "alpha-is-a-thing", source: "alpha-animal", target: "thing", kind: "is_a", label: "is a" },
        { id: "beta-is-a-thing", source: "beta-vehicle", target: "thing", kind: "is_a", label: "is a" },
        { id: "gamma-is-a-thing", source: "gamma-animal", target: "thing", kind: "is_a", label: "is a" },
        { id: "delta-is-a-thing", source: "delta-vehicle", target: "thing", kind: "is_a", label: "is a" },
      ],
    });

    const animalSpan = getClusterSpan(layouted, ["alpha-animal", "gamma-animal"]);
    const vehicleSpan = getClusterSpan(layouted, ["beta-vehicle", "delta-vehicle"]);

    expect(animalSpan.max < vehicleSpan.min || vehicleSpan.max < animalSpan.min).toBe(true);
  });
});
