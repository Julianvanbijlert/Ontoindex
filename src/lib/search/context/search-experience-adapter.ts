import type { SearchHistoryEntry, SearchFilters, SearchResultItem } from "@/lib/search-types";
import { collectSearchContext } from "@/lib/search/context/context-collector";
import type {
  CollectedSearchContext,
  SearchContext,
  SearchContextAuthenticatedUser,
  SearchContextControls,
  SearchContextRouteInfo,
  SearchSessionEntity,
} from "@/lib/search/context/types";

export interface SearchExperienceAdapterInput {
  query: string;
  filters: SearchFilters;
  route: SearchContextRouteInfo;
  authenticatedUser?: SearchContextAuthenticatedUser | null;
  sessionId?: string | null;
  searchHistory?: SearchHistoryEntry[];
  recentFinds?: SearchResultItem[];
  controls?: SearchContextControls;
}

function toRecentQueries(
  searchHistory: SearchHistoryEntry[] | undefined,
  controls?: SearchContextControls,
) {
  const clearedAt = controls?.clearedAt ? new Date(controls.clearedAt).getTime() : null;

  return (searchHistory || [])
    .filter((entry) => !clearedAt || new Date(entry.created_at).getTime() >= clearedAt)
    .map((entry) => entry.query);
}

function toRecentEntities(
  recentFinds: SearchResultItem[] | undefined,
  controls?: SearchContextControls,
): SearchSessionEntity[] {
  const clearedAt = controls?.clearedAt ? new Date(controls.clearedAt).getTime() : null;

  return (recentFinds || [])
    .filter((item) => !clearedAt || !item.contextTimestamp || new Date(item.contextTimestamp).getTime() >= clearedAt)
    .map((item) => ({
      id: item.id,
      type: item.type,
      ontologyId: item.ontologyId || null,
      title: item.title,
    }));
}

export function collectSearchExperienceContext(
  input: SearchExperienceAdapterInput,
): CollectedSearchContext {
  return collectSearchContext({
    route: {
      ...input.route,
      query: input.query,
      filters: input.filters,
    },
    authenticatedUser: input.authenticatedUser,
    sessionId: input.sessionId,
    controls: input.controls,
    session: {
      activeQuery: input.query,
      recentQueries: toRecentQueries(input.searchHistory, input.controls),
      recentEntities: toRecentEntities(input.recentFinds, input.controls),
    },
  });
}

export function buildSearchContextFromExperience(input: SearchExperienceAdapterInput): SearchContext {
  return collectSearchExperienceContext(input).context;
}
