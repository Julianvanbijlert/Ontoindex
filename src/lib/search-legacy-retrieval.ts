import type { SearchFilters, SearchResultItem, SearchSort } from "@/lib/search-types";
import { includesNormalizedText, normalizeSearchText } from "@/lib/search-normalization";

function tagMatchesFilter(tags: string[] | null | undefined, filter: string) {
  const normalizedFilter = normalizeSearchText(filter);

  if (!normalizedFilter) {
    return false;
  }

  return (tags || []).some((tag) => normalizeSearchText(tag) === normalizedFilter);
}

function buildRelevanceScore(value: {
  title: string;
  description: string;
  tags: string[];
  ontologyTitle?: string | null;
}, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  const title = normalizeSearchText(value.title);
  const description = normalizeSearchText(value.description);
  const ontologyTitle = normalizeSearchText(value.ontologyTitle || "");
  const tags = value.tags.map((tag) => normalizeSearchText(tag));

  if (title === normalizedQuery) {
    score += 100;
  } else if (title.startsWith(normalizedQuery)) {
    score += 75;
  } else if (title.includes(normalizedQuery)) {
    score += 50;
  }

  if (description.includes(normalizedQuery)) {
    score += 20;
  }

  if (ontologyTitle.includes(normalizedQuery)) {
    score += 15;
  }

  if (tags.some((tag) => tag.includes(normalizedQuery))) {
    score += 25;
  }

  return score;
}

export function sortSearchResults(results: SearchResultItem[], sortBy: SearchSort) {
  return [...results].sort((left, right) => {
    switch (sortBy) {
      case "views":
        return right.viewCount - left.viewCount;
      case "recent":
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      case "title":
        return left.title.localeCompare(right.title);
      case "relevance":
      default: {
        if (right.relevance !== left.relevance) {
          return right.relevance - left.relevance;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
    }
  });
}

export function filterAndSortSearchResults(
  definitions: any[],
  ontologies: any[],
  normalizedQuery: string,
  filters: SearchFilters,
  sortBy: SearchSort,
  currentUserId?: string | null,
) {
  const definitionResults: SearchResultItem[] = definitions
    .filter((definition) => {
      if (filters.ownership === "mine" && definition.created_by !== currentUserId) {
        return false;
      }

      if (filters.status !== "all" && definition.status !== filters.status) {
        return false;
      }

      if (filters.ontologyId !== "all" && definition.ontology_id !== filters.ontologyId) {
        return false;
      }

      if (filters.tag !== "all" && !tagMatchesFilter(definition.tags || [], filters.tag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        definition.title,
        definition.description,
        definition.content,
        definition.ontologies?.title,
        ...(definition.tags || []),
      ]
        .filter(Boolean)
        .join(" ");

      return includesNormalizedText(haystack, normalizedQuery);
    })
    .map((definition) => ({
      id: definition.id,
      type: "definition" as const,
      title: definition.title,
      description: definition.description || definition.content || "",
      status: definition.status,
      updatedAt: definition.updated_at,
      viewCount: definition.view_count || 0,
      tags: definition.tags || [],
      ontologyId: definition.ontology_id,
      ontologyTitle: definition.ontologies?.title || null,
      priority: definition.priority,
      relevance: buildRelevanceScore(
        {
          title: definition.title,
          description: definition.description || definition.content || "",
          tags: definition.tags || [],
          ontologyTitle: definition.ontologies?.title || null,
        },
        normalizedQuery,
      ),
      retrievalStrategy: "legacy" as const,
      scoreBreakdown: {
        lexical: buildRelevanceScore(
          {
            title: definition.title,
            description: definition.description || definition.content || "",
            tags: definition.tags || [],
            ontologyTitle: definition.ontologies?.title || null,
          },
          normalizedQuery,
        ),
        dense: 0,
        fusion: 0,
        rerank: buildRelevanceScore(
          {
            title: definition.title,
            description: definition.description || definition.content || "",
            tags: definition.tags || [],
            ontologyTitle: definition.ontologies?.title || null,
          },
          normalizedQuery,
        ),
      },
    }));

  const ontologyResults: SearchResultItem[] = ontologies
    .filter((ontology) => {
      if (filters.ownership === "mine" && ontology.created_by !== currentUserId) {
        return false;
      }

      if (filters.status !== "all" && ontology.status !== filters.status) {
        return false;
      }

      if (filters.ontologyId !== "all" && ontology.id !== filters.ontologyId) {
        return false;
      }

      if (filters.tag !== "all" && !tagMatchesFilter(ontology.tags || [], filters.tag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [ontology.title, ontology.description, ...(ontology.tags || [])]
        .filter(Boolean)
        .join(" ");

      return includesNormalizedText(haystack, normalizedQuery);
    })
    .map((ontology) => ({
      id: ontology.id,
      type: "ontology" as const,
      title: ontology.title,
      description: ontology.description || "",
      status: ontology.status,
      updatedAt: ontology.updated_at,
      viewCount: ontology.view_count || 0,
      tags: ontology.tags || [],
      ontologyId: ontology.id,
      ontologyTitle: ontology.title,
      relevance: buildRelevanceScore(
        {
          title: ontology.title,
          description: ontology.description || "",
          tags: ontology.tags || [],
        },
        normalizedQuery,
      ),
      retrievalStrategy: "legacy" as const,
      scoreBreakdown: {
        lexical: buildRelevanceScore(
          {
            title: ontology.title,
            description: ontology.description || "",
            tags: ontology.tags || [],
          },
          normalizedQuery,
        ),
        dense: 0,
        fusion: 0,
        rerank: buildRelevanceScore(
          {
            title: ontology.title,
            description: ontology.description || "",
            tags: ontology.tags || [],
          },
          normalizedQuery,
        ),
      },
    }));

  const filteredByType =
    filters.type === "definition"
      ? definitionResults
      : filters.type === "ontology"
        ? ontologyResults
        : [...definitionResults, ...ontologyResults];

  return sortSearchResults(filteredByType, sortBy);
}
