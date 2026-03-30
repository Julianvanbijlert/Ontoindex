import { describe, expect, it, vi } from "vitest";

import {
  fetchAdminChatSettings,
  fetchChatRuntimeSettings,
  updateAdminChatSettings,
} from "@/lib/chat-admin-settings-service";

function createClientMock() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  } as any;
}

describe("chat-admin-settings-service", () => {
  const embeddingDefaults = {
    embeddingProvider: "gemini",
    embeddingModel: "gemini-embedding-001",
    embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    fallbackProvider: "huggingface",
    fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
    fallbackBaseUrl: "https://api-inference.huggingface.co/models",
    vectorDimensions: 1536,
  };
  const providerKeyDefaults = {
    deepseek: { configured: false, masked: null, updatedAt: null },
    gemini: { configured: false, masked: null, updatedAt: null },
    huggingface: { configured: false, masked: null, updatedAt: null },
  };

  it("loads runtime settings from the typed rpc shape", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        similarityExpansion: false,
        strictCitationsDefault: true,
        historyMessageLimit: 10,
        maxEvidenceItems: 4,
        answerTemperature: 0.1,
        maxAnswerTokens: 600,
      },
      error: null,
    });

    const settings = await fetchChatRuntimeSettings(client);

    expect(settings).toMatchObject({
      enableSimilarityExpansion: false,
      strictCitationsDefault: true,
      historyMessageLimit: 10,
      maxEvidenceItems: 4,
    });
  });

  it("does not expose the raw API key when loading admin settings", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: true,
          apiKeyMasked: "Configured",
          apiKeyUpdatedAt: null,
        },
        embeddings: embeddingDefaults,
        providerKeys: {
          ...providerKeyDefaults,
          gemini: { configured: true, masked: "Configured", updatedAt: null },
        },
        runtime: {
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      },
      error: null,
    });

    const settings = await fetchAdminChatSettings(client);

    expect(settings.provider.llmProvider).toBe("gemini");
    expect(settings.provider.apiKeyConfigured).toBe(true);
    expect(settings.provider.apiKeyMasked).toBe("Configured");
    expect(settings.embeddings.embeddingProvider).toBe("gemini");
    expect(settings.providerKeys.gemini.configured).toBe(true);
    expect((settings.provider as Record<string, unknown>).llmApiKey).toBeUndefined();
  });

  it("falls back to direct table reads when the admin settings rpc is unavailable", async () => {
    const client = createClientMock();
    const appSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        chat_llm_provider: "openai",
        chat_llm_model: "gpt-4.1-mini",
        chat_llm_base_url: null,
        chat_llm_temperature: 0.15,
        chat_llm_max_tokens: 800,
        embedding_provider: "huggingface",
        embedding_model: "sentence-transformers/all-MiniLM-L6-v2",
        embedding_base_url: "https://api-inference.huggingface.co/models",
        embedding_fallback_provider: "gemini",
        embedding_fallback_model: "gemini-embedding-001",
        embedding_fallback_base_url: "https://generativelanguage.googleapis.com/v1beta",
        embedding_vector_dimensions: 1536,
        chat_similarity_expansion_enabled: true,
        chat_strict_citations_default: false,
        chat_history_limit: 9,
        chat_max_evidence_items: 5,
        chat_runtime_temperature: 0.25,
        chat_runtime_max_tokens: 500,
      },
      error: null,
    });
    const secretsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        chat_llm_api_key: "secret-key",
        deepseek_api_key: "deepseek-key",
        gemini_api_key: "gemini-key",
        hf_api_key: "hf-key",
        updated_at: "2026-03-26T10:00:00.000Z",
      },
      error: null,
    });

    client.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the function public.get_admin_chat_settings in the schema cache",
      },
    });
    client.from.mockImplementation((table: string) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: appSettingsMaybeSingle,
            })),
          })),
        };
      }

      if (table === "app_setting_secrets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: secretsMaybeSingle,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const settings = await fetchAdminChatSettings(client);

    expect(settings.provider.llmProvider).toBe("openai");
    expect(settings.provider.apiKeyConfigured).toBe(true);
    expect(settings.embeddings.embeddingProvider).toBe("huggingface");
    expect(settings.providerKeys.gemini.configured).toBe(true);
    expect(settings.runtime.historyLimit).toBe(9);
  });

  it("returns safe defaults when admin settings storage is not initialized yet", async () => {
    const client = createClientMock();

    client.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the function public.get_admin_chat_settings in the schema cache",
      },
    });
    client.from.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "42P01",
              message: `relation \"public.${table}\" does not exist`,
            },
          }),
        })),
      })),
    }));

    const settings = await fetchAdminChatSettings(client);

    expect(settings.provider.llmProvider).toBe("gemini");
    expect(settings.provider.llmModel).toBe("gemini-2.0-flash");
    expect(settings.provider.llmBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(settings.embeddings.embeddingProvider).toBe("gemini");
    expect(settings.provider.apiKeyConfigured).toBe(false);
    expect(settings.runtime.maxEvidenceItems).toBe(6);
  });

  it("propagates admin-only rpc failures when a non-admin tries to update settings", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Admin access required",
      },
    });

    await expect(updateAdminChatSettings(client, {
      provider: {
        llmProvider: "deepseek",
        llmModel: "deepseek-chat",
        llmBaseUrl: "https://api.deepseek.com",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
      },
      embeddings: embeddingDefaults,
      runtime: {
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    })).rejects.toMatchObject({
      message: "Admin access required",
    });
  });

  it("sanitizes invalid numeric inputs before saving admin settings", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "deepseek",
          llmModel: "deepseek-chat",
          llmBaseUrl: "https://api.deepseek.com",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        runtime: {
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
        embeddings: embeddingDefaults,
        providerKeys: providerKeyDefaults,
      },
      error: null,
    });

    await updateAdminChatSettings(client, {
      provider: {
        llmProvider: "OPENAI",
        llmModel: "   ",
        llmBaseUrl: "   ",
        llmTemperature: Number.NaN,
        llmMaxTokens: Number.NaN,
      },
      embeddings: {
        embeddingProvider: "gemini",
        embeddingModel: "  ",
        embeddingBaseUrl: "  ",
        fallbackProvider: "huggingface",
        fallbackModel: "  ",
        fallbackBaseUrl: "  ",
        vectorDimensions: Number.NaN,
      },
      runtime: {
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: Number.NaN,
        maxEvidenceItems: Number.NaN,
        temperature: Number.NaN,
        maxTokens: Number.NaN,
      },
      apiKey: "  ",
    });

    expect(client.rpc).toHaveBeenCalledWith("update_admin_chat_settings", expect.objectContaining({
      _settings: {
        provider: {
          llmProvider: "openai",
          llmModel: "gpt-4.1-mini",
          llmBaseUrl: "https://api.openai.com/v1",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
        },
        embeddings: embeddingDefaults,
        providerKeys: {
          deepseekApiKey: null,
          geminiApiKey: null,
          huggingFaceApiKey: null,
          clearDeepseekApiKey: false,
          clearGeminiApiKey: false,
          clearHuggingFaceApiKey: false,
        },
        runtime: {
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      },
      _api_key: null,
      _clear_api_key: false,
    }));
  });

  it("preserves DeepSeek defaults when saving explicit DeepSeek settings", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "deepseek",
          llmModel: "deepseek-reasoner",
          llmBaseUrl: "https://api.deepseek.com",
          llmTemperature: 0.1,
          llmMaxTokens: 900,
          apiKeyConfigured: true,
          apiKeyMasked: "Configured",
          apiKeyUpdatedAt: null,
        },
        embeddings: embeddingDefaults,
        providerKeys: {
          ...providerKeyDefaults,
          deepseek: { configured: true, masked: "Configured", updatedAt: null },
        },
        runtime: {
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      },
      error: null,
    });

    await updateAdminChatSettings(client, {
      provider: {
        llmProvider: "DEEPSEEK",
        llmModel: "deepseek-reasoner",
        llmBaseUrl: "",
        llmTemperature: 0.1,
        llmMaxTokens: 900,
      },
      embeddings: embeddingDefaults,
      runtime: {
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    expect(client.rpc).toHaveBeenCalledWith("update_admin_chat_settings", expect.objectContaining({
      _settings: expect.objectContaining({
        provider: expect.objectContaining({
          llmProvider: "deepseek",
          llmModel: "deepseek-reasoner",
          llmBaseUrl: "https://api.deepseek.com",
        }),
        embeddings: embeddingDefaults,
      }),
    }));
  });
});
