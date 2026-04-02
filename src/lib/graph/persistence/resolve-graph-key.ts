import type { GraphModel } from "@/lib/graph/model";

const INTERACTIVE_GRAPH_KINDS = new Set<GraphModel["kind"]>([
  "ontology",
  "knowledge-graph",
  "property-graph",
]);

export function isPersistableGraphKind(kind: GraphModel["kind"]) {
  return INTERACTIVE_GRAPH_KINDS.has(kind);
}

export function resolveGraphPersistenceKey(model: GraphModel, explicitGraphKey?: string) {
  if (!isPersistableGraphKind(model.kind)) {
    return null;
  }

  if (explicitGraphKey?.trim()) {
    return explicitGraphKey.trim();
  }

  const ontologyId = model.metadata?.ontologyId?.trim();
  if (ontologyId) {
    return `${model.kind}:${ontologyId}`;
  }

  return null;
}
