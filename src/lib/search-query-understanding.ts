import { searchRuntimeConfig } from "@/lib/search-config";
import { normalizeSearchText } from "@/lib/search-normalization";
import type { SearchContext } from "@/lib/search/context/types";
import type {
  RetrievalPlan,
  SearchAmbiguityFlag,
  SearchDenseRetrievalGate,
  SearchRewriteMode,
} from "@/lib/search-query-planning";
export type {
  RetrievalPlan,
  SearchAmbiguityFlag,
  SearchDenseRetrievalGate,
  SearchRewriteMode,
} from "@/lib/search-query-planning";

export type SearchIntent = "navigational" | "informational" | "exploratory";
export type SearchAmbiguityLevel = "low" | "medium" | "high";
export type SearchConfidence = "strong" | "medium" | "weak";
export type SearchRewriteStrategy =
  | "identity"
  | "dequote"
  | "separator_normalization"
  | "path_normalization"
  | "context_follow_up"
  | "scope_marker";
export type SearchDenseGateReason =
  | "eligible"
  | "empty_query"
  | "too_short"
  | "generic_short_query"
  | "identifier_lookup"
  | "quoted_exact_match"
  | "context_disabled";

export interface SearchQuerySessionContext {
  recentQueries?: string[];
  activeQuery?: string | null;
}

export interface SearchRewriteCandidate {
  query: string;
  normalizedQuery: string;
  strategy: SearchRewriteStrategy;
  confidence: number;
}

export interface SearchQueryDebugInfo {
  tokens: string[];
  firstToken: string;
  heuristics: {
    hasQuotedPhrase: boolean;
    looksIdentifierLike: boolean;
    isQuestionLike: boolean;
    isShortLookup: boolean;
    isGenericShortTerm: boolean;
    isConversationalFollowUp: boolean;
  };
  rewriteGuardrails: {
    blockedStrategies: SearchRewriteStrategy[];
    maxRewriteCount: number;
    preserveExactSemantics: boolean;
    contextTokenBudget: number;
    contextEntityBudget: number;
    driftDetected: boolean;
  };
  denseGate: {
    shouldAttemptDense: boolean;
    reason: SearchDenseGateReason;
  };
  context: {
    usedScopeMarker: boolean;
    usedSessionQuery: boolean;
    selectedEntityTitles: string[];
    divergenceScore: number;
  };
  future: {
    llmRewriteEligible: boolean;
    hasSessionContext: boolean;
  };
}

export interface SearchQueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  rewrittenQueries: string[];
  rewriteCandidates: SearchRewriteCandidate[];
  rewriteConfidence: number;
  intent: SearchIntent;
  ambiguityLevel: SearchAmbiguityLevel;
  ambiguityFlags: SearchAmbiguityFlag[];
  exactMatchSensitive: boolean;
  tokenCount: number;
  hasQuotedPhrase: boolean;
  looksIdentifierLike: boolean;
  shouldAttemptDense: boolean;
  retrievalPlan: RetrievalPlan;
  debug: SearchQueryDebugInfo;
}

export interface SearchQueryUnderstandingInput {
  session?: SearchQuerySessionContext;
  context?: SearchContext | null;
}

export interface SearchQueryUnderstanding {
  analyze(query: string, input?: SearchQueryUnderstandingInput): SearchQueryAnalysis;
  normalize(query: string): string;
  shouldAttemptDense(query: string, input?: SearchQueryUnderstandingInput): boolean;
}

const QUESTION_PREFIXES = [
  "what",
  "when",
  "where",
  "why",
  "how",
  "who",
  "which",
  "define",
  "explain",
  "show",
];

const FOLLOW_UP_PREFIXES = [
  "and",
  "also",
  "what about",
  "how about",
  "about",
  "then",
  "now",
  "same",
  "it",
  "that",
  "those",
  "them",
  "this",
];

const GENERIC_SHORT_TERMS = new Set([
  "api",
  "auth",
  "data",
  "graph",
  "model",
  "schema",
  "search",
  "system",
  "user",
]);

const CONTEXT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "with",
]);

const MAX_CONTEXT_QUERY_TOKENS = 8;
const MAX_CONTEXT_ENTITIES = 2;
const MIN_SHARED_TOKEN_RATIO = 0.2;

function clampConfidence(value: number) {
  return Math.max(0, Math.min(Number(value.toFixed(2)), 1));
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(Number(value.toFixed(2)), 1));
}

export function shouldUseLlmQueryExpansion(input: {
  normalizedQuery: string;
  tokenCount: number;
  exactMatchSensitive: boolean;
  hasQuotedPhrase: boolean;
  looksIdentifierLike: boolean;
  intent: SearchIntent;
  ambiguityLevel: SearchAmbiguityLevel;
}) {
  if (!input.normalizedQuery || input.normalizedQuery.length < 4) {
    return false;
  }

  if (input.tokenCount > 8) {
    return false;
  }

  if (input.exactMatchSensitive || input.hasQuotedPhrase || input.looksIdentifierLike) {
    return false;
  }

  return input.ambiguityLevel !== "low" || input.intent === "informational";
}

function normalizeSpacing(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSearchQuery(query: string) {
  return normalizeSearchText(normalizeSpacing(query));
}

function tokenize(value: string) {
  return normalizeSearchQuery(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function resolveIntent(input: {
  exactMatchSensitive: boolean;
  isQuestionLike: boolean;
  tokenCount: number;
}): SearchIntent {
  if (input.isQuestionLike || input.tokenCount >= 6) {
    return "informational";
  }

  if (input.exactMatchSensitive) {
    return "navigational";
  }

  return "exploratory";
}

function resolveAmbiguity(input: {
  normalizedQuery: string;
  tokenCount: number;
  exactMatchSensitive: boolean;
  isGenericShortTerm: boolean;
  intent: SearchIntent;
}) {
  const flags: SearchAmbiguityFlag[] = [];

  if (!input.normalizedQuery) {
    return {
      ambiguityFlags: flags,
      ambiguityLevel: "low" as SearchAmbiguityLevel,
    };
  }

  if (input.tokenCount === 1) {
    flags.push("single_token");
  }

  if (input.isGenericShortTerm) {
    flags.push("generic_term");
  }

  if (input.tokenCount <= 2 && !input.exactMatchSensitive) {
    flags.push("underspecified");
  }

  if (input.intent === "exploratory" && input.tokenCount <= 3) {
    flags.push("broad_exploratory");
  }

  let ambiguityLevel: SearchAmbiguityLevel = "low";

  if (input.isGenericShortTerm || (input.tokenCount === 1 && !input.exactMatchSensitive)) {
    ambiguityLevel = "high";
  } else if (flags.length > 0) {
    ambiguityLevel = "medium";
  }

  return {
    ambiguityFlags: [...new Set(flags)],
    ambiguityLevel,
  };
}

function buildQuerySessionContext(input?: SearchQueryUnderstandingInput) {
  if (input?.context) {
    return {
      activeQuery: input.context.session.activeQuery,
      recentQueries: input.context.session.recentQueries,
    };
  }

  return {
    activeQuery: input?.session?.activeQuery || null,
    recentQueries: input?.session?.recentQueries || [],
  };
}

function detectConversationalFollowUp(query: string, normalizedQuery: string, tokenCount: number) {
  if (!normalizedQuery) {
    return false;
  }

  if (FOLLOW_UP_PREFIXES.some((prefix) => normalizedQuery === prefix || normalizedQuery.startsWith(`${prefix} `))) {
    return true;
  }

  return tokenCount <= 4 && /^(it|that|those|them|same|another|more)\b/i.test(query.trim());
}

function toContentTokens(value: string) {
  return tokenize(value).filter((token) => !CONTEXT_STOPWORDS.has(token));
}

function computeDivergenceScore(query: string, reference: string | null | undefined) {
  const queryTokens = new Set(toContentTokens(query));
  const referenceTokens = new Set(toContentTokens(reference || ""));

  if (queryTokens.size === 0 || referenceTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  queryTokens.forEach((token) => {
    if (referenceTokens.has(token)) {
      overlap += 1;
    }
  });

  const union = new Set([...queryTokens, ...referenceTokens]).size;
  return clampUnit(1 - overlap / Math.max(union, 1));
}

function getContextEntityTitles(context?: SearchContext | null) {
  return (context?.session.recentEntities || [])
    .map((entity) => entity.title?.trim() || "")
    .filter(Boolean)
    .slice(0, MAX_CONTEXT_ENTITIES);
}

function getScopeMarker(context?: SearchContext | null) {
  if (!context?.scope.ontologyId && !context?.scope.entityType) {
    return null;
  }

  const parts: string[] = [];

  if (context.scope.ontologyId) {
    parts.push(`within ontology ${context.scope.ontologyLabel || context.scope.ontologyId}`);
  }

  if (context.scope.entityType) {
    parts.push(`for ${context.scope.entityType}s`);
  }

  if (context.scope.tag) {
    parts.push(`tagged ${context.scope.tag}`);
  }

  return parts.join(" ");
}

function buildFollowUpRewriteQuery(query: string, input: {
  context?: SearchContext | null;
  session: SearchQuerySessionContext;
}) {
  const baseParts: string[] = [];
  const scopeMarker = getScopeMarker(input.context);
  const contextTokensBudgeted = input.session.recentQueries
    .slice(0, 1)
    .flatMap((recentQuery) => tokenize(recentQuery).slice(0, MAX_CONTEXT_QUERY_TOKENS))
    .join(" ");

  if (scopeMarker) {
    baseParts.push(scopeMarker);
  }

  if (contextTokensBudgeted) {
    baseParts.push(contextTokensBudgeted);
  }

  getContextEntityTitles(input.context).forEach((title) => {
    baseParts.push(title);
  });

  baseParts.push(query);

  return normalizeSpacing(baseParts.join(" "));
}

function resolveContextUse(input: {
  context?: SearchContext | null;
  exactMatchSensitive: boolean;
  driftDetected: boolean;
  isConversationalFollowUp: boolean;
}) {
  if (!input.context || !input.context.user.preferences.contextualSearchOptIn) {
    return {
      contextUse: "none" as const,
      reason: "context_not_available",
    };
  }

  if (input.driftDetected && !input.isConversationalFollowUp) {
    return {
      contextUse: "none" as const,
      reason: "query_drift_detected",
    };
  }

  if (input.exactMatchSensitive) {
    return {
      contextUse: "light" as const,
      reason: "preserve_exact_match_semantics",
    };
  }

  if (input.isConversationalFollowUp) {
    return {
      contextUse: "full" as const,
      reason: "conversational_follow_up",
    };
  }

  if (input.context.scope.ontologyId || input.context.scope.entityType) {
    return {
      contextUse: "light" as const,
      reason: "scope_context_available",
    };
  }

  if (input.context.session.recentQueries.length > 0 || input.context.session.recentEntities.length > 0) {
    return {
      contextUse: "light" as const,
      reason: "session_context_available",
    };
  }

  return {
    contextUse: "none" as const,
    reason: "no_context_signals",
  };
}

function resolveDenseGate(input: {
  normalizedQuery: string;
  hasQuotedPhrase: boolean;
  looksIdentifierLike: boolean;
  tokenCount: number;
  isGenericShortTerm: boolean;
  contextUse: RetrievalPlan["contextUse"];
}) {
  if (!input.normalizedQuery) {
    return {
      shouldAttemptDense: false,
      reason: "empty_query" as SearchDenseGateReason,
    };
  }

  if (input.normalizedQuery.length < 3) {
    return {
      shouldAttemptDense: false,
      reason: "too_short" as SearchDenseGateReason,
    };
  }

  if (input.hasQuotedPhrase) {
    return {
      shouldAttemptDense: false,
      reason: "quoted_exact_match" as SearchDenseGateReason,
    };
  }

  if (input.looksIdentifierLike) {
    return {
      shouldAttemptDense: false,
      reason: "identifier_lookup" as SearchDenseGateReason,
    };
  }

  if (input.tokenCount <= 1 && input.isGenericShortTerm) {
    return {
      shouldAttemptDense: false,
      reason: "generic_short_query" as SearchDenseGateReason,
    };
  }

  if (input.contextUse === "none" && !searchRuntimeConfig.enableQueryRewriting) {
    return {
      shouldAttemptDense: true,
      reason: "eligible" as SearchDenseGateReason,
    };
  }

  return {
    shouldAttemptDense: true,
    reason: "eligible" as SearchDenseGateReason,
  };
}

function buildRewriteCandidates(input: {
  query: string;
  normalizedQuery: string;
  hasQuotedPhrase: boolean;
  looksIdentifierLike: boolean;
  isShortLookup: boolean;
  exactMatchSensitive: boolean;
  isConversationalFollowUp: boolean;
  context?: SearchContext | null;
  session: SearchQuerySessionContext;
  contextUse: RetrievalPlan["contextUse"];
}) {
  const blockedStrategies: SearchRewriteStrategy[] = [];
  const candidates = new Map<string, SearchRewriteCandidate>();
  const preserveExactSemantics =
    input.hasQuotedPhrase
    || input.looksIdentifierLike
    || (input.isShortLookup && input.normalizedQuery.length <= 16);
  const maxRewriteCount = preserveExactSemantics ? 2 : 5;
  const selectedEntityTitles = getContextEntityTitles(input.context);
  const scopeMarker = getScopeMarker(input.context);
  let usedSessionQuery = false;
  let usedScopeMarker = false;

  const addCandidate = (
    value: string,
    strategy: SearchRewriteStrategy,
    confidence: number,
  ) => {
    const normalizedValue = normalizeSearchQuery(value);

    if (!normalizedValue || candidates.has(normalizedValue)) {
      return;
    }

    candidates.set(normalizedValue, {
      query: normalizeSpacing(value),
      normalizedQuery: normalizedValue,
      strategy,
      confidence: clampConfidence(confidence),
    });
  };

  addCandidate(input.query, "identity", 1);

  if (!searchRuntimeConfig.enableQueryRewriting) {
    return {
      rewriteCandidates: [...candidates.values()].slice(0, 1),
      rewriteConfidence: 0,
      rewriteMode: "none" as SearchRewriteMode,
      needsRewrite: false,
      rewriteGuardrails: {
        blockedStrategies: ["dequote", "separator_normalization", "path_normalization", "context_follow_up", "scope_marker"],
        maxRewriteCount: 1,
        preserveExactSemantics: true,
        contextTokenBudget: MAX_CONTEXT_QUERY_TOKENS,
        contextEntityBudget: MAX_CONTEXT_ENTITIES,
        driftDetected: false,
      },
      contextSignals: {
        usedScopeMarker: false,
        usedSessionQuery: false,
        selectedEntityTitles: [] as string[],
      },
    };
  }

  if (input.hasQuotedPhrase) {
    addCandidate(input.query.replace(/["']/g, ""), "dequote", 0.42);
    blockedStrategies.push("separator_normalization", "path_normalization", "context_follow_up", "scope_marker");
  } else if (input.looksIdentifierLike) {
    blockedStrategies.push("dequote", "separator_normalization", "path_normalization", "context_follow_up", "scope_marker");
  } else if (preserveExactSemantics) {
    blockedStrategies.push("dequote", "separator_normalization", "path_normalization", "context_follow_up");

    if (input.contextUse !== "none" && scopeMarker) {
      addCandidate(`${scopeMarker} ${input.query}`, "scope_marker", 0.24);
      usedScopeMarker = true;
    } else {
      blockedStrategies.push("scope_marker");
    }
  } else {
    addCandidate(input.query.replace(/["']/g, ""), "dequote", 0.62);
    addCandidate(input.query.replace(/[_-]+/g, " "), "separator_normalization", 0.74);
    addCandidate(input.query.replace(/[/:]+/g, " "), "path_normalization", 0.68);

    if (input.contextUse !== "none" && scopeMarker) {
      addCandidate(`${scopeMarker} ${input.query}`, "scope_marker", 0.58);
      usedScopeMarker = true;
    } else {
      blockedStrategies.push("scope_marker");
    }

    if (input.contextUse === "full" && input.isConversationalFollowUp && input.session.recentQueries?.length) {
      addCandidate(
        buildFollowUpRewriteQuery(input.query, {
          context: input.context,
          session: input.session,
        }),
        "context_follow_up",
        0.78,
      );
      usedSessionQuery = true;
    } else {
      blockedStrategies.push("context_follow_up");
    }
  }

  const orderedCandidates = [...candidates.values()].slice(0, maxRewriteCount);
  const rewriteConfidence = clampConfidence(
    Math.max(0, ...orderedCandidates
      .filter((candidate) => candidate.strategy !== "identity")
      .map((candidate) => candidate.confidence)),
  );
  const rewriteMode: SearchRewriteMode = orderedCandidates.some((candidate) => candidate.strategy !== "identity")
    ? "heuristic"
    : "none";

  return {
    rewriteCandidates: orderedCandidates,
    rewriteConfidence,
    rewriteMode,
    needsRewrite: rewriteMode !== "none",
    rewriteGuardrails: {
      blockedStrategies: [...new Set(blockedStrategies)],
      maxRewriteCount,
      preserveExactSemantics,
      contextTokenBudget: MAX_CONTEXT_QUERY_TOKENS,
      contextEntityBudget: MAX_CONTEXT_ENTITIES,
      driftDetected: false,
    },
    contextSignals: {
      usedScopeMarker,
      usedSessionQuery,
      selectedEntityTitles,
    },
  };
}

function analyzeSearchQueryInternal(
  query: string,
  input?: SearchQueryUnderstandingInput,
): SearchQueryAnalysis {
  const normalizedQuery = normalizeSearchQuery(query);
  const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
  const firstToken = tokens[0] || "";
  const session = buildQuerySessionContext(input);
  const hasQuotedPhrase = /"[^"]+"/.test(query);
  const looksIdentifierLike =
    /^[A-Za-z0-9._:-]{2,48}$/.test(query.trim())
    && (/[0-9]/.test(query) || /[._:-]/.test(query));
  const isQuestionLike = QUESTION_PREFIXES.includes(firstToken) || /\?$/.test(query.trim());
  const isShortLookup = tokens.length > 0 && tokens.length <= 2 && normalizedQuery.length <= 32;
  const isGenericShortTerm =
    tokens.length === 1
    && normalizedQuery.length <= 8
    && GENERIC_SHORT_TERMS.has(normalizedQuery);
  const isNaturalLanguageSingleToken =
    tokens.length === 1
    && /^[a-z]+$/.test(normalizedQuery)
    && normalizedQuery.length >= 4;
  const isConversationalFollowUp = detectConversationalFollowUp(query, normalizedQuery, tokens.length);
  const exactMatchSensitive =
    hasQuotedPhrase
    || looksIdentifierLike
    || (
      isShortLookup
      && !isGenericShortTerm
      && !isQuestionLike
      && !isConversationalFollowUp
      && !isNaturalLanguageSingleToken
    );
  const intent = resolveIntent({
    exactMatchSensitive,
    isQuestionLike,
    tokenCount: tokens.length,
  });
  const { ambiguityFlags, ambiguityLevel } = resolveAmbiguity({
    normalizedQuery,
    tokenCount: tokens.length,
    exactMatchSensitive,
    isGenericShortTerm,
    intent,
  });
  const divergenceScore = computeDivergenceScore(query, session.recentQueries?.[0] || session.activeQuery || "");
  const driftDetected = divergenceScore > 1 - MIN_SHARED_TOKEN_RATIO;
  const contextUseState = resolveContextUse({
    context: input?.context,
    exactMatchSensitive,
    driftDetected,
    isConversationalFollowUp,
  });
  const rewriteState = buildRewriteCandidates({
    query,
    normalizedQuery,
    hasQuotedPhrase,
    looksIdentifierLike,
    isShortLookup,
    exactMatchSensitive,
    isConversationalFollowUp,
    context: input?.context,
    session,
    contextUse: contextUseState.contextUse,
  });
  rewriteState.rewriteGuardrails.driftDetected = driftDetected;
  const denseGate = resolveDenseGate({
    normalizedQuery,
    hasQuotedPhrase,
    looksIdentifierLike,
    tokenCount: tokens.length,
    isGenericShortTerm,
    contextUse: contextUseState.contextUse,
  });
  const hasSessionContext = Boolean(
    session.activeQuery
    || session.recentQueries?.length,
  );
  const llmQueryExpansionEligible = shouldUseLlmQueryExpansion({
    normalizedQuery,
    tokenCount: tokens.length,
    exactMatchSensitive,
    hasQuotedPhrase,
    looksIdentifierLike,
    intent,
    ambiguityLevel,
  });
  const retrievalPlan: RetrievalPlan = {
    contextUse: contextUseState.contextUse,
    reason: contextUseState.reason,
    needsRewrite: rewriteState.needsRewrite,
    rewriteMode: rewriteState.rewriteMode,
    denseRetrievalGate: denseGate.shouldAttemptDense ? "on" : "off",
    ambiguityFlags,
  };

  return {
    originalQuery: query,
    normalizedQuery,
    rewrittenQueries: rewriteState.rewriteCandidates.map((candidate) => candidate.normalizedQuery),
    rewriteCandidates: rewriteState.rewriteCandidates,
    rewriteConfidence: rewriteState.rewriteConfidence,
    intent,
    ambiguityLevel,
    ambiguityFlags,
    exactMatchSensitive,
    tokenCount: tokens.length,
    hasQuotedPhrase,
    looksIdentifierLike,
    shouldAttemptDense: denseGate.shouldAttemptDense,
    retrievalPlan,
    debug: {
      tokens,
      firstToken,
      heuristics: {
        hasQuotedPhrase,
        looksIdentifierLike,
        isQuestionLike,
        isShortLookup,
        isGenericShortTerm,
        isConversationalFollowUp,
      },
      rewriteGuardrails: rewriteState.rewriteGuardrails,
      denseGate,
      context: {
        usedScopeMarker: rewriteState.contextSignals.usedScopeMarker,
        usedSessionQuery: rewriteState.contextSignals.usedSessionQuery,
        selectedEntityTitles: rewriteState.contextSignals.selectedEntityTitles,
        divergenceScore,
      },
      future: {
        llmRewriteEligible: llmQueryExpansionEligible,
        hasSessionContext,
      },
    },
  };
}

export const searchQueryUnderstanding: SearchQueryUnderstanding = {
  analyze(query, input) {
    return analyzeSearchQueryInternal(query, input);
  },
  normalize(query) {
    return normalizeSearchQuery(query);
  },
  shouldAttemptDense(query, input) {
    return analyzeSearchQueryInternal(query, input).shouldAttemptDense;
  },
};

export function analyzeSearchQuery(
  query: string,
  input?: SearchQueryUnderstandingInput,
) {
  return searchQueryUnderstanding.analyze(query, input);
}

export function shouldAttemptDenseRetrieval(
  query: string,
  input?: SearchQueryUnderstandingInput,
) {
  return searchQueryUnderstanding.shouldAttemptDense(query, input);
}
