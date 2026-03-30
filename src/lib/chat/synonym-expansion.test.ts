import { describe, expect, it } from "vitest";

import { resolveChatSynonymExpansion } from "@/lib/chat/synonym-expansion";

function createSynonymClient() {
  return {
    from(table: string) {
      if (table === "definitions") {
        return {
          select() {
            return {
              in() {
                return {
                  eq: async () => ({
                    data: [
                      { id: "definition-worker", title: "Worker" },
                      { id: "definition-employee", title: "Employee" },
                    ],
                    error: null,
                  }),
                };
              },
              eq() {
                return {
                  or() {
                    return {
                      limit: async () => ({
                        data: [{ id: "definition-worker", title: "Worker" }],
                        error: null,
                      }),
                    };
                  },
                  in() {
                    return {
                      eq: async () => ({
                        data: [
                          { id: "definition-worker", title: "Worker" },
                          { id: "definition-employee", title: "Employee" },
                        ],
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      return {
        select() {
          return {
            eq() {
              return {
                or() {
                  return {
                    limit: async () => ({
                      data: [
                        {
                          source_id: "definition-worker",
                          target_id: "definition-employee",
                          type: "synonym_of",
                        },
                      ],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

describe("resolveChatSynonymExpansion", () => {
  it("adds synonym graph expansions for non-exact short queries", async () => {
    const result = await resolveChatSynonymExpansion(createSynonymClient(), {
      query: "worker",
      analysis: {
        originalQuery: "worker",
        normalizedQuery: "worker",
        rewrittenQueries: [],
        intent: "informational",
        ambiguityFlags: [],
        ambiguityLevel: "medium",
        exactMatchSensitive: false,
        tokenCount: 1,
        hasQuotedPhrase: false,
        looksIdentifierLike: false,
        shouldAttemptDense: true,
        retrievalPlan: {
          contextUse: "none",
          reason: "baseline",
          needsRewrite: false,
          rewriteMode: "none",
          denseRetrievalGate: "on",
          ambiguityFlags: [],
          rewriteConfidence: 0,
        },
        debug: {
          rewriteGuardrails: {
            driftDetected: false,
          },
        },
      } as any,
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    });

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].expandedTerms).toContain("Employee");
    expect(result.expandedQuery).toContain("Employee");
  });

  it("matches synonym expansion across query capitalization variants", async () => {
    const result = await resolveChatSynonymExpansion(createSynonymClient(), {
      query: "WORKER",
      analysis: {
        originalQuery: "WORKER",
        normalizedQuery: "worker",
        rewrittenQueries: [],
        intent: "informational",
        ambiguityFlags: [],
        ambiguityLevel: "medium",
        exactMatchSensitive: false,
        tokenCount: 1,
        hasQuotedPhrase: false,
        looksIdentifierLike: false,
        shouldAttemptDense: true,
        retrievalPlan: {
          contextUse: "none",
          reason: "baseline",
          needsRewrite: false,
          rewriteMode: "none",
          denseRetrievalGate: "on",
          ambiguityFlags: [],
          rewriteConfidence: 0,
        },
        debug: {
          rewriteGuardrails: {
            driftDetected: false,
          },
        },
      } as any,
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    });

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].expandedTerms).toContain("Employee");
    expect(result.expandedQuery).toContain("Employee");
  });
});
