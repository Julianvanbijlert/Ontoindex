import { beforeEach, describe, expect, it, vi } from "vitest";

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
      tag: "identity",
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
        {
          id: "def-2",
          type: "definition",
          ontologyId: "onto-1",
          title: "Provisioning",
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
      contextUse: "full",
      reason: "scope_and_session_signals_available",
      needsRewrite: true,
      rewriteMode: "heuristic",
      denseRetrievalGate: "on",
      ambiguityFlags: [],
    },
    contextHash: "ctx-rollout",
    debug: {
      sourceCounts: {
        recentQueryCount: 2,
        recentEntityCount: 2,
      },
      hasScopeContext: true,
      hasUserPreferences: false,
    },
  };
}

describe("search-context-rollout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/search-config");
  });

  it("disables context when rollout mode is off", async () => {
    vi.doMock("@/lib/search-config", () => ({
      searchRuntimeConfig: {
        contextRolloutMode: "off",
      },
    }));

    const { resolveSearchContextRollout } = await import("@/lib/search-context-rollout");
    const resolution = resolveSearchContextRollout(createContext());

    expect(resolution.context).toBeNull();
    expect(resolution.requestedContextUse).toBe("full");
    expect(resolution.effectiveContextUse).toBe("none");
  });

  it("downgrades full context to light mode during a staged rollout", async () => {
    vi.doMock("@/lib/search-config", () => ({
      searchRuntimeConfig: {
        contextRolloutMode: "light",
      },
    }));

    const { resolveSearchContextRollout } = await import("@/lib/search-context-rollout");
    const resolution = resolveSearchContextRollout(createContext());

    expect(resolution.context?.retrievalPlan.contextUse).toBe("light");
    expect(resolution.context?.session.recentQueries).toHaveLength(1);
    expect(resolution.context?.session.recentEntities).toHaveLength(1);
  });

  it("keeps full context intact when rollout mode is full", async () => {
    vi.doMock("@/lib/search-config", () => ({
      searchRuntimeConfig: {
        contextRolloutMode: "full",
      },
    }));

    const { resolveSearchContextRollout } = await import("@/lib/search-context-rollout");
    const context = createContext();
    const resolution = resolveSearchContextRollout(context);

    expect(resolution.context).toEqual(context);
    expect(resolution.effectiveContextUse).toBe("full");
  });
});
