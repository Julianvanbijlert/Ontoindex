export type SearchContextUse = "none" | "light" | "full";
export type SearchRewriteMode = "none" | "heuristic" | "llm";
export type SearchDenseRetrievalGate = "on" | "off";
export type SearchAmbiguityFlag =
  | "single_token"
  | "generic_term"
  | "underspecified"
  | "broad_exploratory";

export interface RetrievalPlan {
  contextUse: SearchContextUse;
  reason: string;
  needsRewrite: boolean;
  rewriteMode: SearchRewriteMode;
  denseRetrievalGate: SearchDenseRetrievalGate;
  ambiguityFlags: SearchAmbiguityFlag[];
}
