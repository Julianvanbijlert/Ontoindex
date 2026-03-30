import type { SearchFilters } from "@/lib/search-types";
import type { RetrievalPlan } from "@/lib/search-query-planning";

export interface SearchScopeContext {
  routePath: string;
  page: string;
  ontologyId: string | null;
  ontologyLabel?: string | null;
  entityType: Exclude<SearchFilters["type"], "all"> | null;
  status: string | null;
  tag: string | null;
  ownership: SearchFilters["ownership"] | null;
}

export interface SearchSessionEntity {
  id: string;
  type: "definition" | "ontology";
  ontologyId?: string | null;
  title?: string | null;
}

export interface SearchSessionContext {
  sessionId: string | null;
  activeQuery: string | null;
  recentQueries: string[];
  recentEntities: SearchSessionEntity[];
}

export interface SearchUserPreferences {
  contextualSearchOptIn: boolean;
  contextUseProfile?: boolean;
  contextUseDeviceLocation?: boolean;
  viewPreference?: string | null;
  formatPreference?: string | null;
  sortPreference?: string | null;
  groupByPreference?: string | null;
}

export interface SearchContextControls {
  contextEnabled?: boolean;
  useScopeContext?: boolean;
  useSessionContext?: boolean;
  clearedAt?: string | null;
}

export interface SearchUserContext {
  userId: string | null;
  role: string | null;
  language: string;
  preferences: SearchUserPreferences;
}

export interface SearchContextDebugInfo {
  sourceCounts: {
    recentQueryCount: number;
    recentEntityCount: number;
  };
  hasScopeContext: boolean;
  hasUserPreferences: boolean;
}

export interface SearchContext {
  scope: SearchScopeContext;
  session: SearchSessionContext;
  user: SearchUserContext;
  retrievalPlan: RetrievalPlan;
  contextHash: string;
  debug: SearchContextDebugInfo;
}

export interface SearchContextRouteInfo {
  pathname: string;
  page: string;
  ontologyLabel?: string | null;
  query?: string | null;
  filters?: Partial<SearchFilters>;
}

export interface SearchContextAuthenticatedUser {
  id?: string | null;
  role?: string | null;
  language?: string | null;
  preferences?: Partial<SearchUserPreferences> | null;
}

export interface SearchContextCollectorInput {
  route: SearchContextRouteInfo;
  authenticatedUser?: SearchContextAuthenticatedUser | null;
  sessionId?: string | null;
  controls?: SearchContextControls;
  session?: {
    activeQuery?: string | null;
    recentQueries?: string[];
    recentEntities?: SearchSessionEntity[];
  };
}

export interface CollectedSearchContext {
  context: SearchContext;
  contextHash: string;
}
