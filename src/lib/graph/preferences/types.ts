import type { GraphModel } from "@/lib/graph/model";

export type InteractiveGraphRendererId = string;
export type GraphRendererPreferenceScope = "interactive";
export type MaybePromise<T> = T | Promise<T>;

export interface GraphRendererPreferenceStore {
  get: (scope: GraphRendererPreferenceScope) => MaybePromise<InteractiveGraphRendererId | null>;
  set: (
    scope: GraphRendererPreferenceScope,
    rendererId: InteractiveGraphRendererId,
  ) => MaybePromise<void>;
  clear?: (scope: GraphRendererPreferenceScope) => MaybePromise<void>;
}

const INTERACTIVE_GRAPH_KINDS = new Set<GraphModel["kind"]>([
  "ontology",
  "knowledge-graph",
  "property-graph",
]);

export function resolveGraphRendererPreferenceScope(kind: GraphModel["kind"]): GraphRendererPreferenceScope | null {
  return INTERACTIVE_GRAPH_KINDS.has(kind) ? "interactive" : null;
}

export function isInteractiveGraphRendererId(value: string): value is InteractiveGraphRendererId {
  return typeof value === "string" && value.trim().length > 0;
}
