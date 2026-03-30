import { describe, expect, it, vi } from "vitest";

import { searchEntities, searchEntitiesWithMeta, type SearchFilters } from "@/lib/search-service";
import type { SearchContext } from "@/lib/search/context/types";

const defaultFilters: SearchFilters = {
  ontologyId: "all",
  tag: "all",
  status: "all",
  type: "all",
  ownership: "all",
};

function createClientMock() {
  const rpc = vi.fn();
  const functionsInvoke = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "definitions") {
      const definitionRows = [
        {
          id: "def-1",
          title: "API Gateway",
          description: "Gateway definition",
          content: "",
          ontology_id: "onto-1",
          priority: "normal",
          status: "approved",
          tags: ["integration"],
          updated_at: "2026-03-19T09:00:00.000Z",
          view_count: 3,
          created_by: "user-1",
          ontologies: { id: "onto-1", title: "Platform Ontology" },
        },
      ];

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            const result = Promise.resolve({
              data: definitionRows,
              error: null,
            }) as Promise<unknown> & {
              or: ReturnType<typeof vi.fn>;
            };

            result.or = vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }));

            return result;
          }),
          in: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
        })),
      };
    }

    if (table === "relationships") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
        })),
      };
    }

    if (table === "ontologies") {
      return {
        select: vi.fn(() => Promise.resolve({
          data: [
            {
              id: "onto-1",
              title: "Gateway Models",
              description: "Ontology",
              status: "approved",
              tags: ["integration"],
              updated_at: "2026-03-19T08:00:00.000Z",
              view_count: 50,
              created_by: "user-2",
            },
          ],
          error: null,
        })),
      };
    }

    throw new Error(`Unexpected table lookup: ${table}`);
  });

  return {
    rpc,
    from,
    functions: {
      invoke: functionsInvoke,
    },
  } as any;
}

function createSearchContext(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    scope: {
      routePath: "/search",
      page: "search",
      ontologyId: "onto-1",
      ontologyLabel: "Access Management",
      entityType: "definition",
      status: null,
      tag: "identity",
      ownership: null,
      ...(overrides.scope || {}),
    },
    session: {
      sessionId: "11111111-1111-4111-8111-111111111111",
      activeQuery: "single sign on",
      recentQueries: ["single sign on", "identity provider"],
      recentEntities: [
        {
          id: "def-9",
          type: "definition",
          ontologyId: "onto-1",
          title: "Identity Provider",
        },
      ],
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
      },
      ...(overrides.user || {}),
    },
    retrievalPlan: {
      contextUse: "full",
      reason: "scope_and_session_signals_available",
      needsRewrite: true,
      rewriteMode: "heuristic",
      denseRetrievalGate: "on",
      ambiguityFlags: [],
      ...(overrides.retrievalPlan || {}),
    },
    contextHash: overrides.contextHash || "ctx-rpc-test",
    debug: {
      sourceCounts: {
        recentQueryCount: 2,
        recentEntityCount: 1,
      },
      hasScopeContext: true,
      hasUserPreferences: false,
      ...(overrides.debug || {}),
    },
  };
}

describe("search-service rpc integration", () => {
  it("maps hybrid backend rows into UI search items", async () => {
    const client = createClientMock();
    const rpcCalls: Array<{ functionName: string; args: unknown }> = [];

    client.functions.invoke.mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
      },
      error: null,
    });

    client.rpc.mockImplementation((functionName: string, args?: unknown) => {
      rpcCalls.push({ functionName, args });

      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: [
            {
              entity_id: "def-1",
              entity_type: "definition",
              title: "Single Sign-On",
              description: "Centralized access flow",
              status: "approved",
              updated_at: "2026-03-19T10:00:00.000Z",
              view_count: 18,
              tags: ["identity"],
              ontology_id: "onto-1",
              ontology_title: "Access Management",
              priority: "high",
              lexical_score: 0.44,
              dense_score: 0.81,
              fusion_score: 0.03,
              rerank_score: 0.87,
              context_boost_score: 0,
              applied_filters: [],
              applied_boosts: [],
              match_text: "Allows users to log in through a shared identity provider.",
              exact_title_match: false,
              title_match: true,
              token_coverage: 0.5,
              retrieval_confidence: "strong",
            },
          ],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-1",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const results = await searchEntities(client, "single sign on", defaultFilters, "relevance", "user-1");

    expect(results[0]).toMatchObject({
      id: "def-1",
      type: "definition",
      confidence: "strong",
      retrievalStrategy: "hybrid",
    });
    expect(results[0].matchReasons).toContain("Matched title phrase");
    expect(results[0].matchReasons).toContain("Strong semantic match");

    const logCall = rpcCalls.find((call) => call.functionName === "log_search_query");
    expect(logCall).toBeTruthy();
    const hybridCall = rpcCalls.find((call) => call.functionName === "search_entities_hybrid");
    expect(hybridCall?.args).toMatchObject({
      _context_json: {},
      _session_id: null,
    });
    expect(logCall?.args).toMatchObject({
      _strategy: "hybrid",
      _fallback_used: false,
      _weak_evidence: false,
    });
    expect(logCall?.args).toMatchObject({
      _analysis: {
        observability: {
          queryType: "exploratory",
          retrievalConfidence: "strong",
          fallbackUsed: false,
        },
      },
    });
  });

  it("falls back to the legacy client-side search path when the backend rpc is unavailable", async () => {
    const client = createClientMock();
    const rpcCalls: Array<{ functionName: string; args: unknown }> = [];

    client.functions.invoke.mockRejectedValue(new Error("Embedding function unavailable"));

    client.rpc.mockImplementation((functionName: string, args?: unknown) => {
      rpcCalls.push({ functionName, args });

      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: null,
          error: {
            message: 'Could not find the function public.search_entities_hybrid in the schema cache',
          },
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-2",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const results = await searchEntities(client, "api gateway", defaultFilters, "relevance", "user-1");

    expect(results[0]).toMatchObject({
      id: "def-1",
      retrievalStrategy: "legacy",
    });
    expect(results[0].confidence).toBe("strong");
    expect(results[0].matchReasons).toContain("Exact title match");

    const logCall = rpcCalls.find((call) => call.functionName === "log_search_query");
    expect(logCall?.args).toMatchObject({
      _strategy: "legacy",
      _fallback_used: true,
    });
    expect(logCall?.args).toMatchObject({
      _analysis: {
        observability: {
          failure: {
            category: "fallback",
          },
        },
      },
    });
  });

  it("keeps legacy exact-title matching stable across query capitalization", async () => {
    const client = createClientMock();

    client.functions.invoke.mockRejectedValue(new Error("Embedding function unavailable"));

    client.rpc.mockImplementation((functionName: string) => {
      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: null,
          error: {
            message: 'Could not find the function public.search_entities_hybrid in the schema cache',
          },
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-case-fallback",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const lower = await searchEntities(client, "api gateway", defaultFilters, "relevance", "user-1");
    const upper = await searchEntities(client, "API GATEWAY", defaultFilters, "relevance", "user-1");

    expect(lower[0].id).toBe("def-1");
    expect(upper[0].id).toBe("def-1");
    expect(lower[0].matchReasons).toContain("Exact title match");
    expect(upper[0].matchReasons).toContain("Exact title match");
    expect(lower[0].confidence).toBe(upper[0].confidence);
  });

  it("reuses cached gateway results for repeated identical searches", async () => {
    const client = createClientMock();

    client.functions.invoke.mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
      },
      error: null,
    });

    client.rpc.mockImplementation((functionName: string) => {
      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: [
            {
              entity_id: "def-cache",
              entity_type: "definition",
              title: "Gateway Cache",
              description: "Cached response",
              status: "approved",
              updated_at: "2026-03-19T10:00:00.000Z",
              view_count: 18,
              tags: ["integration"],
              ontology_id: "onto-1",
              ontology_title: "Access Management",
              priority: "high",
              lexical_score: 0.8,
              dense_score: 0.1,
              fusion_score: 0.05,
              rerank_score: 0.82,
              context_boost_score: 0,
              applied_filters: [],
              applied_boosts: [],
              match_text: "Cached result",
              exact_title_match: true,
              title_match: true,
              token_coverage: 1,
              retrieval_confidence: "strong",
            },
          ],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-cache",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    await searchEntities(client, "gateway cache test", defaultFilters, "relevance", "user-1");
    await searchEntities(client, "gateway cache test", defaultFilters, "relevance", "user-1");

    expect(client.rpc).toHaveBeenCalledWith(
      "search_entities_hybrid",
      expect.any(Object),
    );
    expect(client.rpc.mock.calls.filter(([functionName]) => functionName === "search_entities_hybrid")).toHaveLength(1);
  });

  it("passes serialized context into the hybrid rpc and maps context explanations", async () => {
    const client = createClientMock();
    const rpcCalls: Array<{ functionName: string; args: unknown }> = [];
    const context = createSearchContext();

    client.functions.invoke.mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
      },
      error: null,
    });

    client.rpc.mockImplementation((functionName: string, args?: unknown) => {
      rpcCalls.push({ functionName, args });

      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: [
            {
              entity_id: "def-2",
              entity_type: "definition",
              title: "Identity Provider Setup",
              description: "Setup guide",
              status: "approved",
              updated_at: "2026-03-19T10:00:00.000Z",
              view_count: 9,
              tags: ["identity"],
              ontology_id: "onto-1",
              ontology_title: "Access Management",
              priority: "normal",
              lexical_score: 0.35,
              dense_score: 0.72,
              fusion_score: 0.04,
              rerank_score: 0.79,
              context_boost_score: 0.09,
              applied_filters: ["context:ontology_scope", "context:tag_scope"],
              applied_boosts: ["context:recent_session_activity", "context:ontology_scope"],
              match_text: "Identity provider setup inside the current ontology scope.",
              exact_title_match: false,
              title_match: true,
              token_coverage: 0.66,
              retrieval_confidence: "strong",
            },
          ],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-context",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const response = await searchEntitiesWithMeta(
      client,
      "single sign on",
      defaultFilters,
      "relevance",
      "user-1",
      { context },
    );

    const hybridCall = rpcCalls.find((call) => call.functionName === "search_entities_hybrid");

    expect(hybridCall?.args).toMatchObject({
      _context_json: {
        scope: {
          ontologyId: "onto-1",
          entityType: "definition",
          tag: "identity",
        },
        retrievalPlan: {
          contextUse: "full",
        },
      },
      _session_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(response.results[0].matchReasons).toContain("Boosted by recent activity");
    expect(response.results[0].scoreBreakdown?.context).toBe(0.09);
    expect(response.results[0].explanation).toMatchObject({
      appliedFilters: ["context:ontology_scope", "context:tag_scope"],
      appliedBoosts: ["context:recent_session_activity", "context:ontology_scope"],
      contextUse: "light",
    });
    expect(response.diagnostics.sourceContributions.contextBoostedResultCount).toBe(1);
    expect(response.diagnostics.sourceContributions.contextTopScore).toBe(0.09);
  });

  it("passes similarity-aware query variants into the hybrid rpc and maps synonym explanations", async () => {
    const client = createClientMock();
    const rpcCalls: Array<{ functionName: string; args: any }> = [];

    client.functions.invoke.mockImplementation(async (functionName: string) => {
      if (functionName === "search-query-embed") {
        return {
          data: {
            embedding: "[0.1,0.2,0.3]",
            model: "test-model",
          },
          error: null,
        };
      }

      if (functionName === "search-query-expand") {
        return {
          data: {
            expansions: ["Employee", "Werknemer"],
            providerConfigured: true,
            provider: "deepseek",
            model: "deepseek-chat",
          },
          error: null,
        };
      }

      throw new Error(`Unexpected function call: ${functionName}`);
    });

    client.from.mockImplementation((table: string) => {
      if (table === "definitions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: "def-worker", title: "Worker" }],
                  error: null,
                }),
              })),
            })),
            in: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: "def-worker", title: "Worker" },
                  { id: "def-employee", title: "Employee" },
                ],
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "relationships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [{
                    source_id: "def-worker",
                    target_id: "def-employee",
                    type: "synonym_of",
                  }],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    client.rpc.mockImplementation((functionName: string, args?: unknown) => {
      rpcCalls.push({ functionName, args: args as any });

      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: [{
            entity_id: "def-employee",
            entity_type: "definition",
            title: "Employee",
            description: "Employee concept",
            status: "approved",
            updated_at: "2026-03-19T10:00:00.000Z",
            view_count: 8,
            tags: ["hr"],
            ontology_id: "onto-hr",
            ontology_title: "HR",
            priority: "normal",
            lexical_score: 0.32,
            dense_score: 0.74,
            fusion_score: 0.04,
            rerank_score: 0.79,
            context_boost_score: 0,
            applied_filters: [],
            applied_boosts: ["similarity:synonym_graph"],
            match_text: "Employee definition",
            exact_title_match: false,
            title_match: false,
            token_coverage: 0.3,
            retrieval_confidence: "strong",
          }],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-similarity",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const response = await searchEntitiesWithMeta(
      client,
      "worker",
      defaultFilters,
      "relevance",
      "user-1",
      { bypassCache: true },
    );

    const hybridCall = rpcCalls.find((call) => call.functionName === "search_entities_hybrid");

    expect(hybridCall?.args._analysis.retrievalVariants.queryVariants).toEqual(
      expect.arrayContaining(["worker", "Employee", "Werknemer"]),
    );
    expect(hybridCall?.args._analysis.retrievalVariants.similaritySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "synonym_graph",
        }),
        expect.objectContaining({
          source: "llm_expansion",
        }),
      ]),
    );
    expect(response.results[0].matchReasons).toContain("Matched through a synonym");
  });

  it("caches query embeddings per query and context hash", async () => {
    const client = createClientMock();
    const query = "context cache query";
    const firstContext = createSearchContext({ contextHash: "ctx-cache-1" });
    const secondContext = createSearchContext({ contextHash: "ctx-cache-2" });

    client.functions.invoke.mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
        debug: {
          cacheHit: false,
        },
      },
      error: null,
    });

    client.rpc.mockImplementation((functionName: string) => {
      if (functionName === "search_entities_hybrid") {
        return Promise.resolve({
          data: [
            {
              entity_id: "def-embed-cache",
              entity_type: "definition",
              title: "Context Cache",
              description: "Embedding cache validation",
              status: "approved",
              updated_at: "2026-03-19T10:00:00.000Z",
              view_count: 5,
              tags: ["identity"],
              ontology_id: "onto-1",
              ontology_title: "Access Management",
              priority: "normal",
              lexical_score: 0.4,
              dense_score: 0.7,
              fusion_score: 0.03,
              rerank_score: 0.76,
              context_boost_score: 0,
              applied_filters: [],
              applied_boosts: [],
              match_text: "Embedding cache validation",
              exact_title_match: false,
              title_match: true,
              token_coverage: 0.5,
              retrieval_confidence: "strong",
            },
          ],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-embed-cache",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    await searchEntitiesWithMeta(client, query, defaultFilters, "relevance", "user-1", {
      context: firstContext,
      bypassCache: true,
    });
    await searchEntitiesWithMeta(client, query, defaultFilters, "relevance", "user-1", {
      context: firstContext,
      bypassCache: true,
    });
    await searchEntitiesWithMeta(client, query, defaultFilters, "relevance", "user-1", {
      context: secondContext,
      bypassCache: true,
    });

    expect(
      client.functions.invoke.mock.calls.filter(([functionName]) => functionName === "search-query-embed"),
    ).toHaveLength(2);
  });

  it("falls back to baseline hybrid retrieval when the context pipeline fails", async () => {
    const client = createClientMock();
    const context = createSearchContext();
    const rpcCalls: Array<{ functionName: string; args: unknown }> = [];

    client.functions.invoke.mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
      },
      error: null,
    });

    client.rpc.mockImplementation((functionName: string, args?: any) => {
      rpcCalls.push({ functionName, args });

      if (functionName === "search_entities_hybrid") {
        if (args?._context_json && Object.keys(args._context_json).length > 0) {
          return Promise.resolve({
            data: null,
            error: {
              message: "column _context_json does not satisfy query context plan",
            },
          });
        }

        return Promise.resolve({
          data: [
            {
              entity_id: "def-baseline",
              entity_type: "definition",
              title: "Baseline Result",
              description: "Recovered without context",
              status: "approved",
              updated_at: "2026-03-19T10:00:00.000Z",
              view_count: 4,
              tags: ["identity"],
              ontology_id: "onto-1",
              ontology_title: "Access Management",
              priority: "normal",
              lexical_score: 0.51,
              dense_score: 0.4,
              fusion_score: 0.04,
              rerank_score: 0.74,
              context_boost_score: 0,
              applied_filters: [],
              applied_boosts: [],
              match_text: "Recovered baseline result",
              exact_title_match: false,
              title_match: true,
              token_coverage: 0.6,
              retrieval_confidence: "strong",
            },
          ],
          error: null,
        });
      }

      if (functionName === "log_search_query") {
        return Promise.resolve({
          data: "log-context-fallback",
          error: null,
        });
      }

      throw new Error(`Unexpected rpc call: ${functionName}`);
    });

    const response = await searchEntitiesWithMeta(
      client,
      "single sign on",
      defaultFilters,
      "relevance",
      "user-1",
      { context, bypassCache: true },
    );

    expect(response.results[0].id).toBe("def-baseline");
    expect(response.diagnostics.context.pipelineFallbackUsed).toBe(true);
    expect(response.diagnostics.context.effectiveUse).toBe("none");
    expect(response.diagnostics.debug.requestedContextUse).toBe("full");
    expect(rpcCalls.filter((call) => call.functionName === "search_entities_hybrid")).toHaveLength(2);
  });
});
