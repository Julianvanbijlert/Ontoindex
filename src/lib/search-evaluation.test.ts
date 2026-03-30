import { describe, expect, it } from "vitest";

import {
  aggregateReplaySessions,
  buildContextAblationReport,
  buildOfflineEvaluationReport,
  buildReplayTurnsFromLogs,
  compareBenchmarkStrategies,
  evaluateBenchmarkStrategy,
  evaluateBenchmarkStrategies,
  evaluateReplayTurns,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  searchBenchmarkCases,
} from "@/lib/search-evaluation";

describe("search-evaluation", () => {
  it("computes core ranking metrics", () => {
    expect(recallAtK(["a", "b"], ["a", "c", "b"], 2)).toBe(0.5);
    expect(precisionAtK(["a", "b"], ["a", "c", "b"], 2)).toBe(0.5);
    expect(reciprocalRank(["b"], ["a", "b", "c"])).toBe(0.5);
    expect(ndcgAtK({ a: 3, b: 2 }, ["b", "a"], 2)).toBeGreaterThan(0.7);
  });

  it("shows hybrid and reranked strategies outperforming lexical-only on the benchmark fixture", () => {
    const lexical = evaluateBenchmarkStrategy(searchBenchmarkCases, "lexical");
    const semantic = evaluateBenchmarkStrategy(searchBenchmarkCases, "semantic");
    const hybrid = evaluateBenchmarkStrategy(searchBenchmarkCases, "hybrid");
    const reranked = evaluateBenchmarkStrategy(searchBenchmarkCases, "reranked");
    const fallback = evaluateBenchmarkStrategy(searchBenchmarkCases, "fallback");

    expect(hybrid.recallAt5).toBeGreaterThanOrEqual(lexical.recallAt5);
    expect(hybrid.mrr).toBeGreaterThan(lexical.mrr);
    expect(hybrid.ndcgAt5).toBeGreaterThan(lexical.ndcgAt5);
    expect(hybrid.mrr).toBeGreaterThan(fallback.mrr);

    expect(semantic.recallAt5).toBeGreaterThanOrEqual(lexical.recallAt5);
    expect(semantic.mrr).toBeGreaterThan(lexical.mrr);

    expect(reranked.recallAt5).toBeGreaterThanOrEqual(hybrid.recallAt5);
    expect(reranked.mrr).toBeGreaterThanOrEqual(hybrid.mrr);
    expect(reranked.ndcgAt5).toBeGreaterThanOrEqual(hybrid.ndcgAt5);
  });

  it("exposes offline evaluation hooks for strategy matrices and pairwise comparisons", () => {
    const strategies = evaluateBenchmarkStrategies(searchBenchmarkCases);
    const hybridVsFallback = compareBenchmarkStrategies(searchBenchmarkCases, "fallback", "hybrid");
    const report = buildOfflineEvaluationReport(searchBenchmarkCases);

    expect(Object.keys(strategies)).toEqual(["fallback", "lexical", "semantic", "hybrid", "reranked"]);
    expect(hybridVsFallback.delta.mrr).toBeGreaterThan(0);
    expect(report.comparisons.some((comparison) =>
      comparison.baseline === "lexical" && comparison.candidate === "semantic")).toBe(true);
  });

  it("builds replay turns from search logs and session events", () => {
    const turns = buildReplayTurnsFromLogs(
      [
        {
          id: "log-1",
          sessionId: "session-1",
          query: "single sign on",
          createdAt: "2026-03-25T09:00:00.000Z",
          rankingsByContextUse: {
            none: ["def-idp", "def-sso"],
            light: ["def-sso", "def-idp"],
            full: ["def-sso", "def-idp"],
          },
        },
        {
          id: "log-2",
          sessionId: "session-1",
          query: "and provisioning",
          createdAt: "2026-03-25T09:03:00.000Z",
          rankingsByContextUse: {
            none: ["def-access-request", "def-provisioning"],
            light: ["def-provisioning", "def-access-request"],
            full: ["def-provisioning", "def-access-request"],
          },
        },
      ],
      [
        {
          id: "event-1",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-sso",
          createdAt: "2026-03-25T09:00:10.000Z",
        },
        {
          id: "event-2",
          sessionId: "session-1",
          eventType: "view",
          entityId: "def-idp",
          createdAt: "2026-03-25T09:00:25.000Z",
        },
        {
          id: "event-3",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-provisioning",
          createdAt: "2026-03-25T09:03:10.000Z",
        },
        {
          id: "event-4",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-deleted",
          createdAt: "2026-03-25T09:03:15.000Z",
          isTombstone: true,
        },
      ],
    );

    expect(turns).toHaveLength(2);
    expect(turns[0].relevanceById).toEqual({
      "def-idp": 1,
      "def-sso": 3,
    });
    expect(turns[1].relevanceById).toEqual({
      "def-provisioning": 3,
    });
  });

  it("supports context ablation comparisons for none vs light vs full", () => {
    const turns = buildReplayTurnsFromLogs(
      [
        {
          id: "log-1",
          sessionId: "session-1",
          query: "single sign on",
          createdAt: "2026-03-25T09:00:00.000Z",
          rankingsByContextUse: {
            none: ["def-idp", "def-sso"],
            light: ["def-sso", "def-idp"],
            full: ["def-sso", "def-idp"],
          },
        },
        {
          id: "log-2",
          sessionId: "session-1",
          query: "and provisioning",
          createdAt: "2026-03-25T09:03:00.000Z",
          rankingsByContextUse: {
            none: ["def-access-request", "def-provisioning"],
            light: ["def-provisioning", "def-access-request"],
            full: ["def-provisioning", "def-access-request"],
          },
        },
      ],
      [
        {
          id: "event-1",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-sso",
          createdAt: "2026-03-25T09:00:10.000Z",
        },
        {
          id: "event-2",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-provisioning",
          createdAt: "2026-03-25T09:03:10.000Z",
        },
      ],
    );
    const noneMetrics = evaluateReplayTurns(turns, "none");
    const lightMetrics = evaluateReplayTurns(turns, "light");
    const fullMetrics = evaluateReplayTurns(turns, "full");
    const report = buildContextAblationReport(turns);

    expect(lightMetrics.mrr).toBeGreaterThan(noneMetrics.mrr);
    expect(fullMetrics.ndcgAt5).toBeGreaterThanOrEqual(lightMetrics.ndcgAt5);
    expect(report.turns.full.mrr).toBe(fullMetrics.mrr);
  });

  it("aggregates replay quality at the session level", () => {
    const turns = buildReplayTurnsFromLogs(
      [
        {
          id: "log-1",
          sessionId: "session-1",
          query: "single sign on",
          createdAt: "2026-03-25T09:00:00.000Z",
          rankingsByContextUse: {
            none: ["def-idp", "def-sso"],
            light: ["def-sso", "def-idp"],
            full: ["def-sso", "def-idp"],
          },
        },
        {
          id: "log-2",
          sessionId: "session-2",
          query: "governance model",
          createdAt: "2026-03-25T10:00:00.000Z",
          rankingsByContextUse: {
            none: ["def-policy-owner", "onto-governance-model"],
            light: ["onto-governance-model", "def-policy-owner"],
            full: ["onto-governance-model", "def-policy-owner"],
          },
        },
      ],
      [
        {
          id: "event-1",
          sessionId: "session-1",
          eventType: "click",
          entityId: "def-sso",
          createdAt: "2026-03-25T09:00:10.000Z",
        },
        {
          id: "event-2",
          sessionId: "session-2",
          eventType: "click",
          entityId: "onto-governance-model",
          createdAt: "2026-03-25T10:00:10.000Z",
        },
      ],
    );
    const sessionMetrics = aggregateReplaySessions(turns, "full");

    expect(sessionMetrics.sessionCount).toBe(2);
    expect(sessionMetrics.turnCount).toBe(2);
    expect(sessionMetrics.turnMrr).toBeGreaterThan(0);
    expect(sessionMetrics.sessionSuccessRate).toBe(1);
  });
});
