import { describe, expect, it, vi } from "vitest";

import {
  fetchAdminChatSettings,
  fetchChatRuntimeSettings,
  getLocalAiModeStatus,
  updateAdminChatSettings,
} from "@/lib/chat-admin-settings-service";

function createClientMock() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  };
}

function asChatSettingsClient(client: ReturnType<typeof createClientMock>) {
  return client as unknown as Parameters<typeof fetchChatRuntimeSettings>[0];
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
    schemaDimensions: 1536,
    dimensionCompatibility: {
      status: "match",
      mismatch: false,
      message: null,
    },
    reindexState: {
      required: false,
      status: "aligned",
      activeFingerprint: "gemini|gemini-embedding-001|https://generativelanguage.googleapis.com/v1beta|1536|1536",
      selectedFingerprint: "gemini|gemini-embedding-001|https://generativelanguage.googleapis.com/v1beta|1536|1536",
      lastIndexedFingerprint: "gemini|gemini-embedding-001|https://generativelanguage.googleapis.com/v1beta|1536|1536",
      lastIndexedAt: "2026-04-06T12:00:00.000Z",
      activeGenerationId: "gen-active",
      selectedGenerationId: "gen-active",
      pendingGenerationId: null,
      pendingJobId: null,
      pendingJobStatus: null,
      activationPending: false,
      totalDocuments: 24,
      processedDocuments: 24,
      remainingDocuments: 0,
      progressPercent: 100,
      progressStatus: "completed",
      progressLabel: "Completed",
      lastError: null,
      message: null,
    },
  };
  const embeddingUpdateDefaults = {
    embeddingProvider: "gemini",
    embeddingModel: "gemini-embedding-001",
    embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    fallbackProvider: "huggingface",
    fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
    fallbackBaseUrl: "https://api-inference.huggingface.co/models",
    vectorDimensions: 1536,
    schemaDimensions: 1536,
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
        aiEnabled: true,
        similarityExpansion: false,
        strictCitationsDefault: true,
        historyMessageLimit: 10,
        maxEvidenceItems: 4,
        answerTemperature: 0.1,
        maxAnswerTokens: 600,
      },
      error: null,
    });

    const settings = await fetchChatRuntimeSettings(asChatSettingsClient(client));

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
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.provider.llmProvider).toBe("gemini");
    expect(settings.provider.apiKeyConfigured).toBe(true);
    expect(settings.provider.apiKeyMasked).toBe("Configured");
    expect(settings.embeddings.embeddingProvider).toBe("gemini");
    expect(settings.providerKeys.gemini.configured).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(settings.provider, "llmApiKey")).toBe(false);
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
        embedding_schema_dimensions: 1536,
        chat_ai_enabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.provider.llmProvider).toBe("openai");
    expect(settings.provider.apiKeyConfigured).toBe(true);
    expect(settings.embeddings.embeddingProvider).toBe("huggingface");
    expect(settings.embeddings.schemaDimensions).toBe(1536);
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
              message: `relation "public.${table}" does not exist`,
            },
          }),
        })),
      })),
    }));

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.provider.llmProvider).toBe("gemini");
    expect(settings.provider.llmModel).toBe("gemini-2.0-flash");
    expect(settings.provider.llmBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(settings.embeddings.embeddingProvider).toBe("gemini");
    expect(settings.embeddings.schemaDimensions).toBe(1536);
    expect(settings.provider.apiKeyConfigured).toBe(false);
    expect(settings.runtime.maxEvidenceItems).toBe(6);
  });

  it("round-trips LM Studio chat and embedding settings through admin settings parsing", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
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
          activeRetrieval: {
            embeddingProvider: "lmstudio",
            embeddingModel: "local-embed-model",
            embeddingBaseUrl: "http://localhost:1234/v1",
            vectorDimensions: 768,
            schemaDimensions: 768,
            generationId: "gen-local",
            fingerprint: "fp-local",
            activatedAt: "2026-04-06T12:00:00.000Z",
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
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.provider.llmProvider).toBe("lmstudio");
    expect(settings.provider.llmBaseUrl).toBe("http://localhost:1234/v1");
    expect(settings.embeddings.embeddingProvider).toBe("lmstudio");
    expect(settings.embeddings.embeddingBaseUrl).toBe("http://localhost:1234/v1");
    expect(settings.embeddings.activeRetrieval.embeddingProvider).toBe("lmstudio");
  });

  it("saves LM Studio chat and embedding settings through the admin settings rpc without falling back to table writes", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
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
          activeRetrieval: {
            embeddingProvider: "lmstudio",
            embeddingModel: "local-embed-model",
            embeddingBaseUrl: "http://localhost:1234/v1",
            vectorDimensions: 768,
            schemaDimensions: 768,
            generationId: "gen-local",
            fingerprint: "fp-local",
            activatedAt: "2026-04-06T12:00:00.000Z",
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
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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
    client.from.mockImplementation(() => {
      throw new Error("fallback table path should not be used for LM Studio rpc success");
    });

    const settings = await updateAdminChatSettings(asChatSettingsClient(client), {
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
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
    });

    expect(client.rpc).toHaveBeenCalledWith("update_admin_chat_settings", expect.objectContaining({
      _settings: expect.objectContaining({
        provider: expect.objectContaining({
          llmProvider: "lmstudio",
          llmModel: "local-chat-model",
          llmBaseUrl: "http://localhost:1234/v1",
        }),
        embeddings: expect.objectContaining({
          embeddingProvider: "lmstudio",
          embeddingModel: "local-embed-model",
          embeddingBaseUrl: "http://localhost:1234/v1",
        }),
      }),
    }));
    expect(client.from).not.toHaveBeenCalled();
    expect(settings.provider.llmProvider).toBe("lmstudio");
    expect(settings.embeddings.embeddingProvider).toBe("lmstudio");
  });

  it("does not route LM Studio provider errors through the old table fallback path", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22023",
        message: "Unsupported LLM provider",
      },
    });
    client.from.mockImplementation(() => {
      throw new Error("fallback table path should not be used for rpc validation errors");
    });

    await expect(updateAdminChatSettings(asChatSettingsClient(client), {
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
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
    })).rejects.toMatchObject({
      message: "Unsupported LLM provider",
    });

    expect(client.from).not.toHaveBeenCalled();
  });

  it("detects a fully local/free LM Studio configuration", () => {
    const status = getLocalAiModeStatus({
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
        ...embeddingDefaults,
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
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
      },
      providerKeys: providerKeyDefaults,
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    expect(status).toMatchObject({
      mode: "fully_local",
      chatLocal: true,
      embeddingsLocal: true,
      warning: null,
    });
  });

  it("flags embedding dimension mismatches as warnings", async () => {
    const client = createClientMock();
    const appSettingsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        chat_llm_provider: "gemini",
        chat_llm_model: "gemini-2.0-flash",
        chat_llm_base_url: null,
        chat_llm_temperature: 0.2,
        chat_llm_max_tokens: 700,
        embedding_provider: "gemini",
        embedding_model: "gemini-embedding-001",
        embedding_base_url: "https://generativelanguage.googleapis.com/v1beta",
        embedding_fallback_provider: "huggingface",
        embedding_fallback_model: "sentence-transformers/all-MiniLM-L6-v2",
        embedding_fallback_base_url: "https://api-inference.huggingface.co/models",
        embedding_vector_dimensions: 384,
        embedding_schema_dimensions: 1536,
        chat_ai_enabled: true,
        chat_similarity_expansion_enabled: true,
        chat_strict_citations_default: true,
        chat_history_limit: 12,
        chat_max_evidence_items: 6,
        chat_runtime_temperature: 0.2,
        chat_runtime_max_tokens: 700,
      },
      error: null,
    });
    const secretsMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        chat_llm_api_key: "secret-key",
        deepseek_api_key: null,
        gemini_api_key: "gemini-key",
        hf_api_key: null,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.embeddings.dimensionCompatibility.status).toBe("padded");
    expect(settings.embeddings.dimensionCompatibility.mismatch).toBe(true);
    expect(settings.embeddings.dimensionCompatibility.message).toContain("schema");
  });

  it("applies local embedding defaults when admin settings select the local provider", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        embeddings: {
          embeddingProvider: "local",
          embeddingModel: "",
          embeddingBaseUrl: null,
          fallbackProvider: "huggingface",
          fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
          fallbackBaseUrl: "https://api-inference.huggingface.co/models",
          vectorDimensions: 768,
          schemaDimensions: 768,
        },
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.embeddings.embeddingProvider).toBe("local");
    expect(settings.embeddings.embeddingModel).toBe("nomic-embed-text");
    expect(settings.embeddings.embeddingBaseUrl).toBe("http://127.0.0.1:11434/v1");
  });

  it("surfaces reindex-required state from admin settings payloads", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        embeddings: {
          ...embeddingDefaults,
          reindexState: {
            required: true,
            status: "queued",
            activeFingerprint: "fp_new",
            lastIndexedFingerprint: "fp_old",
            lastIndexedAt: "2026-04-05T12:00:00.000Z",
            pendingJobId: "job-embed-queued",
            pendingJobStatus: "pending",
            totalDocuments: 40,
            processedDocuments: 0,
            remainingDocuments: 40,
            progressPercent: 0,
            progressStatus: "queued",
            progressLabel: "Queued",
            lastError: null,
            message: "Search embeddings need to be rebuilt for the active embedding configuration.",
          },
        },
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.embeddings.reindexState.required).toBe(true);
    expect(settings.embeddings.reindexState.status).toBe("queued");
    expect(settings.embeddings.reindexState.pendingJobId).toBe("job-embed-queued");
    expect(settings.embeddings.reindexState.lastIndexedFingerprint).toBe("fp_old");
    expect(settings.embeddings.reindexState.progressPercent).toBe(0);
    expect(settings.embeddings.reindexState.progressLabel).toBe("Queued");
  });

  it("surfaces selected embedding settings separately from the active retrieval generation", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        embeddings: {
          ...embeddingDefaults,
          embeddingProvider: "local",
          embeddingModel: "nomic-embed-text",
          embeddingBaseUrl: "http://127.0.0.1:11434/v1",
          vectorDimensions: 768,
          schemaDimensions: 768,
          activeRetrieval: {
            embeddingProvider: "gemini",
            embeddingModel: "gemini-embedding-001",
            embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
            vectorDimensions: 1536,
            schemaDimensions: 1536,
            generationId: "gen-active",
            fingerprint: "fp_active",
            activatedAt: "2026-04-05T10:00:00.000Z",
          },
          reindexState: {
            required: true,
            status: "processing",
            activeFingerprint: "fp_active",
            selectedFingerprint: "fp_selected",
            lastIndexedFingerprint: "fp_active",
            lastIndexedAt: "2026-04-05T10:00:00.000Z",
            activeGenerationId: "gen-active",
            selectedGenerationId: "gen-selected",
            pendingGenerationId: "gen-selected",
            pendingJobId: "job-embed-processing",
            pendingJobStatus: "processing",
            activationPending: true,
            totalDocuments: 10,
            processedDocuments: 7,
            remainingDocuments: 3,
            progressPercent: 70,
            progressStatus: "processing",
            progressLabel: "Rebuilding embeddings",
            lastError: null,
            message: "Search embeddings are rebuilding. Retrieval stays on the active indexed generation until activation completes.",
          },
        },
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.embeddings.embeddingProvider).toBe("local");
    expect(settings.embeddings.activeRetrieval.embeddingProvider).toBe("gemini");
    expect(settings.embeddings.activeRetrieval.generationId).toBe("gen-active");
    expect(settings.embeddings.reindexState.activeFingerprint).toBe("fp_active");
    expect(settings.embeddings.reindexState.selectedFingerprint).toBe("fp_selected");
    expect(settings.embeddings.reindexState.activationPending).toBe(true);
    expect(settings.embeddings.reindexState.progressPercent).toBe(70);
  });

  it("parses failed reindex progress from the admin settings payload", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        embeddings: {
          ...embeddingDefaults,
          reindexState: {
            required: true,
            status: "failed",
            activeFingerprint: "fp_active",
            selectedFingerprint: "fp_selected",
            lastIndexedFingerprint: "fp_active",
            lastIndexedAt: "2026-04-05T10:00:00.000Z",
            activeGenerationId: "gen-active",
            selectedGenerationId: "gen-selected",
            pendingGenerationId: "gen-selected",
            pendingJobId: "job-embed-failed",
            pendingJobStatus: "failed",
            activationPending: false,
            totalDocuments: 10,
            processedDocuments: 4,
            remainingDocuments: 6,
            progressPercent: 40,
            progressStatus: "failed",
            progressLabel: "Failed",
            lastError: "Embedding provider not configured",
            message: "Embedding rebuild failed.",
          },
        },
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
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

    const settings = await fetchAdminChatSettings(asChatSettingsClient(client));

    expect(settings.embeddings.reindexState.status).toBe("failed");
    expect(settings.embeddings.reindexState.progressStatus).toBe("failed");
    expect(settings.embeddings.reindexState.lastError).toBe("Embedding provider not configured");
  });

  it("preserves aligned reindex state when non-embedding runtime settings change", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: {
        provider: {
          llmProvider: "gemini",
          llmModel: "gemini-2.0-flash",
          llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          llmTemperature: 0.2,
          llmMaxTokens: 700,
          apiKeyConfigured: false,
          apiKeyMasked: null,
          apiKeyUpdatedAt: null,
        },
        embeddings: embeddingDefaults,
        providerKeys: providerKeyDefaults,
        runtime: {
          aiEnabled: true,
          enableSimilarityExpansion: false,
          strictCitationsDefault: true,
          historyLimit: 24,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      },
      error: null,
    });

    const updated = await updateAdminChatSettings(asChatSettingsClient(client), {
      provider: {
        llmProvider: "gemini",
        llmModel: "gemini-2.0-flash",
        llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
      },
      embeddings: embeddingUpdateDefaults,
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: false,
        strictCitationsDefault: true,
        historyLimit: 24,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    expect(updated.embeddings.reindexState.required).toBe(false);
    expect(updated.embeddings.reindexState.status).toBe("aligned");
  });

  it("propagates admin-only rpc failures when a non-admin tries to update settings", async () => {
    const client = createClientMock();
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Admin access required",
      },
    });

    await expect(updateAdminChatSettings(asChatSettingsClient(client), {
      provider: {
        llmProvider: "deepseek",
        llmModel: "deepseek-chat",
        llmBaseUrl: "https://api.deepseek.com",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
      },
      embeddings: embeddingDefaults,
      runtime: {
        aiEnabled: true,
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
          aiEnabled: true,
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

    await updateAdminChatSettings(asChatSettingsClient(client), {
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
        schemaDimensions: Number.NaN,
      },
      runtime: {
        aiEnabled: true,
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
        embeddings: embeddingUpdateDefaults,
        providerKeys: {
          deepseekApiKey: null,
          geminiApiKey: null,
          huggingFaceApiKey: null,
          clearDeepseekApiKey: false,
          clearGeminiApiKey: false,
          clearHuggingFaceApiKey: false,
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
          aiEnabled: true,
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

    await updateAdminChatSettings(asChatSettingsClient(client), {
      provider: {
        llmProvider: "DEEPSEEK",
        llmModel: "deepseek-reasoner",
        llmBaseUrl: "",
        llmTemperature: 0.1,
        llmMaxTokens: 900,
      },
      embeddings: embeddingDefaults,
      runtime: {
        aiEnabled: true,
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
        embeddings: embeddingUpdateDefaults,
      }),
    }));
  });
});
