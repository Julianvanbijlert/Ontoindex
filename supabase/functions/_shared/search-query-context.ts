export type SearchContextEmbeddingMode = "none" | "concat" | "session";

const MAX_RECENT_QUERIES = 3;
const MAX_RECENT_ENTITIES = 3;
const MAX_CONTEXT_SUMMARY_LENGTH = 320;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeText(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value || "");
  return normalized.length > MAX_CONTEXT_SUMMARY_LENGTH
    ? normalized.slice(0, MAX_CONTEXT_SUMMARY_LENGTH)
    : normalized;
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

export function buildSearchQueryEmbeddingCacheKey(query: string, contextHash?: string | null) {
  const normalizedQuery = sanitizeText(query).toLowerCase();
  const normalizedContextHash = sanitizeText(contextHash || "none").toLowerCase() || "none";
  return hashString(`${normalizedQuery}::${normalizedContextHash}`);
}

export function sanitizeContextSummary(summary: string | null | undefined) {
  const normalized = sanitizeText(summary);
  return normalized || null;
}

function uniqueNormalized(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = sanitizeText(value);

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export async function buildContextSummary(
  client: any,
  input: {
    userId: string;
    sessionId?: string | null;
    fallbackSummary?: string | null;
  },
) {
  const query = client
    .from("search_session_events")
    .select("event_type, entity_id, entity_type, query_text, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  const scopedQuery = input.sessionId
    ? query.eq("session_id", input.sessionId)
    : query.eq("user_id", input.userId);
  const { data, error } = await scopedQuery;

  if (error) {
    return {
      summary: sanitizeContextSummary(input.fallbackSummary),
      debug: {
        recentQueryCount: 0,
        recentEntityCount: 0,
        source: input.fallbackSummary ? "fallback" : "none",
        error: error.message,
      },
    };
  }

  const events = Array.isArray(data) ? data : [];
  const recentQueries = uniqueNormalized(
    events
      .filter((event) => event.event_type === "search")
      .map((event) => event.query_text),
    MAX_RECENT_QUERIES,
  );
  const entityRefs = events
    .filter((event) =>
      Boolean(event.entity_id)
      && (event.entity_type === "definition" || event.entity_type === "ontology")
      && event.event_type !== "search")
    .map((event) => ({
      id: event.entity_id as string,
      type: event.entity_type as "definition" | "ontology",
    }))
    .filter((entity, index, collection) =>
      collection.findIndex((candidate) => candidate.id === entity.id && candidate.type === entity.type) === index)
    .slice(0, MAX_RECENT_ENTITIES * 2);

  const entityIds = entityRefs.map((entity) => entity.id);
  const tombstoneKeys = new Set<string>();

  if (entityIds.length > 0) {
    const tombstoneResponse = await client
      .from("activity_events")
      .select("entity_id, entity_type")
      .eq("is_tombstone", true)
      .in("entity_id", entityIds);

    (tombstoneResponse.data || []).forEach((event: { entity_id?: string | null; entity_type?: string | null }) => {
      if (event.entity_id && event.entity_type) {
        tombstoneKeys.add(`${event.entity_type}:${event.entity_id}`);
      }
    });
  }

  const definitionIds = entityRefs
    .filter((entity) => entity.type === "definition" && !tombstoneKeys.has(`definition:${entity.id}`))
    .map((entity) => entity.id);
  const ontologyIds = entityRefs
    .filter((entity) => entity.type === "ontology" && !tombstoneKeys.has(`ontology:${entity.id}`))
    .map((entity) => entity.id);
  const [definitionsResponse, ontologiesResponse] = await Promise.all([
    definitionIds.length > 0
      ? client.from("definitions").select("id, title").in("id", definitionIds).eq("is_deleted", false)
      : Promise.resolve({ data: [], error: null }),
    ontologyIds.length > 0
      ? client.from("ontologies").select("id, title").in("id", ontologyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const entityTitleMap = new Map<string, string>();

  (definitionsResponse.data || []).forEach((row: { id: string; title: string | null }) => {
    if (row.title) {
      entityTitleMap.set(`definition:${row.id}`, row.title);
    }
  });

  (ontologiesResponse.data || []).forEach((row: { id: string; title: string | null }) => {
    if (row.title) {
      entityTitleMap.set(`ontology:${row.id}`, row.title);
    }
  });

  const entityTitles = uniqueNormalized(
    entityRefs
      .map((entity) => entityTitleMap.get(`${entity.type}:${entity.id}`) || null),
    MAX_RECENT_ENTITIES,
  );
  const summaryParts: string[] = [];

  if (recentQueries.length > 0) {
    summaryParts.push(`recent queries: ${recentQueries.join(" | ")}`);
  }

  if (entityTitles.length > 0) {
    summaryParts.push(`recent entities: ${entityTitles.join(" | ")}`);
  }

  const summary = sanitizeContextSummary(summaryParts.join(". "))
    || sanitizeContextSummary(input.fallbackSummary);

  return {
    summary,
    debug: {
      recentQueryCount: recentQueries.length,
      recentEntityCount: entityTitles.length,
      source: summaryParts.length > 0 ? "search_session_events" : (input.fallbackSummary ? "fallback" : "none"),
      tombstoneCount: tombstoneKeys.size,
    },
  };
}

export function buildEmbeddingInput(
  query: string,
  input: {
    mode: SearchContextEmbeddingMode;
    contextSummary?: string | null;
  },
) {
  const sanitizedQuery = sanitizeText(query) || " ";
  const sanitizedSummary = sanitizeContextSummary(input.contextSummary);

  if (input.mode === "none" || !sanitizedSummary) {
    return {
      embeddingInput: sanitizedQuery,
      requestedMode: input.mode,
      effectiveMode: "none" as SearchContextEmbeddingMode,
      contextSummary: sanitizedSummary,
      sessionModeFallback: false,
    };
  }

  if (input.mode === "session") {
    return {
      embeddingInput: `${sanitizedQuery}\n\nSession context: ${sanitizedSummary}`,
      requestedMode: input.mode,
      effectiveMode: "concat" as SearchContextEmbeddingMode,
      contextSummary: sanitizedSummary,
      sessionModeFallback: true,
    };
  }

  return {
    embeddingInput: `${sanitizedQuery}\n\nSession context: ${sanitizedSummary}`,
    requestedMode: input.mode,
    effectiveMode: "concat" as SearchContextEmbeddingMode,
    contextSummary: sanitizedSummary,
    sessionModeFallback: false,
  };
}
