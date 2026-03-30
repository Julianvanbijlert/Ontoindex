import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatEdgeFunctionError, requestChatCompletion } from "@/lib/chat/chat-api";

function createClientMock() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "token-123",
          },
        },
      }),
    },
  } as any;
}

describe("chat-api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps edge-function transport failures to an actionable error", async () => {
    const client = createClientMock();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Failed to send a request to the Edge Function"),
    );

    await expect(requestChatCompletion(client, {
      sessionId: null,
      userMessage: "What is an employee?",
      evidencePack: [],
      retrieval: {
        originalQuery: "What is an employee?",
        effectiveQuery: "What is an employee?",
        normalizedQuery: "what is an employee?",
        contextUse: "none",
        rewriteMode: "none",
        denseRetrievalGate: "on",
        retrievalConfidence: "weak",
        ambiguityFlags: [],
        expansionsUsed: [],
        stageTimings: {},
      },
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    })).rejects.toMatchObject({
      code: "edge_function_transport_error",
      message: "Chat backend request failed before the browser received a usable response. Verify function CORS/access settings and the chat-complete runtime logs.",
    });
  });

  it("surfaces backend error payloads instead of claiming the function is undeployed", async () => {
    const client = createClientMock();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: "Chat provider chain failed: missing Gemini key",
        code: "provider_config_missing",
        requestId: "req-123",
        details: {
          providerFailures: [],
        },
      }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(requestChatCompletion(client, {
      sessionId: null,
      userMessage: "What is an employee?",
      evidencePack: [],
      retrieval: {
        originalQuery: "What is an employee?",
        effectiveQuery: "What is an employee?",
        normalizedQuery: "what is an employee?",
        contextUse: "none",
        rewriteMode: "none",
        denseRetrievalGate: "on",
        retrievalConfidence: "weak",
        ambiguityFlags: [],
        expansionsUsed: [],
        stageTimings: {},
      },
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    })).rejects.toMatchObject({
      code: "provider_config_missing",
      message: "Chat provider chain failed: missing Gemini key",
      requestId: "req-123",
      status: 503,
      details: {
        providerFailures: [],
      },
    });
  });

  it("maps status-only runtime failures to a backend runtime error", async () => {
    const client = createClientMock();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream provider initialization failed", {
        status: 503,
      }),
    );

    await expect(requestChatCompletion(client, {
      sessionId: null,
      userMessage: "What is an employee?",
      evidencePack: [],
      retrieval: {
        originalQuery: "What is an employee?",
        effectiveQuery: "What is an employee?",
        normalizedQuery: "what is an employee?",
        contextUse: "none",
        rewriteMode: "none",
        denseRetrievalGate: "on",
        retrievalConfidence: "weak",
        ambiguityFlags: [],
        expansionsUsed: [],
        stageTimings: {},
      },
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    })).rejects.toMatchObject({
      code: "chat_backend_runtime_error",
      message: "upstream provider initialization failed",
      status: 503,
    });
  });

  it("maps browser fetch failures to the same transport guidance", async () => {
    const client = createClientMock();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(requestChatCompletion(client, {
      sessionId: null,
      userMessage: "What is an employee?",
      evidencePack: [],
      retrieval: {
        originalQuery: "What is an employee?",
        effectiveQuery: "What is an employee?",
        normalizedQuery: "what is an employee?",
        contextUse: "none",
        rewriteMode: "none",
        denseRetrievalGate: "on",
        retrievalConfidence: "weak",
        ambiguityFlags: [],
        expansionsUsed: [],
        stageTimings: {},
      },
      settings: {
        similarityExpansion: true,
        strictCitations: true,
        ontologyScopeId: null,
        ontologyScopeTitle: null,
        allowClarificationQuestions: true,
      },
    })).rejects.toMatchObject({
      code: "edge_function_transport_error",
      message: "Chat backend request failed before the browser received a usable response. Verify function CORS/access settings and the chat-complete runtime logs.",
    });
  });
});
