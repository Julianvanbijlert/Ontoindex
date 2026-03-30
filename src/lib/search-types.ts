import type { Database } from "@/integrations/supabase/types";
import type { SearchConfidence } from "@/lib/search-query-understanding";

export type SearchBackendRow =
  Database["public"]["Functions"]["search_entities_hybrid"]["Returns"][number];

export interface SearchHistoryEntry {
  id: string;
  query: string;
  created_at: string;
  filters?: Record<string, unknown> | null;
}

export interface SearchFilters {
  ontologyId: string;
  tag: string;
  status: string;
  type: "all" | "definition" | "ontology";
  ownership: "all" | "mine";
}

export type SearchSort = "relevance" | "recent" | "views" | "title";

export interface SearchResultItem {
  id: string;
  type: "definition" | "ontology";
  title: string;
  description: string;
  status: string | null;
  updatedAt: string;
  viewCount: number;
  tags: string[];
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  priority?: string | null;
  relevance: number;
  confidence?: SearchConfidence;
  matchReasons?: string[];
  evidenceExcerpt?: string | null;
  retrievalStrategy?: "hybrid" | "legacy";
  scoreBreakdown?: {
    lexical: number;
    dense: number;
    fusion: number;
    rerank: number;
    context?: number;
  };
  explanation?: {
    appliedFilters: string[];
    appliedBoosts: string[];
    contextUse?: "none" | "light" | "full";
  };
  contextTimestamp?: string | null;
}
