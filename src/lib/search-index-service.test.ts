import { describe, expect, it, vi } from "vitest";

import { fetchSearchQueryEmbedding } from "@/lib/search-index-service";
import {
  buildInlineSearchContextSummary,
  buildSearchQueryEmbeddingCacheKey,
} from "@/lib/search-query-embedding";
import type { SearchContext } from "@/lib/search/context/types";

function createContext(): SearchContext {
  return {
    scope: {
      routePath: "/search",
      page: "search",
      ontologyId: "onto-1",
      ontologyLabel: "Access Management",
      entityType: "definition",
      status: null,
      tag: null,
      ownership: null,
    },
    session: {
      sessionId: "11111111-1111-4111-8111-111111111111",
      activeQuery: "single sign on",
      recentQueries: ["single sign on", "identity provider"],
      recentEntities: [
        {
          id: "def-1",
          type: "definition",
          ontologyId: "onto-1",
          title: "Identity Provider",
        },
      ],
    },
    user: {
      userId: "user-1",
      role: "editor",
      language: "en",
      preferences: {
        contextualSearchOptIn: true,
      },
    },
    retrievalPlan: {
      contextUse: "light",
      reason: "session_context_available",
      needsRewrite: false,
      rewriteMode: "none",
      denseRetrievalGate: "on",
      ambiguityFlags: [],
    },
    contextHash: "ctx-123",
    debug: {
      sourceCounts: {
        recentQueryCount: 2,
        recentEntityCount: 1,
      },
      hasScopeContext: true,
      hasUserPreferences: false,
    },
  };
}

describe("search-index-service", () => {
  it("builds deterministic embedding cache keys from query and context hash", () => {
    expect(buildSearchQueryEmbeddingCacheKey("Single Sign On", "ctx-1", "concat"))
      .toBe(buildSearchQueryEmbeddingCacheKey("single   sign on", "ctx-1", "concat"));
    expect(buildSearchQueryEmbeddingCacheKey("single sign on", "ctx-1", "concat"))
      .not.toBe(buildSearchQueryEmbeddingCacheKey("single sign on", "ctx-2", "concat"));
  });

  it("builds an inline context summary from recent queries and entities", () => {
    expect(buildInlineSearchContextSummary(createContext())).toBe(
      "recent queries: single sign on | identity provider. recent entities: Identity Provider",
    );
  });

  it("passes query context metadata to the embedding edge function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        embedding: "[0.1,0.2,0.3]",
        model: "test-model",
        debug: {
          cacheHit: false,
          cacheKey: "sqe_test",
          effectiveMode: "concat",
        },
      },
      error: null,
    });
    const client = {
      functions: {
        invoke,
      },
    } as any;
    const context = createContext();

    const response = await fetchSearchQueryEmbedding(client, "single sign on", {
      context,
      mode: "concat",
    });

    expect(invoke).toHaveBeenCalledWith("search-query-embed", {
      body: {
        query: "single sign on",
        contextHash: "ctx-123",
        contextSummary: "recent queries: single sign on | identity provider. recent entities: Identity Provider",
        sessionId: "11111111-1111-4111-8111-111111111111",
        mode: "concat",
      },
    });
    expect(response.debug).toMatchObject({
      cacheHit: false,
      effectiveMode: "concat",
    });
  });
});
