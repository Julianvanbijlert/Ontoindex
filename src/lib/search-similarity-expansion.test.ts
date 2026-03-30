import { describe, expect, it } from "vitest";

import {
  buildSearchQueryVariants,
  resolveSearchSimilarityExpansion,
} from "@/lib/search-similarity-expansion";
import type { SearchFilters } from "@/lib/search-types";

const defaultFilters: SearchFilters = {
  ontologyId: "all",
  tag: "all",
  status: "all",
  type: "all",
  ownership: "all",
};

function createSimilarityClient() {
  return {
    functions: {
      invoke: async () => ({
        data: {
          expansions: ["Employee", "Werknemer"],
          providerConfigured: true,
        },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "definitions") {
        return {
          select() {
            return {
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

describe("search-similarity-expansion", () => {
  it("builds query variants from rewrites, subsets, and synonym signals", () => {
    const variants = buildSearchQueryVariants("worker approval flow policy", {
      rewriteCandidates: [
        { query: "worker approval flow policy", normalizedQuery: "worker approval flow policy", strategy: "identity", confidence: 1 },
        { query: "worker approval flow", normalizedQuery: "worker approval flow", strategy: "separator_normalization", confidence: 0.7 },
      ],
    } as any, [{
      source: "synonym_graph",
      originalTerm: "worker",
      expandedTerms: ["Employee"],
    }]);

    expect(variants).toContain("worker approval flow policy");
    expect(variants).toContain("worker approval flow");
    expect(variants).toContain("Employee");
  });

  it("resolves synonym graph expansion case-insensitively for general search", async () => {
    const result = await resolveSearchSimilarityExpansion(createSimilarityClient(), {
      query: "WORKER",
      analysis: {
        exactMatchSensitive: false,
        tokenCount: 1,
        debug: {
          tokens: ["worker"],
        },
      } as any,
      filters: defaultFilters,
    });

    expect(result.signals.some((signal) => signal.source === "synonym_graph")).toBe(true);
    expect(result.signals.flatMap((signal) => signal.expandedTerms)).toContain("Employee");
  });

  it("adds llm expansion signals for eligible semantic queries", async () => {
    const result = await resolveSearchSimilarityExpansion(createSimilarityClient(), {
      query: "worker approval workflow",
      analysis: {
        exactMatchSensitive: false,
        tokenCount: 3,
        debug: {
          tokens: ["worker", "approval", "workflow"],
          future: {
            llmRewriteEligible: true,
          },
        },
      } as any,
      filters: defaultFilters,
    });

    expect(result.signals.some((signal) => signal.source === "llm_expansion")).toBe(true);
    expect(result.signals.flatMap((signal) => signal.expandedTerms)).toEqual(
      expect.arrayContaining(["Employee", "Werknemer"]),
    );
  });
});
