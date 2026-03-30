import { describe, expect, it } from "vitest";

import {
  buildSearchFailureTaxonomy,
  buildSearchRetrievalDiagnostics,
} from "@/lib/search-diagnostics-logger";
import { analyzeSearchQuery } from "@/lib/search-query-understanding";
import type { SearchResultItem } from "@/lib/search-types";

function createResult(input: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    id: input.id || "def-1",
    type: input.type || "definition",
    title: input.title || "API Gateway",
    description: input.description || "Gateway definition",
    status: input.status || "approved",
    updatedAt: input.updatedAt || "2026-03-24T10:00:00.000Z",
    viewCount: input.viewCount || 10,
    tags: input.tags || ["integration"],
    relevance: input.relevance || 0.8,
    confidence: input.confidence || "strong",
    matchReasons: input.matchReasons || ["Exact title match"],
    retrievalStrategy: input.retrievalStrategy || "hybrid",
    scoreBreakdown: input.scoreBreakdown || {
      lexical: 0.9,
      dense: 0.1,
      fusion: 0.05,
      rerank: 0.8,
    },
  };
}

describe("search-diagnostics-logger", () => {
  it("builds structured failure taxonomy for ambiguous zero-result queries", () => {
    const analysis = analyzeSearchQuery("model");
    const failure = buildSearchFailureTaxonomy({
      analysis,
      fallbackUsed: false,
      resultCount: 0,
      retrievalConfidence: null,
    });

    expect(failure.bucket).toBe("ambiguous_zero_results");
    expect(failure.category).toBe("query_understanding");
    expect(failure.reasons).toContain("ambiguity:generic_term");
  });

  it("builds query inspection diagnostics with query type and confidence", () => {
    const analysis = analyzeSearchQuery("API_GATEWAY:v2");
    const diagnostics = buildSearchRetrievalDiagnostics(
      [createResult({ confidence: "strong" })],
      {
        analysisMs: 1,
        understandingMs: 1,
        cacheMs: 0,
        embeddingMs: 0,
        retrievalMs: 8,
        rpcMs: 7,
        rerankMs: 1,
        fallbackMs: 0,
        totalMs: 9,
      },
      false,
      analysis,
    );

    expect(diagnostics.queryType).toBe("identifier_lookup");
    expect(diagnostics.retrievalConfidence).toBe("strong");
    expect(diagnostics.debug.rewriteConfidence).toBe(0);
    expect(diagnostics.debug.rewriteMode).toBe("none");
    expect(diagnostics.debug.requestedContextUse).toBe("none");
    expect(diagnostics.context.driftDetected).toBe(false);
    expect(diagnostics.failure.category).toBe("none");
  });
});
