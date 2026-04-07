import { describe, expect, it, vi } from "vitest";

import type { ChatSessionSettings } from "@/lib/chat/types";
import { runGroundedChatTurn } from "@/lib/chat/chat-controller";

const searchWithRetrievalGateway = vi.fn();
const buildChatEvidencePack = vi.fn();
const requestChatCompletion = vi.fn();
const resolveChatSynonymExpansion = vi.fn();

vi.mock("@/lib/search-retrieval-gateway", () => ({
  searchWithRetrievalGateway: (...args: unknown[]) => searchWithRetrievalGateway(...args),
}));

vi.mock("@/lib/chat/evidence-pack-builder", () => ({
  buildChatEvidencePack: (...args: unknown[]) => buildChatEvidencePack(...args),
}));

vi.mock("@/lib/chat/chat-api", () => ({
  requestChatCompletion: (...args: unknown[]) => requestChatCompletion(...args),
}));

vi.mock("@/lib/chat/synonym-expansion", () => ({
  resolveChatSynonymExpansion: (...args: unknown[]) => resolveChatSynonymExpansion(...args),
}));

describe("runGroundedChatTurn", () => {
  it("forces approved-only filters when calling the retrieval gateway", async () => {
    searchWithRetrievalGateway.mockResolvedValue({
      analysis: {
        normalizedQuery: "employee",
        retrievalPlan: {
          contextUse: "none",
          rewriteMode: "none",
          denseRetrievalGate: "off",
        },
        ambiguityFlags: [],
      },
      diagnostics: {
        stageTimings: {},
      },
      results: [],
    });
    buildChatEvidencePack.mockResolvedValue({
      evidencePack: [],
      excludedResultCount: 0,
    });
    requestChatCompletion.mockResolvedValue({
      sessionId: "session-1",
      title: null,
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      answer: "ok",
      citations: [],
      groundingStatus: "weak",
      provider: {
        name: "mock",
        model: "mock-grounded-chat",
      },
      stageTimings: {},
    });
    resolveChatSynonymExpansion.mockResolvedValue({
      expandedQuery: "employee",
      signals: [],
    });

    const settings: ChatSessionSettings = {
      similarityExpansion: true,
      strictCitations: true,
      ontologyScopeId: null,
      ontologyScopeTitle: null,
      allowClarificationQuestions: true,
    };

    await runGroundedChatTurn({} as any, {
      userMessage: "employee",
      settings,
      experience: {
        query: "employee",
        filters: {
          ontologyId: "all",
          tag: "all",
          status: "all",
          type: "all",
          ownership: "all",
        },
        route: {
          pathname: "/chat",
          page: "chat",
        },
        authenticatedUser: {
          id: "user-1",
          role: "editor",
          preferences: {},
        },
        sessionId: "session-1",
        searchHistory: [],
        recentFinds: [],
      },
    });

    expect(searchWithRetrievalGateway).toHaveBeenCalledWith(
      expect.anything(),
      "employee",
      expect.objectContaining({
        status: "approved",
      }),
      "relevance",
      undefined,
      expect.anything(),
    );
  });
});
