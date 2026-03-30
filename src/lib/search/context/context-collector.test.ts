import { describe, expect, it } from "vitest";

import { collectSearchContext } from "@/lib/search/context/context-collector";

describe("context-collector", () => {
  it("builds deterministic scope, session, and user context with a stable hash", () => {
    const input = {
      route: {
        pathname: "/search",
        page: "search",
        query: "how does gateway auth work",
        filters: {
          ontologyId: "onto-1",
          tag: "security",
          status: "approved",
          type: "definition" as const,
          ownership: "mine" as const,
        },
      },
      authenticatedUser: {
        id: "user-1",
        role: "editor",
        language: "nl-NL",
        preferences: {
          contextualSearchOptIn: true,
          viewPreference: "compact",
          sortPreference: "recent",
        },
      },
      sessionId: "session-1",
      session: {
        activeQuery: "how does gateway auth work",
        recentQueries: ["How does gateway auth work", "gateway   auth", "approval workflow"],
        recentEntities: [
          { id: "def-1", type: "definition" as const, ontologyId: "onto-1", title: "Gateway Auth" },
          { id: "def-1", type: "definition" as const, ontologyId: "onto-1", title: "Gateway Auth" },
          { id: "onto-2", type: "ontology" as const, title: "Identity Models" },
        ],
      },
    };

    const first = collectSearchContext(input);
    const second = collectSearchContext(input);

    expect(first.context.scope).toEqual({
      routePath: "/search",
      page: "search",
      ontologyId: "onto-1",
      ontologyLabel: null,
      entityType: "definition",
      status: "approved",
      tag: "security",
      ownership: "mine",
    });
    expect(first.context.session.recentQueries).toEqual([
      "how does gateway auth work",
      "gateway auth",
      "approval workflow",
    ]);
    expect(first.context.session.recentEntities).toEqual([
      { id: "def-1", type: "definition", ontologyId: "onto-1", title: "Gateway Auth" },
      { id: "onto-2", type: "ontology", ontologyId: null, title: "Identity Models" },
    ]);
    expect(first.context.user.language).toBe("nl-nl");
    expect(first.context.retrievalPlan.contextUse).toBe("full");
    expect(first.contextHash).toBe(second.contextHash);
    expect(first.context.contextHash).toBe(first.contextHash);
  });

  it("downgrades to light context use for exact-match-sensitive queries", () => {
    const collected = collectSearchContext({
      route: {
        pathname: "/search",
        page: "search",
        query: "\"API Gateway\"",
        filters: {
          ontologyId: "all",
          tag: "all",
          status: "all",
          type: "all",
          ownership: "all",
        },
      },
      authenticatedUser: {
        id: "user-1",
        role: "viewer",
        language: "en-US",
        preferences: {
          contextualSearchOptIn: true,
        },
      },
      session: {
        recentQueries: ["gateway"],
      },
    });

    expect(collected.context.retrievalPlan).toMatchObject({
      contextUse: "light",
      reason: "preserve_exact_match_semantics",
      needsRewrite: true,
      rewriteMode: "heuristic",
      denseRetrievalGate: "off",
      ambiguityFlags: [],
    });
  });

  it("turns context use off when the user has opted out", () => {
    const collected = collectSearchContext({
      route: {
        pathname: "/search",
        page: "search",
        query: "approval workflow",
        filters: {
          ontologyId: "all",
          tag: "all",
          status: "all",
          type: "all",
          ownership: "all",
        },
      },
      authenticatedUser: {
        id: "user-1",
        role: "editor",
        language: "en-US",
        preferences: {
          contextualSearchOptIn: false,
        },
      },
      session: {
        recentQueries: ["approvals"],
        recentEntities: [{ id: "def-1", type: "definition", title: "Approval Matrix" }],
      },
    });

    expect(collected.context.retrievalPlan).toMatchObject({
      contextUse: "none",
      reason: "user_opted_out",
      needsRewrite: false,
      rewriteMode: "none",
      denseRetrievalGate: "off",
      ambiguityFlags: [],
    });
  });
});
