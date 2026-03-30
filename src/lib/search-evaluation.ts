export type SearchEvaluationStrategy =
  | "fallback"
  | "lexical"
  | "semantic"
  | "hybrid"
  | "reranked";

export type SearchContextAblationMode = "none" | "light" | "full";

export interface SearchBenchmarkCase {
  id: string;
  query: string;
  relevanceById: Record<string, number>;
  rankings: Record<SearchEvaluationStrategy, string[]>;
}

export interface SearchMetricSummary {
  recallAt5: number;
  precisionAt5: number;
  mrr: number;
  ndcgAt5: number;
}

export interface SearchStrategyComparison {
  baseline: SearchEvaluationStrategy;
  candidate: SearchEvaluationStrategy;
  baselineMetrics: SearchMetricSummary;
  candidateMetrics: SearchMetricSummary;
  delta: SearchMetricSummary;
}

export interface SearchOfflineEvaluationReport {
  strategies: Record<SearchEvaluationStrategy, SearchMetricSummary>;
  comparisons: SearchStrategyComparison[];
}

export interface SearchReplayLogRow {
  id: string;
  sessionId: string;
  query: string;
  createdAt: string;
  rankingsByContextUse: Record<SearchContextAblationMode, string[]>;
}

export interface SearchReplaySessionEvent {
  id: string;
  sessionId: string;
  createdAt: string;
  eventType: "search" | "view" | "click" | "save" | "like" | "comment" | "review_assign";
  entityId?: string | null;
  isTombstone?: boolean;
}

export interface SearchReplayTurn {
  id: string;
  sessionId: string;
  query: string;
  createdAt: string;
  relevanceById: Record<string, number>;
  rankingsByContextUse: Record<SearchContextAblationMode, string[]>;
}

export interface SearchSessionAggregateMetrics {
  turnMrr: number;
  turnNdcgAt5: number;
  sessionSuccessRate: number;
  sessionCount: number;
  turnCount: number;
}

export interface SearchContextAblationReport {
  turns: Record<SearchContextAblationMode, SearchMetricSummary>;
  sessions: Record<SearchContextAblationMode, SearchSessionAggregateMetrics>;
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundSummary(summary: SearchMetricSummary): SearchMetricSummary {
  return {
    recallAt5: roundMetric(summary.recallAt5),
    precisionAt5: roundMetric(summary.precisionAt5),
    mrr: roundMetric(summary.mrr),
    ndcgAt5: roundMetric(summary.ndcgAt5),
  };
}

export function recallAtK(
  relevantIds: string[],
  rankedIds: string[],
  k: number,
) {
  if (relevantIds.length === 0) {
    return 0;
  }

  const retrieved = new Set(rankedIds.slice(0, k));
  const hits = relevantIds.filter((id) => retrieved.has(id)).length;
  return hits / relevantIds.length;
}

export function precisionAtK(
  relevantIds: string[],
  rankedIds: string[],
  k: number,
) {
  if (k <= 0) {
    return 0;
  }

  const relevantSet = new Set(relevantIds);
  const hits = rankedIds.slice(0, k).filter((id) => relevantSet.has(id)).length;
  return hits / k;
}

export function reciprocalRank(
  relevantIds: string[],
  rankedIds: string[],
) {
  const relevantSet = new Set(relevantIds);
  const firstRelevantIndex = rankedIds.findIndex((id) => relevantSet.has(id));
  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}

export function ndcgAtK(
  relevanceById: Record<string, number>,
  rankedIds: string[],
  k: number,
) {
  const dcg = rankedIds.slice(0, k).reduce((sum, id, index) => {
    const relevance = relevanceById[id] || 0;
    if (relevance === 0) {
      return sum;
    }

    return sum + ((2 ** relevance) - 1) / Math.log2(index + 2);
  }, 0);

  const idealRanking = Object.entries(relevanceById)
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);

  const idealDcg = idealRanking.slice(0, k).reduce((sum, id, index) => {
    const relevance = relevanceById[id] || 0;
    return sum + ((2 ** relevance) - 1) / Math.log2(index + 2);
  }, 0);

  if (idealDcg === 0) {
    return 0;
  }

  return dcg / idealDcg;
}

export function evaluateBenchmarkStrategy(
  cases: SearchBenchmarkCase[],
  strategy: SearchEvaluationStrategy,
): SearchMetricSummary {
  const summaries = cases.map((benchmarkCase) => {
    const relevantIds = Object.entries(benchmarkCase.relevanceById)
      .filter(([, relevance]) => relevance > 0)
      .map(([id]) => id);
    const ranking = benchmarkCase.rankings[strategy];

    return {
      recallAt5: recallAtK(relevantIds, ranking, 5),
      precisionAt5: precisionAtK(relevantIds, ranking, 5),
      reciprocalRank: reciprocalRank(relevantIds, ranking),
      ndcgAt5: ndcgAtK(benchmarkCase.relevanceById, ranking, 5),
    };
  });

  const count = Math.max(summaries.length, 1);

  return roundSummary({
    recallAt5: summaries.reduce((sum, item) => sum + item.recallAt5, 0) / count,
    precisionAt5: summaries.reduce((sum, item) => sum + item.precisionAt5, 0) / count,
    mrr: summaries.reduce((sum, item) => sum + item.reciprocalRank, 0) / count,
    ndcgAt5: summaries.reduce((sum, item) => sum + item.ndcgAt5, 0) / count,
  });
}

export function evaluateBenchmarkStrategies(
  cases: SearchBenchmarkCase[],
  strategies: SearchEvaluationStrategy[] = ["fallback", "lexical", "semantic", "hybrid", "reranked"],
) {
  return strategies.reduce<Record<SearchEvaluationStrategy, SearchMetricSummary>>((accumulator, strategy) => {
    accumulator[strategy] = evaluateBenchmarkStrategy(cases, strategy);
    return accumulator;
  }, {
    fallback: { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 },
    lexical: { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 },
    semantic: { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 },
    hybrid: { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 },
    reranked: { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 },
  });
}

export function compareBenchmarkStrategies(
  cases: SearchBenchmarkCase[],
  baseline: SearchEvaluationStrategy,
  candidate: SearchEvaluationStrategy,
): SearchStrategyComparison {
  const baselineMetrics = evaluateBenchmarkStrategy(cases, baseline);
  const candidateMetrics = evaluateBenchmarkStrategy(cases, candidate);

  return {
    baseline,
    candidate,
    baselineMetrics,
    candidateMetrics,
    delta: roundSummary({
      recallAt5: candidateMetrics.recallAt5 - baselineMetrics.recallAt5,
      precisionAt5: candidateMetrics.precisionAt5 - baselineMetrics.precisionAt5,
      mrr: candidateMetrics.mrr - baselineMetrics.mrr,
      ndcgAt5: candidateMetrics.ndcgAt5 - baselineMetrics.ndcgAt5,
    }),
  };
}

export function buildOfflineEvaluationReport(
  cases: SearchBenchmarkCase[],
  comparisons: Array<[SearchEvaluationStrategy, SearchEvaluationStrategy]> = [
    ["fallback", "hybrid"],
    ["lexical", "semantic"],
    ["semantic", "hybrid"],
    ["hybrid", "reranked"],
  ],
): SearchOfflineEvaluationReport {
  return {
    strategies: evaluateBenchmarkStrategies(cases),
    comparisons: comparisons.map(([baseline, candidate]) =>
      compareBenchmarkStrategies(cases, baseline, candidate)),
  };
}

function buildRelevanceByEntity(events: SearchReplaySessionEvent[]) {
  const relevanceById: Record<string, number> = {};
  const weightByType: Record<SearchReplaySessionEvent["eventType"], number> = {
    search: 0,
    view: 1,
    click: 3,
    save: 3,
    like: 2,
    comment: 2,
    review_assign: 1,
  };

  events.forEach((event) => {
    if (!event.entityId || event.isTombstone) {
      return;
    }

    const relevance = weightByType[event.eventType] || 0;

    if (relevance <= 0) {
      return;
    }

    relevanceById[event.entityId] = Math.max(relevanceById[event.entityId] || 0, relevance);
  });

  return relevanceById;
}

export function buildReplayTurnsFromLogs(
  logs: SearchReplayLogRow[],
  sessionEvents: SearchReplaySessionEvent[],
): SearchReplayTurn[] {
  const logsBySession = logs.reduce<Record<string, SearchReplayLogRow[]>>((accumulator, log) => {
    if (!accumulator[log.sessionId]) {
      accumulator[log.sessionId] = [];
    }

    accumulator[log.sessionId].push(log);
    return accumulator;
  }, {});
  const eventsBySession = sessionEvents.reduce<Record<string, SearchReplaySessionEvent[]>>((accumulator, event) => {
    if (!accumulator[event.sessionId]) {
      accumulator[event.sessionId] = [];
    }

    accumulator[event.sessionId].push(event);
    return accumulator;
  }, {});

  return Object.values(logsBySession)
    .flatMap((sessionLogs) => {
      const orderedLogs = [...sessionLogs].sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      const orderedEvents = [...(eventsBySession[sessionLogs[0]?.sessionId] || [])].sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

      return orderedLogs.map((log, index) => {
        const turnStartedAt = new Date(log.createdAt).getTime();
        const nextTurnStartedAt = index < orderedLogs.length - 1
          ? new Date(orderedLogs[index + 1].createdAt).getTime()
          : Number.POSITIVE_INFINITY;
        const turnEvents = orderedEvents.filter((event) => {
          const eventTime = new Date(event.createdAt).getTime();
          return eventTime >= turnStartedAt && eventTime < nextTurnStartedAt;
        });

        return {
          id: log.id,
          sessionId: log.sessionId,
          query: log.query,
          createdAt: log.createdAt,
          relevanceById: buildRelevanceByEntity(turnEvents),
          rankingsByContextUse: log.rankingsByContextUse,
        } satisfies SearchReplayTurn;
      });
    })
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function evaluateReplayTurns(
  turns: SearchReplayTurn[],
  contextUse: SearchContextAblationMode,
): SearchMetricSummary {
  const cases: SearchBenchmarkCase[] = turns.map((turn) => ({
    id: turn.id,
    query: turn.query,
    relevanceById: turn.relevanceById,
    rankings: {
      fallback: turn.rankingsByContextUse.none,
      lexical: turn.rankingsByContextUse.none,
      semantic: turn.rankingsByContextUse.light,
      hybrid: turn.rankingsByContextUse.full,
      reranked: turn.rankingsByContextUse.full,
    },
  }));

  const strategyByContextUse: Record<SearchContextAblationMode, SearchEvaluationStrategy> = {
    none: "lexical",
    light: "semantic",
    full: "hybrid",
  };

  return evaluateBenchmarkStrategy(cases, strategyByContextUse[contextUse]);
}

export function aggregateReplaySessions(
  turns: SearchReplayTurn[],
  contextUse: SearchContextAblationMode,
): SearchSessionAggregateMetrics {
  const sessions = turns.reduce<Record<string, SearchReplayTurn[]>>((accumulator, turn) => {
    if (!accumulator[turn.sessionId]) {
      accumulator[turn.sessionId] = [];
    }

    accumulator[turn.sessionId].push(turn);
    return accumulator;
  }, {});
  const sessionSummaries = Object.values(sessions).map((sessionTurns) => {
    const turnMetrics = sessionTurns.map((turn) => {
      const relevantIds = Object.entries(turn.relevanceById)
        .filter(([, relevance]) => relevance > 0)
        .map(([id]) => id);
      const ranking = turn.rankingsByContextUse[contextUse];

      return {
        mrr: reciprocalRank(relevantIds, ranking),
        ndcgAt5: ndcgAtK(turn.relevanceById, ranking, 5),
      };
    });

    const count = Math.max(turnMetrics.length, 1);

    return {
      turnMrr: turnMetrics.reduce((sum, metric) => sum + metric.mrr, 0) / count,
      turnNdcgAt5: turnMetrics.reduce((sum, metric) => sum + metric.ndcgAt5, 0) / count,
      successful: turnMetrics.some((metric) => metric.mrr > 0),
      turnCount: turnMetrics.length,
    };
  });
  const sessionCount = Math.max(sessionSummaries.length, 1);
  const turnCount = sessionSummaries.reduce((sum, session) => sum + session.turnCount, 0);

  return {
    turnMrr: roundMetric(sessionSummaries.reduce((sum, session) => sum + session.turnMrr, 0) / sessionCount),
    turnNdcgAt5: roundMetric(sessionSummaries.reduce((sum, session) => sum + session.turnNdcgAt5, 0) / sessionCount),
    sessionSuccessRate: roundMetric(
      sessionSummaries.filter((session) => session.successful).length / sessionCount,
    ),
    sessionCount: sessionSummaries.length,
    turnCount,
  };
}

export function buildContextAblationReport(turns: SearchReplayTurn[]): SearchContextAblationReport {
  return {
    turns: {
      none: evaluateReplayTurns(turns, "none"),
      light: evaluateReplayTurns(turns, "light"),
      full: evaluateReplayTurns(turns, "full"),
    },
    sessions: {
      none: aggregateReplaySessions(turns, "none"),
      light: aggregateReplaySessions(turns, "light"),
      full: aggregateReplaySessions(turns, "full"),
    },
  };
}

export const searchBenchmarkCases: SearchBenchmarkCase[] = [
  {
    id: "semantic-alias-sso",
    query: "single sign on",
    relevanceById: {
      "def-sso-federation": 3,
      "def-identity-provider": 2,
    },
    rankings: {
      fallback: [
        "def-auth-token",
        "onto-access-management",
        "def-identity-provider",
        "def-sso-federation",
        "def-session-cookie",
      ],
      lexical: [
        "def-auth-token",
        "def-identity-provider",
        "def-sso-federation",
        "onto-access-management",
        "def-session-cookie",
      ],
      semantic: [
        "def-sso-federation",
        "def-identity-provider",
        "onto-access-management",
        "def-auth-token",
        "def-session-cookie",
      ],
      hybrid: [
        "def-sso-federation",
        "def-identity-provider",
        "onto-access-management",
        "def-auth-token",
        "def-session-cookie",
      ],
      reranked: [
        "def-sso-federation",
        "def-identity-provider",
        "onto-access-management",
        "def-session-cookie",
        "def-auth-token",
      ],
    },
  },
  {
    id: "semantic-alias-customer-record",
    query: "customer master record",
    relevanceById: {
      "def-customer-record": 3,
      "onto-crm-model": 1,
    },
    rankings: {
      fallback: [
        "def-master-data",
        "def-client-account",
        "onto-crm-model",
        "def-customer-record",
        "def-billing-profile",
      ],
      lexical: [
        "def-master-data",
        "onto-crm-model",
        "def-customer-record",
        "def-client-account",
        "def-billing-profile",
      ],
      semantic: [
        "def-customer-record",
        "def-master-data",
        "onto-crm-model",
        "def-client-account",
        "def-billing-profile",
      ],
      hybrid: [
        "def-customer-record",
        "onto-crm-model",
        "def-master-data",
        "def-client-account",
        "def-billing-profile",
      ],
      reranked: [
        "def-customer-record",
        "onto-crm-model",
        "def-client-account",
        "def-master-data",
        "def-billing-profile",
      ],
    },
  },
  {
    id: "broad-governance-query",
    query: "governance model",
    relevanceById: {
      "onto-governance-model": 3,
      "def-approval-workflow": 2,
      "def-data-steward": 1,
    },
    rankings: {
      fallback: [
        "def-policy-owner",
        "def-approval-workflow",
        "def-data-steward",
        "onto-governance-model",
        "onto-operations",
      ],
      lexical: [
        "def-approval-workflow",
        "def-data-steward",
        "onto-governance-model",
        "def-policy-owner",
        "onto-operations",
      ],
      semantic: [
        "onto-governance-model",
        "def-data-steward",
        "def-approval-workflow",
        "onto-operations",
        "def-policy-owner",
      ],
      hybrid: [
        "onto-governance-model",
        "def-approval-workflow",
        "def-data-steward",
        "def-policy-owner",
        "onto-operations",
      ],
      reranked: [
        "onto-governance-model",
        "def-approval-workflow",
        "def-data-steward",
        "onto-operations",
        "def-policy-owner",
      ],
    },
  },
  {
    id: "relation-taxonomy-query",
    query: "taxonomy relationship",
    relevanceById: {
      "def-is-a": 3,
      "def-part-of": 2,
    },
    rankings: {
      fallback: [
        "onto-taxonomy-graph",
        "def-related-to",
        "def-part-of",
        "def-is-a",
        "def-synonym-of",
      ],
      lexical: [
        "onto-taxonomy-graph",
        "def-part-of",
        "def-is-a",
        "def-related-to",
        "def-synonym-of",
      ],
      semantic: [
        "def-is-a",
        "def-part-of",
        "def-related-to",
        "onto-taxonomy-graph",
        "def-synonym-of",
      ],
      hybrid: [
        "def-is-a",
        "def-part-of",
        "onto-taxonomy-graph",
        "def-related-to",
        "def-synonym-of",
      ],
      reranked: [
        "def-is-a",
        "def-part-of",
        "onto-taxonomy-graph",
        "def-synonym-of",
        "def-related-to",
      ],
    },
  },
  {
    id: "cross-lingual-worker-query",
    query: "worker",
    relevanceById: {
      "def-medewerker": 3,
      "def-werknemer": 2,
      "def-employee": 1,
    },
    rankings: {
      fallback: [
        "def-labor-policy",
        "def-manager",
        "def-employee",
        "def-medewerker",
        "def-werknemer",
      ],
      lexical: [
        "def-employee",
        "def-labor-policy",
        "def-medewerker",
        "def-manager",
        "def-werknemer",
      ],
      semantic: [
        "def-medewerker",
        "def-werknemer",
        "def-employee",
        "def-labor-policy",
        "def-manager",
      ],
      hybrid: [
        "def-medewerker",
        "def-werknemer",
        "def-employee",
        "def-manager",
        "def-labor-policy",
      ],
      reranked: [
        "def-medewerker",
        "def-werknemer",
        "def-employee",
        "def-labor-policy",
        "def-manager",
      ],
    },
  },
];
