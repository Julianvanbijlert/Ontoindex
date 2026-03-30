import { describe, expect, it } from "vitest";

import {
  buildSearchFailureBucket,
} from "@/lib/search-query";
import {
  analyzeSearchQuery,
  shouldAttemptDenseRetrieval,
} from "@/lib/search-query-understanding";
import type { SearchContext } from "@/lib/search/context/types";

function createSearchContext(overrides: Partial<SearchContext> = {}): SearchContext {
  const overrideUser = overrides.user || {};
  const overridePreferences = overrideUser.preferences || {};
  const { preferences: _ignoredPreferences, ...overrideUserWithoutPreferences } = overrideUser;

  return {
    scope: {
      routePath: "/search",
      page: "search",
      ontologyId: null,
      ontologyLabel: null,
      entityType: null,
      status: null,
      tag: null,
      ownership: null,
      ...(overrides.scope || {}),
    },
    session: {
      sessionId: "session-1",
      activeQuery: null,
      recentQueries: [],
      recentEntities: [],
      ...(overrides.session || {}),
    },
    user: {
      userId: "user-1",
      role: "editor",
      language: "en",
      preferences: {
        contextualSearchOptIn: true,
        viewPreference: null,
        formatPreference: null,
        sortPreference: null,
        groupByPreference: null,
        ...overridePreferences,
      },
      ...overrideUserWithoutPreferences,
    },
    retrievalPlan: {
      contextUse: "none",
      reason: "initial",
      needsRewrite: false,
      rewriteMode: "none",
      denseRetrievalGate: "off",
      ambiguityFlags: [],
      ...(overrides.retrievalPlan || {}),
    },
    contextHash: overrides.contextHash || "ctx-test",
    debug: {
      sourceCounts: {
        recentQueryCount: 0,
        recentEntityCount: 0,
      },
      hasScopeContext: false,
      hasUserPreferences: false,
      ...(overrides.debug || {}),
    },
  };
}

describe("search-query", () => {
  it("classifies short identifier-like queries as navigational and exact-match sensitive", () => {
    const analysis = analyzeSearchQuery("API_GATEWAY:v2");

    expect(analysis.intent).toBe("navigational");
    expect(analysis.exactMatchSensitive).toBe(true);
    expect(analysis.looksIdentifierLike).toBe(true);
    expect(analysis.shouldAttemptDense).toBe(false);
    expect(analysis.debug.denseGate.reason).toBe("identifier_lookup");
    expect(analysis.retrievalPlan).toMatchObject({
      contextUse: "none",
      needsRewrite: false,
      rewriteMode: "none",
      denseRetrievalGate: "off",
    });
    expect(analysis.debug.future.llmRewriteEligible).toBe(false);
  });

  it("normalizes lower, upper, and mixed-case queries consistently", () => {
    const lower = analyzeSearchQuery("worker");
    const upper = analyzeSearchQuery("WORKER");
    const mixed = analyzeSearchQuery("WoRkEr");

    expect(lower.normalizedQuery).toBe("worker");
    expect(upper.normalizedQuery).toBe("worker");
    expect(mixed.normalizedQuery).toBe("worker");
    expect(lower.intent).toBe(upper.intent);
    expect(upper.intent).toBe(mixed.intent);
    expect(lower.exactMatchSensitive).toBe(upper.exactMatchSensitive);
    expect(lower.ambiguityFlags).toEqual(upper.ambiguityFlags);
  });

  it("keeps natural-language single-token concepts eligible for semantic retrieval", () => {
    const analysis = analyzeSearchQuery("worker");

    expect(analysis.exactMatchSensitive).toBe(false);
    expect(analysis.shouldAttemptDense).toBe(true);
    expect(analysis.retrievalPlan.denseRetrievalGate).toBe("on");
  });

  it("classifies question-like queries as informational", () => {
    const analysis = analyzeSearchQuery("How does approval workflow routing work?");

    expect(analysis.intent).toBe("informational");
    expect(analysis.ambiguityLevel).toBe("low");
    expect(analysis.debug.future.llmRewriteEligible).toBe(true);
    expect(analysis.retrievalPlan.denseRetrievalGate).toBe("on");
  });

  it("marks broad natural-language queries as eligible for llm expansion", () => {
    const analysis = analyzeSearchQuery("worker approval workflow");

    expect(analysis.exactMatchSensitive).toBe(false);
    expect(analysis.debug.future.llmRewriteEligible).toBe(true);
  });

  it("marks short generic queries as ambiguous", () => {
    const analysis = analyzeSearchQuery("model");

    expect(analysis.ambiguityLevel).toBe("high");
    expect(analysis.ambiguityFlags).toContain("generic_term");
    expect(analysis.exactMatchSensitive).toBe(false);
    expect(analysis.shouldAttemptDense).toBe(false);
    expect(analysis.retrievalPlan.ambiguityFlags).toContain("generic_term");
  });

  it("avoids dense retrieval for very short queries", () => {
    expect(shouldAttemptDenseRetrieval("ok")).toBe(false);
    expect(shouldAttemptDenseRetrieval("sso")).toBe(true);
  });

  it("adds guarded rewrites for quoted exact queries without over-rewriting", () => {
    const analysis = analyzeSearchQuery("\"API Gateway\"");

    expect(analysis.rewrittenQueries).toEqual(["\"api gateway\"", "api gateway"]);
    expect(analysis.rewriteConfidence).toBe(0.42);
    expect(analysis.debug.rewriteGuardrails.preserveExactSemantics).toBe(true);
    expect(analysis.debug.rewriteGuardrails.blockedStrategies).toContain("path_normalization");
    expect(analysis.retrievalPlan.needsRewrite).toBe(true);
    expect(analysis.retrievalPlan.rewriteMode).toBe("heuristic");
  });

  it("produces structured debug output and future session markers", () => {
    const analysis = analyzeSearchQuery("approval workflow", {
      session: {
        activeQuery: "pending approvals",
        recentQueries: ["approval matrix"],
      },
    });

    expect(analysis.debug.tokens).toEqual(["approval", "workflow"]);
    expect(analysis.debug.future.hasSessionContext).toBe(true);
    expect(analysis.rewriteCandidates[0]?.strategy).toBe("identity");
    expect(analysis.debug.context.usedSessionQuery).toBe(false);
  });

  it("uses session context for conversational follow-ups with a full retrieval plan", () => {
    const analysis = analyzeSearchQuery("what about approvals?", {
      context: createSearchContext({
        scope: {
          ontologyId: "onto-1",
          ontologyLabel: "Access Management",
        },
        session: {
          activeQuery: "single sign on setup",
          recentQueries: ["single sign on setup"],
          recentEntities: [
            {
              id: "def-1",
              type: "definition",
              title: "Identity Provider",
            },
          ],
        },
      }),
    });

    expect(analysis.retrievalPlan).toMatchObject({
      contextUse: "full",
      needsRewrite: true,
      rewriteMode: "heuristic",
      denseRetrievalGate: "on",
    });
    expect(analysis.rewriteCandidates.some((candidate) => candidate.strategy === "context_follow_up")).toBe(true);
    expect(analysis.rewriteCandidates.some((candidate) => candidate.query.includes("within ontology Access Management"))).toBe(true);
    expect(analysis.debug.context.usedScopeMarker).toBe(true);
    expect(analysis.debug.context.usedSessionQuery).toBe(true);
    expect(analysis.debug.context.selectedEntityTitles).toEqual(["Identity Provider"]);
  });

  it("detects drift and scales context use back when a new query diverges", () => {
    const analysis = analyzeSearchQuery("billing exports", {
      context: createSearchContext({
        scope: {
          ontologyId: "onto-1",
          ontologyLabel: "Access Management",
        },
        session: {
          activeQuery: "single sign on setup",
          recentQueries: ["single sign on setup"],
          recentEntities: [
            {
              id: "def-1",
              type: "definition",
              title: "Identity Provider",
            },
          ],
        },
      }),
    });

    expect(analysis.retrievalPlan.contextUse).toBe("none");
    expect(analysis.retrievalPlan.reason).toBe("query_drift_detected");
    expect(analysis.debug.rewriteGuardrails.driftDetected).toBe(true);
  });

  it("respects a maximum context budget for session queries and entities", () => {
    const analysis = analyzeSearchQuery("what about it?", {
      context: createSearchContext({
        session: {
          activeQuery: "single sign on approval workflow policy changes",
          recentQueries: [
            "single sign on approval workflow policy changes for internal access",
            "identity provider metadata updates",
          ],
          recentEntities: [
            { id: "def-1", type: "definition", title: "Identity Provider" },
            { id: "def-2", type: "definition", title: "Approval Workflow" },
            { id: "def-3", type: "definition", title: "Metadata Contract" },
          ],
        },
      }),
    });

    const contextCandidate = analysis.rewriteCandidates.find((candidate) => candidate.strategy === "context_follow_up");

    expect(contextCandidate?.query).toContain("Identity Provider");
    expect(contextCandidate?.query).toContain("Approval Workflow");
    expect(contextCandidate?.query).not.toContain("Metadata Contract");
    expect(analysis.debug.rewriteGuardrails.contextTokenBudget).toBe(8);
    expect(analysis.debug.rewriteGuardrails.contextEntityBudget).toBe(2);
  });

  it("assigns useful failure buckets", () => {
    const analysis = analyzeSearchQuery("model");

    expect(buildSearchFailureBucket({
      analysis,
      resultCount: 0,
      fallbackUsed: false,
      topConfidence: null,
    })).toBe("ambiguous_zero_results");

    expect(buildSearchFailureBucket({
      analysis: analyzeSearchQuery("\"API Gateway\""),
      resultCount: 0,
      fallbackUsed: false,
      topConfidence: null,
    })).toBe("exact_match_miss");

    expect(buildSearchFailureBucket({
      analysis,
      resultCount: 3,
      fallbackUsed: true,
      topConfidence: "medium",
    })).toBe("legacy_fallback");
  });
});
