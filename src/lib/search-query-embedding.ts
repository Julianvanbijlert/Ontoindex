import type { SearchContext } from "@/lib/search/context/types";

export type SearchContextEmbeddingMode = "none" | "concat" | "session";

const MAX_INLINE_QUERY_COUNT = 3;
const MAX_INLINE_ENTITY_COUNT = 3;
const MAX_CONTEXT_SUMMARY_LENGTH = 320;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeSegment(value: string | null | undefined) {
  return normalizeWhitespace(value || "");
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `sqe_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeContextEmbeddingMode(value: string | null | undefined): SearchContextEmbeddingMode {
  if (value === "none" || value === "concat" || value === "session") {
    return value;
  }

  return "concat";
}

export function buildSearchQueryEmbeddingCacheKey(
  query: string,
  contextHash?: string | null,
  mode: SearchContextEmbeddingMode = "concat",
) {
  const normalizedQuery = sanitizeSegment(query).toLowerCase();
  const normalizedContextHash = sanitizeSegment(contextHash || "none").toLowerCase() || "none";
  return hashString(`${mode}::${normalizedQuery}::${normalizedContextHash}`);
}

export function sanitizeContextSummary(summary: string | null | undefined) {
  const normalized = sanitizeSegment(summary);

  if (!normalized) {
    return null;
  }

  return normalized.length > MAX_CONTEXT_SUMMARY_LENGTH
    ? normalized.slice(0, MAX_CONTEXT_SUMMARY_LENGTH)
    : normalized;
}

export function buildInlineSearchContextSummary(context?: SearchContext | null) {
  if (!context) {
    return null;
  }

  const queryParts = (context.session.recentQueries || [])
    .map((query) => sanitizeSegment(query))
    .filter(Boolean)
    .slice(0, MAX_INLINE_QUERY_COUNT);
  const entityParts = (context.session.recentEntities || [])
    .map((entity) => sanitizeSegment(entity.title || null))
    .filter(Boolean)
    .slice(0, MAX_INLINE_ENTITY_COUNT);
  const summaryParts: string[] = [];

  if (queryParts.length > 0) {
    summaryParts.push(`recent queries: ${queryParts.join(" | ")}`);
  }

  if (entityParts.length > 0) {
    summaryParts.push(`recent entities: ${entityParts.join(" | ")}`);
  }

  return sanitizeContextSummary(summaryParts.join(". "));
}
