import type { ComponentType } from "react";

import type { GraphModel } from "@/lib/graph/model";
import type { InteractiveGraphRendererId } from "@/lib/graph/preferences/types";

export interface GraphRendererCapabilities {
  editable?: boolean;
  autoLayout?: boolean;
  minimap?: boolean;
  edgeLabels?: boolean;
  clustering?: boolean;
}

export interface GraphNodePositionChangeMeta {
  source: "user" | "system";
}

export interface GraphRendererProps {
  model: GraphModel;
  readOnly?: boolean;
  className?: string;

  onCreateEdge?: (input: { source: string; target: string }) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodePositionChange?: (
    nodeId: string,
    position: { x: number; y: number },
    meta: GraphNodePositionChangeMeta,
  ) => void;
  onSelectionChange?: (selection: { nodeIds: string[]; edgeIds: string[] }) => void;
}

export interface GraphRenderer {
  id: string;
  supports: (kind: GraphModel["kind"]) => boolean;
  capabilities?: GraphRendererCapabilities;
  Component: ComponentType<GraphRendererProps>;
}

export interface GraphRendererResolutionOptions {
  explicitRendererId?: string;
  preferredRendererId?: InteractiveGraphRendererId | null;
}

export function getSupportedGraphRenderers(model: GraphModel, renderers: GraphRenderer[]) {
  return renderers.filter((renderer) => renderer.supports(model.kind));
}

export function resolveGraphRendererId(
  model: GraphModel,
  renderers: GraphRenderer[],
  options: GraphRendererResolutionOptions = {},
) {
  const supportedRenderers = getSupportedGraphRenderers(model, renderers);

  if (supportedRenderers.length === 0) {
    return null;
  }

  if (options.explicitRendererId) {
    return supportedRenderers.find((renderer) => renderer.id === options.explicitRendererId)?.id ?? supportedRenderers[0].id;
  }

  if (options.preferredRendererId) {
    return supportedRenderers.find((renderer) => renderer.id === options.preferredRendererId)?.id ?? supportedRenderers[0].id;
  }

  return supportedRenderers[0].id;
}

export function resolveGraphRenderer(
  model: GraphModel,
  renderers: GraphRenderer[],
  options: GraphRendererResolutionOptions = {},
) {
  const resolvedRendererId = resolveGraphRendererId(model, renderers, options);

  if (!resolvedRendererId) {
    return null;
  }

  return getSupportedGraphRenderers(model, renderers).find((renderer) => renderer.id === resolvedRendererId) ?? null;
}
