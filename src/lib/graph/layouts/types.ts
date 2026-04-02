import type { GraphModel } from "@/lib/graph/model";

export interface GraphLayoutOptions {
  direction?: "TB" | "BT" | "LR" | "RL";
  nodeSpacing?: number;
  rankSpacing?: number;
}

export interface GraphLayoutRequest extends GraphLayoutOptions {
  engineId?: string;
  force?: boolean;
}

export interface GraphLayoutEngine {
  id: string;
  supports: (kind: GraphModel["kind"]) => boolean;
  layout: (model: GraphModel, options?: GraphLayoutOptions) => GraphModel;
}
