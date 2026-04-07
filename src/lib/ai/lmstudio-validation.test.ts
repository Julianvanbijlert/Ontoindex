import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminChatSettings } from "@/lib/chat/types";
import { validateLmStudioSettings } from "@/lib/ai/lmstudio-validation";

const baseSettings: AdminChatSettings = {
  provider: {
    llmProvider: "lmstudio",
    llmModel: "local-chat-model",
    llmBaseUrl: "http://localhost:1234/v1",
    llmTemperature: 0.2,
    llmMaxTokens: 700,
    apiKeyConfigured: false,
    apiKeyMasked: null,
    apiKeyUpdatedAt: null,
  },
  embeddings: {
    embeddingProvider: "lmstudio",
    embeddingModel: "local-embed-model",
    embeddingBaseUrl: "http://localhost:1234/v1",
    fallbackProvider: null,
    fallbackModel: null,
    fallbackBaseUrl: null,
    vectorDimensions: 768,
    schemaDimensions: 768,
    dimensionCompatibility: {
      status: "match",
      mismatch: false,
      message: null,
    },
    activeRetrieval: {
      embeddingProvider: "lmstudio",
      embeddingModel: "local-embed-model",
      embeddingBaseUrl: "http://localhost:1234/v1",
      vectorDimensions: 768,
      schemaDimensions: 768,
      generationId: "gen-local",
      fingerprint: "fp-local",
      activatedAt: null,
    },
    reindexState: {
      required: false,
      status: "aligned",
      activeFingerprint: "fp-local",
      selectedFingerprint: "fp-local",
      lastIndexedFingerprint: "fp-local",
      lastIndexedAt: "2026-04-06T12:00:00.000Z",
      activeGenerationId: "gen-local",
      selectedGenerationId: "gen-local",
      pendingGenerationId: null,
      pendingJobId: null,
      pendingJobStatus: null,
      activationPending: false,
      message: null,
    },
  },
  providerKeys: {
    deepseek: { configured: false, masked: null, updatedAt: null },
    gemini: { configured: false, masked: null, updatedAt: null },
    huggingface: { configured: false, masked: null, updatedAt: null },
  },
  runtime: {
    aiEnabled: true,
    enableSimilarityExpansion: true,
    strictCitationsDefault: true,
    historyLimit: 12,
    maxEvidenceItems: 6,
    temperature: 0.2,
    maxTokens: 700,
  },
};

function createClientMock() {
  return {
    functions: {
      invoke: vi.fn(),
    },
  } as any;
}

describe("lmstudio-validation client helper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the backend validation edge function instead of fetching LM Studio from the browser", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        reachable: true,
        responseValid: true,
        baseUrl: "http://localhost:1234/v1",
        models: ["local-chat-model", "local-embed-model"],
        selectedChatModelFound: true,
        selectedEmbeddingModelFound: true,
        message: "Connected to LM Studio. 2 models available.",
        chatModelMessage: "Chat model is available on LM Studio.",
        embeddingModelMessage: "Embedding model is available on LM Studio.",
      },
      error: null,
    });

    const result = await validateLmStudioSettings(client, baseSettings);

    expect(client.functions.invoke).toHaveBeenCalledWith("validate-lmstudio", {
      body: {
        baseUrl: "http://localhost:1234/v1",
        chatModel: "local-chat-model",
        embeddingModel: "local-embed-model",
      },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.connection.status).toBe("success");
    expect(result.chatModel.status).toBe("success");
    expect(result.embeddingModel.status).toBe("success");
  });

  it("surfaces backend validation failures clearly", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "LM Studio validation service unavailable",
      },
    });

    const result = await validateLmStudioSettings(client, baseSettings);

    expect(result.connection.status).toBe("error");
    expect(result.connection.message).toContain("validation service unavailable");
    expect(result.chatModel.status).toBe("error");
    expect(result.embeddingModel.status).toBe("error");
  });

  it("maps admin-only validation failures to a clear user-facing message", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Admin access required",
      },
    });

    const result = await validateLmStudioSettings(client, baseSettings);

    expect(result.connection.status).toBe("error");
    expect(result.connection.message).toBe("Admin access is required to validate LM Studio settings.");
    expect(result.chatModel.message).toContain("Unable to validate");
    expect(result.embeddingModel.message).toContain("Unable to validate");
  });

  it("does not surface raw non-2xx edge-function errors to the user", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
      },
    });

    const result = await validateLmStudioSettings(client, baseSettings);

    expect(result.connection.status).toBe("error");
    expect(result.connection.message).toBe("LM Studio validation service unavailable.");
  });

  it("does not invoke the backend validation function when LM Studio is not selected", async () => {
    const client = createClientMock();

    const result = await validateLmStudioSettings(client, {
      ...baseSettings,
      provider: {
        ...baseSettings.provider,
        llmProvider: "gemini",
      },
      embeddings: {
        ...baseSettings.embeddings,
        embeddingProvider: "gemini",
      },
    });

    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(result.connection.status).toBe("idle");
    expect(result.chatModel.status).toBe("not_applicable");
    expect(result.embeddingModel.status).toBe("not_applicable");
  });
});
