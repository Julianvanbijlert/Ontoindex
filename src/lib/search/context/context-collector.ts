import { analyzeSearchQuery, normalizeSearchQuery } from "@/lib/search-query-understanding";
import type {
  CollectedSearchContext,
  SearchContext,
  SearchContextCollectorInput,
  SearchContextDebugInfo,
  SearchScopeContext,
  SearchSessionContext,
  SearchSessionEntity,
  SearchUserContext,
} from "@/lib/search/context/types";

const MAX_RECENT_QUERIES = 5;
const MAX_RECENT_ENTITIES = 5;

function normalizeOptionalFilter(value: string | undefined) {
  if (!value || value === "all") {
    return null;
  }

  return value;
}

function normalizeLanguage(value?: string | null) {
  if (value) {
    return value.trim().toLowerCase();
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.trim().toLowerCase();
  }

  return "en";
}

function dedupeRecentQueries(values: string[] | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  (values || []).forEach((value) => {
    const query = normalizeSearchQuery(value);

    if (!query || seen.has(query)) {
      return;
    }

    seen.add(query);
    normalized.push(query);
  });

  return normalized.slice(0, MAX_RECENT_QUERIES);
}

function dedupeRecentEntities(values: SearchSessionEntity[] | undefined) {
  const seen = new Set<string>();
  const entities: SearchSessionEntity[] = [];

  (values || []).forEach((entity) => {
    const key = `${entity.type}:${entity.id}`;

    if (!entity.id || seen.has(key)) {
      return;
    }

    seen.add(key);
    entities.push({
      id: entity.id,
      type: entity.type,
      ontologyId: entity.ontologyId || null,
      title: entity.title || null,
    });
  });

  return entities.slice(0, MAX_RECENT_ENTITIES);
}

function buildScopeContext(input: SearchContextCollectorInput): SearchScopeContext {
  const useScopeContext = input.controls?.useScopeContext ?? true;

  return {
    routePath: input.route.pathname,
    page: input.route.page,
    ontologyId: useScopeContext ? normalizeOptionalFilter(input.route.filters?.ontologyId) : null,
    ontologyLabel: useScopeContext ? input.route.ontologyLabel?.trim() || null : null,
    entityType: useScopeContext && input.route.filters?.type && input.route.filters.type !== "all"
      ? input.route.filters.type
      : null,
    status: normalizeOptionalFilter(input.route.filters?.status),
    tag: useScopeContext ? normalizeOptionalFilter(input.route.filters?.tag) : null,
    ownership: input.route.filters?.ownership && input.route.filters.ownership !== "all"
      ? input.route.filters.ownership
      : null,
  };
}

function buildSessionContext(input: SearchContextCollectorInput): SearchSessionContext {
  const useSessionContext = input.controls?.useSessionContext ?? true;
  const activeQuery = input.session?.activeQuery ?? input.route.query ?? null;

  if (!useSessionContext) {
    return {
      sessionId: input.sessionId || null,
      activeQuery: activeQuery ? activeQuery.trim() : null,
      recentQueries: [],
      recentEntities: [],
    };
  }

  return {
    sessionId: input.sessionId || null,
    activeQuery: activeQuery ? activeQuery.trim() : null,
    recentQueries: dedupeRecentQueries(input.session?.recentQueries),
    recentEntities: dedupeRecentEntities(input.session?.recentEntities),
  };
}

function buildUserContext(input: SearchContextCollectorInput): SearchUserContext {
  const preferences = input.authenticatedUser?.preferences;

  return {
    userId: input.authenticatedUser?.id || null,
    role: input.authenticatedUser?.role || null,
    language: normalizeLanguage(input.authenticatedUser?.language),
    preferences: {
      contextualSearchOptIn: input.controls?.contextEnabled ?? preferences?.contextualSearchOptIn ?? true,
      contextUseProfile: preferences?.contextUseProfile ?? true,
      contextUseDeviceLocation: preferences?.contextUseDeviceLocation ?? false,
      viewPreference: preferences?.viewPreference ?? null,
      formatPreference: preferences?.formatPreference ?? null,
      sortPreference: preferences?.sortPreference ?? null,
      groupByPreference: preferences?.groupByPreference ?? null,
    },
  };
}

function buildRetrievalPlan(context: Omit<SearchContext, "contextHash" | "debug">) {
  const activeQuery = context.session.activeQuery || "";
  const normalizedQuery = normalizeSearchQuery(activeQuery);

  if (!normalizedQuery) {
    return {
      contextUse: "none" as const,
      reason: "empty_query",
      needsRewrite: false,
      rewriteMode: "none" as const,
      denseRetrievalGate: "off" as const,
      ambiguityFlags: [],
    };
  }

  if (!context.user.preferences.contextualSearchOptIn) {
    return {
      contextUse: "none" as const,
      reason: "user_opted_out",
      needsRewrite: false,
      rewriteMode: "none" as const,
      denseRetrievalGate: "off" as const,
      ambiguityFlags: [],
    };
  }

  const analysis = analyzeSearchQuery(activeQuery, {
    context,
  });
  const hasScopeContext = Boolean(
    context.scope.ontologyId
    || context.scope.entityType
    || context.scope.status
    || context.scope.tag
    || context.scope.ownership,
  );
  const hasSessionSignals =
    context.session.recentQueries.length > 0
    || context.session.recentEntities.length > 0;
  const hasUserSignals = Boolean(
    context.user.role
    || context.user.language
    || context.user.preferences.viewPreference
    || context.user.preferences.formatPreference
    || context.user.preferences.sortPreference
    || context.user.preferences.groupByPreference,
  );

  if (!hasScopeContext && !hasSessionSignals && !hasUserSignals) {
    return {
      contextUse: "none" as const,
      reason: "no_context_signals",
      needsRewrite: analysis.retrievalPlan.needsRewrite,
      rewriteMode: analysis.retrievalPlan.rewriteMode,
      denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
      ambiguityFlags: analysis.ambiguityFlags,
    };
  }

  if (analysis.exactMatchSensitive) {
    return {
      contextUse: analysis.retrievalPlan.contextUse === "none" ? "light" as const : analysis.retrievalPlan.contextUse,
      reason: "preserve_exact_match_semantics",
      needsRewrite: analysis.retrievalPlan.needsRewrite,
      rewriteMode: analysis.retrievalPlan.rewriteMode,
      denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
      ambiguityFlags: analysis.ambiguityFlags,
    };
  }

  if (hasScopeContext && hasSessionSignals) {
    return {
      contextUse: "full" as const,
      reason: "scope_and_session_signals_available",
      needsRewrite: analysis.retrievalPlan.needsRewrite,
      rewriteMode: analysis.retrievalPlan.rewriteMode,
      denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
      ambiguityFlags: analysis.ambiguityFlags,
    };
  }

  if (hasSessionSignals || hasUserSignals || hasScopeContext) {
    return {
      contextUse: "light" as const,
      reason: "limited_context_signals_available",
      needsRewrite: analysis.retrievalPlan.needsRewrite,
      rewriteMode: analysis.retrievalPlan.rewriteMode,
      denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
      ambiguityFlags: analysis.ambiguityFlags,
    };
  }

  return {
    contextUse: "none" as const,
    reason: "no_context_signals",
    needsRewrite: analysis.retrievalPlan.needsRewrite,
    rewriteMode: analysis.retrievalPlan.rewriteMode,
    denseRetrievalGate: analysis.retrievalPlan.denseRetrievalGate,
    ambiguityFlags: analysis.ambiguityFlags,
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function stableSerialize(value: unknown) {
  return JSON.stringify(sortObjectKeys(value));
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `ctx_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildDebugInfo(context: Omit<SearchContext, "contextHash" | "debug">): SearchContextDebugInfo {
  return {
    sourceCounts: {
      recentQueryCount: context.session.recentQueries.length,
      recentEntityCount: context.session.recentEntities.length,
    },
    hasScopeContext: Boolean(
      context.scope.ontologyId
      || context.scope.entityType
      || context.scope.status
      || context.scope.tag
      || context.scope.ownership,
    ),
    hasUserPreferences: Boolean(
      context.user.preferences.viewPreference
      || context.user.preferences.formatPreference
      || context.user.preferences.sortPreference
      || context.user.preferences.groupByPreference,
    ),
  };
}

export function collectSearchContext(input: SearchContextCollectorInput): CollectedSearchContext {
  const scope = buildScopeContext(input);
  const session = buildSessionContext(input);
  const user = buildUserContext(input);
  const provisionalContext = {
    scope,
    session,
    user,
    retrievalPlan: {
      contextUse: "none" as const,
      reason: "initializing",
      needsRewrite: false,
      rewriteMode: "none" as const,
      denseRetrievalGate: "off" as const,
      ambiguityFlags: [],
    },
  };
  const retrievalPlan = buildRetrievalPlan(provisionalContext);
  const serialized = stableSerialize({
    scope,
    session,
    user,
    retrievalPlan,
  });
  const contextHash = hashString(serialized);
  const context: SearchContext = {
    scope,
    session,
    user,
    retrievalPlan,
    contextHash,
    debug: buildDebugInfo({
      scope,
      session,
      user,
      retrievalPlan,
    }),
  };

  return {
    context,
    contextHash,
  };
}
