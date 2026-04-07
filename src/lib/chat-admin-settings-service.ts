import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  buildEmbeddingReindexState,
  buildEmbeddingConfigFingerprint,
  type EmbeddingConfigSnapshot,
} from "@/lib/ai/embedding-config-state";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_PROVIDER,
  defaultEmbeddingBaseUrlForProvider,
  defaultEmbeddingModelForProvider,
  normalizeEmbeddingProvider,
} from "@/lib/ai/provider-factory";
import { resolveEmbeddingDimensionCompatibility } from "@/lib/ai/embedding-dimensions";
import {
  defaultLlmBaseUrlForProvider,
  defaultLlmModelForProvider,
  DEFAULT_LLM_PROVIDER,
  normalizeLlmProviderName,
} from "@/lib/chat/provider-config";
import type {
  AdminChatSettings,
  AdminChatSettingsUpdateInput,
  ChatRuntimeSettings,
  ChatSessionSettings,
} from "@/lib/chat/types";

type AppSupabaseClient = SupabaseClient<Database>;
type AppSettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];
type AppSettingsSecretsRow = Database["public"]["Tables"]["app_setting_secrets"]["Row"];
type RuntimeSettingsTableRow = Pick<
  AppSettingsRow,
  | "chat_ai_enabled"
  | "chat_history_limit"
  | "chat_llm_max_tokens"
  | "chat_llm_temperature"
  | "chat_max_evidence_items"
  | "chat_runtime_max_tokens"
  | "chat_runtime_temperature"
  | "chat_similarity_expansion_enabled"
  | "chat_strict_citations_default"
>;
type SearchIndexJobRow = Database["public"]["Tables"]["search_index_jobs"]["Row"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchemaMissingError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return (
    code === "42P01"
    || code === "42703"
    || code === "42883"
    || code === "PGRST205"
    || message.includes("schema cache")
    || message.includes("could not find the function")
    || message.includes("does not exist")
    || message.includes("column")
  );
}

function isUnauthorizedError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return code === "42501" || message.includes("admin access required") || message.includes("permission denied");
}

function coerceBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function coerceNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceString(value: unknown, fallback: string | null = null) {
  return typeof value === "string" ? value : fallback;
}

function buildEmbeddingConfigSnapshot(input: {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingBaseUrl: string | null;
  vectorDimensions: number;
  schemaDimensions: number;
}): EmbeddingConfigSnapshot {
  return {
    provider: input.embeddingProvider,
    model: input.embeddingModel,
    baseUrl: input.embeddingBaseUrl,
    vectorDimensions: input.vectorDimensions,
    schemaDimensions: input.schemaDimensions,
  };
}

function buildResolvedEmbeddingInput(source: Record<string, unknown>, fallbackProvider: string) {
  const embeddingProvider = normalizeEmbeddingProvider(coerceString(source.embeddingProvider, fallbackProvider));
  const embeddingModel = coerceString(
    source.embeddingModel,
    defaultEmbeddingModelForProvider(embeddingProvider),
  ) || (defaultEmbeddingModelForProvider(embeddingProvider) || "");
  const embeddingBaseUrl = coerceString(
    source.embeddingBaseUrl,
    defaultEmbeddingBaseUrlForProvider(embeddingProvider),
  );
  const vectorDimensions = Math.max(
    1,
    Math.round(coerceNumber(source.vectorDimensions, DEFAULT_EMBEDDING_DIMENSIONS)),
  );
  const schemaDimensions = Math.max(
    1,
    Math.round(coerceNumber(source.schemaDimensions, vectorDimensions)),
  );

  return {
    embeddingProvider,
    embeddingModel,
    embeddingBaseUrl,
    vectorDimensions,
    schemaDimensions,
  };
}

function isLmStudioEndpointConfigured(model: string | null | undefined, baseUrl: string | null | undefined) {
  return Boolean(model?.trim()) && Boolean(baseUrl?.trim());
}

export interface LocalAiModeStatus {
  mode: "fully_local" | "partially_local" | "not_local" | "incomplete_local";
  chatLocal: boolean;
  embeddingsLocal: boolean;
  warning: string | null;
}

export function getLocalAiModeStatus(settings: AdminChatSettings): LocalAiModeStatus {
  const chatSelected = settings.provider.llmProvider === "lmstudio";
  const embeddingSelected = settings.embeddings.embeddingProvider === "lmstudio";
  const chatLocal = chatSelected && isLmStudioEndpointConfigured(
    settings.provider.llmModel,
    settings.provider.llmBaseUrl,
  );
  const embeddingsLocal = embeddingSelected && isLmStudioEndpointConfigured(
    settings.embeddings.embeddingModel,
    settings.embeddings.embeddingBaseUrl,
  );

  if (chatLocal && embeddingsLocal) {
    return {
      mode: "fully_local",
      chatLocal: true,
      embeddingsLocal: true,
      warning: null,
    };
  }

  if ((chatSelected && !chatLocal) || (embeddingSelected && !embeddingsLocal)) {
    return {
      mode: "incomplete_local",
      chatLocal,
      embeddingsLocal,
      warning: "LM Studio local mode is incomplete. Set both model and base URL for chat and embeddings.",
    };
  }

  if (chatLocal || embeddingsLocal) {
    return {
      mode: "partially_local",
      chatLocal,
      embeddingsLocal,
      warning: chatLocal
        ? "Chat is local but embeddings are not configured for LM Studio."
        : "Embeddings are local but chat is not configured for LM Studio.",
    };
  }

  return {
    mode: "not_local",
    chatLocal: false,
    embeddingsLocal: false,
    warning: null,
  };
}

export function defaultChatRuntimeSettings(): ChatRuntimeSettings {
  return {
    aiEnabled: true,
    enableSimilarityExpansion: true,
    strictCitationsDefault: true,
    historyMessageLimit: 12,
    maxEvidenceItems: 6,
    answerTemperature: 0.2,
    maxAnswerTokens: 700,
  };
}

export function defaultChatSessionSettings(
  runtimeSettings = defaultChatRuntimeSettings(),
): ChatSessionSettings {
  return {
    similarityExpansion: runtimeSettings.enableSimilarityExpansion,
    strictCitations: runtimeSettings.strictCitationsDefault,
    ontologyScopeId: null,
    ontologyScopeTitle: null,
    allowClarificationQuestions: true,
  };
}

export function parseChatRuntimeSettings(payload: Json | null | undefined): ChatRuntimeSettings {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};

  return {
    aiEnabled: coerceBoolean(source.aiEnabled, true),
    enableSimilarityExpansion: coerceBoolean(source.similarityExpansion, true),
    strictCitationsDefault: coerceBoolean(source.strictCitationsDefault, true),
    historyMessageLimit: Math.max(1, coerceNumber(source.historyMessageLimit, 12)),
    maxEvidenceItems: Math.max(1, coerceNumber(source.maxEvidenceItems, 6)),
    answerTemperature: Math.max(0, coerceNumber(source.answerTemperature, 0.2)),
    maxAnswerTokens: Math.max(1, coerceNumber(source.maxAnswerTokens, 700)),
  };
}

export function parseAdminChatSettings(payload: Json | null | undefined): AdminChatSettings {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const provider = source.provider && typeof source.provider === "object" && !Array.isArray(source.provider)
    ? source.provider as Record<string, unknown>
    : {};
  const embeddings = source.embeddings && typeof source.embeddings === "object" && !Array.isArray(source.embeddings)
    ? source.embeddings as Record<string, unknown>
    : {};
  const activeRetrieval = embeddings.activeRetrieval
    && typeof embeddings.activeRetrieval === "object"
    && !Array.isArray(embeddings.activeRetrieval)
    ? embeddings.activeRetrieval as Record<string, unknown>
    : {};
  const embeddingReindexState = embeddings.reindexState
    && typeof embeddings.reindexState === "object"
    && !Array.isArray(embeddings.reindexState)
    ? embeddings.reindexState as Record<string, unknown>
    : {};
  const providerKeys = source.providerKeys && typeof source.providerKeys === "object" && !Array.isArray(source.providerKeys)
    ? source.providerKeys as Record<string, unknown>
    : {};
  const runtime = source.runtime && typeof source.runtime === "object" && !Array.isArray(source.runtime)
    ? source.runtime as Record<string, unknown>
    : {};

  const selectedEmbedding = buildResolvedEmbeddingInput(embeddings, DEFAULT_EMBEDDING_PROVIDER);
  const activeEmbedding = buildResolvedEmbeddingInput(
    activeRetrieval,
    selectedEmbedding.embeddingProvider,
  );
  const vectorDimensions = selectedEmbedding.vectorDimensions;
  const schemaDimensions = selectedEmbedding.schemaDimensions;
  const dimensionCompatibility = resolveEmbeddingDimensionCompatibility(vectorDimensions, schemaDimensions);
  const embeddingProvider = selectedEmbedding.embeddingProvider;
  const embeddingModel = selectedEmbedding.embeddingModel;
  const embeddingBaseUrl = selectedEmbedding.embeddingBaseUrl;
  const reindexState = buildEmbeddingReindexState({
    selectedConfig: buildEmbeddingConfigSnapshot({
      embeddingProvider: selectedEmbedding.embeddingProvider,
      embeddingModel: selectedEmbedding.embeddingModel,
      embeddingBaseUrl: selectedEmbedding.embeddingBaseUrl,
      vectorDimensions: selectedEmbedding.vectorDimensions,
      schemaDimensions: selectedEmbedding.schemaDimensions,
    }),
    activeConfig: buildEmbeddingConfigSnapshot({
      embeddingProvider: activeEmbedding.embeddingProvider,
      embeddingModel: activeEmbedding.embeddingModel,
      embeddingBaseUrl: activeEmbedding.embeddingBaseUrl,
      vectorDimensions: activeEmbedding.vectorDimensions,
      schemaDimensions: activeEmbedding.schemaDimensions,
    }),
    activeFingerprint: coerceString(
      embeddingReindexState.activeFingerprint,
      coerceString(activeRetrieval.fingerprint, null),
    ),
    selectedFingerprint: coerceString(
      embeddingReindexState.selectedFingerprint,
      null,
    ),
    required: coerceBoolean(
      embeddingReindexState.required,
      coerceBoolean(embeddings.reindexRequired, false),
    ),
    status: coerceString(
      embeddingReindexState.status,
      null,
    ),
    lastIndexedFingerprint: coerceString(
      embeddingReindexState.lastIndexedFingerprint,
      coerceString(embeddings.lastIndexedFingerprint, null),
    ),
    lastIndexedAt: coerceString(
      embeddingReindexState.lastIndexedAt,
      coerceString(embeddings.lastIndexedAt, null),
    ),
    activeGenerationId: coerceString(
      embeddingReindexState.activeGenerationId,
      coerceString(activeRetrieval.generationId, null),
    ),
    selectedGenerationId: coerceString(
      embeddingReindexState.selectedGenerationId,
      coerceString(embeddingReindexState.pendingGenerationId, coerceString(activeRetrieval.generationId, null)),
    ),
    pendingGenerationId: coerceString(
      embeddingReindexState.pendingGenerationId,
      null,
    ),
    pendingJobId: coerceString(
      embeddingReindexState.pendingJobId,
      coerceString(embeddings.pendingJobId, null),
    ),
    pendingJobStatus: coerceString(
      embeddingReindexState.pendingJobStatus,
      coerceString(embeddings.pendingJobStatus, null),
    ),
    totalDocuments: typeof embeddingReindexState.totalDocuments === "number"
      ? embeddingReindexState.totalDocuments
      : typeof embeddings.totalDocuments === "number"
        ? embeddings.totalDocuments
        : null,
    processedDocuments: typeof embeddingReindexState.processedDocuments === "number"
      ? embeddingReindexState.processedDocuments
      : typeof embeddings.processedDocuments === "number"
        ? embeddings.processedDocuments
        : null,
    remainingDocuments: typeof embeddingReindexState.remainingDocuments === "number"
      ? embeddingReindexState.remainingDocuments
      : typeof embeddings.remainingDocuments === "number"
        ? embeddings.remainingDocuments
        : null,
    progressPercent: typeof embeddingReindexState.progressPercent === "number"
      ? embeddingReindexState.progressPercent
      : typeof embeddings.progressPercent === "number"
        ? embeddings.progressPercent
        : null,
    lastError: coerceString(
      embeddingReindexState.lastError,
      coerceString(embeddings.lastError, null),
    ),
    message: coerceString(
      embeddingReindexState.message,
      coerceString(embeddings.reindexMessage, null),
    ),
  });

  return {
    provider: {
      llmProvider: normalizeLlmProviderName(coerceString(provider.llmProvider, DEFAULT_LLM_PROVIDER)),
      llmModel: coerceString(
        provider.llmModel,
        defaultLlmModelForProvider(coerceString(provider.llmProvider, DEFAULT_LLM_PROVIDER)),
      ) || defaultLlmModelForProvider(coerceString(provider.llmProvider, DEFAULT_LLM_PROVIDER)),
      llmBaseUrl: coerceString(
        provider.llmBaseUrl,
        defaultLlmBaseUrlForProvider(coerceString(provider.llmProvider, DEFAULT_LLM_PROVIDER)),
      ),
      llmTemperature: Math.max(0, coerceNumber(provider.llmTemperature, 0.2)),
      llmMaxTokens: Math.max(1, coerceNumber(provider.llmMaxTokens, 700)),
      apiKeyConfigured: coerceBoolean(provider.apiKeyConfigured, false),
      apiKeyMasked: coerceString(provider.apiKeyMasked, null),
      apiKeyUpdatedAt: coerceString(provider.apiKeyUpdatedAt, null),
    },
    embeddings: {
      embeddingProvider,
      embeddingModel,
      embeddingBaseUrl,
      fallbackProvider: coerceString(embeddings.fallbackProvider, "huggingface"),
      fallbackModel: coerceString(
        embeddings.fallbackModel,
        defaultEmbeddingModelForProvider(coerceString(embeddings.fallbackProvider, "huggingface")),
      ),
      fallbackBaseUrl: coerceString(
        embeddings.fallbackBaseUrl,
        defaultEmbeddingBaseUrlForProvider(coerceString(embeddings.fallbackProvider, "huggingface")),
      ),
      vectorDimensions,
      schemaDimensions,
      dimensionCompatibility,
      activeRetrieval: {
        embeddingProvider: activeEmbedding.embeddingProvider,
        embeddingModel: activeEmbedding.embeddingModel,
        embeddingBaseUrl: activeEmbedding.embeddingBaseUrl,
        vectorDimensions: activeEmbedding.vectorDimensions,
        schemaDimensions: activeEmbedding.schemaDimensions,
        generationId: coerceString(activeRetrieval.generationId, null),
        fingerprint: coerceString(
          activeRetrieval.fingerprint,
          buildEmbeddingConfigFingerprint(buildEmbeddingConfigSnapshot({
            embeddingProvider: activeEmbedding.embeddingProvider,
            embeddingModel: activeEmbedding.embeddingModel,
            embeddingBaseUrl: activeEmbedding.embeddingBaseUrl,
            vectorDimensions: activeEmbedding.vectorDimensions,
            schemaDimensions: activeEmbedding.schemaDimensions,
          })),
        ) || "",
        activatedAt: coerceString(activeRetrieval.activatedAt, null),
      },
      reindexState,
    },
    providerKeys: {
      deepseek: {
        configured: coerceBoolean((providerKeys.deepseek as Record<string, unknown> | undefined)?.configured, false),
        masked: coerceString((providerKeys.deepseek as Record<string, unknown> | undefined)?.masked, null),
        updatedAt: coerceString((providerKeys.deepseek as Record<string, unknown> | undefined)?.updatedAt, null),
      },
      gemini: {
        configured: coerceBoolean((providerKeys.gemini as Record<string, unknown> | undefined)?.configured, false),
        masked: coerceString((providerKeys.gemini as Record<string, unknown> | undefined)?.masked, null),
        updatedAt: coerceString((providerKeys.gemini as Record<string, unknown> | undefined)?.updatedAt, null),
      },
      huggingface: {
        configured: coerceBoolean((providerKeys.huggingface as Record<string, unknown> | undefined)?.configured, false),
        masked: coerceString((providerKeys.huggingface as Record<string, unknown> | undefined)?.masked, null),
        updatedAt: coerceString((providerKeys.huggingface as Record<string, unknown> | undefined)?.updatedAt, null),
      },
    },
    runtime: {
      aiEnabled: coerceBoolean(runtime.aiEnabled, true),
      enableSimilarityExpansion: coerceBoolean(runtime.enableSimilarityExpansion, true),
      strictCitationsDefault: coerceBoolean(runtime.strictCitationsDefault, true),
      historyLimit: Math.max(1, coerceNumber(runtime.historyLimit, 12)),
      maxEvidenceItems: Math.max(1, coerceNumber(runtime.maxEvidenceItems, 6)),
      temperature: Math.max(0, coerceNumber(runtime.temperature, 0.2)),
      maxTokens: Math.max(1, coerceNumber(runtime.maxTokens, 700)),
    },
  };
}

function normalizeProviderName(value: string) {
  return normalizeLlmProviderName(value);
}

function sanitizeAdminChatSettingsInput(input: AdminChatSettingsUpdateInput): AdminChatSettingsUpdateInput {
  const llmProvider = normalizeProviderName(input.provider.llmProvider);
  const embeddingProvider = normalizeEmbeddingProvider(input.embeddings.embeddingProvider);
  const fallbackProvider = input.embeddings.fallbackProvider
    ? normalizeEmbeddingProvider(input.embeddings.fallbackProvider)
    : "huggingface";
  const vectorDimensions = Math.max(
    1,
    Math.round(Number.isFinite(input.embeddings.vectorDimensions) ? input.embeddings.vectorDimensions : DEFAULT_EMBEDDING_DIMENSIONS),
  );
  const schemaDimensions = Math.max(
    1,
    Math.round(Number.isFinite(input.embeddings.schemaDimensions) ? input.embeddings.schemaDimensions : DEFAULT_EMBEDDING_DIMENSIONS),
  );

  return {
    provider: {
      llmProvider,
      llmModel: input.provider.llmModel.trim() || defaultLlmModelForProvider(llmProvider),
      llmBaseUrl: input.provider.llmBaseUrl?.trim() || defaultLlmBaseUrlForProvider(llmProvider),
      llmTemperature: Math.max(0, Number.isFinite(input.provider.llmTemperature) ? input.provider.llmTemperature : 0.2),
      llmMaxTokens: Math.max(1, Math.round(Number.isFinite(input.provider.llmMaxTokens) ? input.provider.llmMaxTokens : 700)),
    },
    embeddings: {
      embeddingProvider,
      embeddingModel: input.embeddings.embeddingModel.trim()
        || defaultEmbeddingModelForProvider(embeddingProvider)
        || "",
      embeddingBaseUrl: input.embeddings.embeddingBaseUrl?.trim() || defaultEmbeddingBaseUrlForProvider(embeddingProvider),
      fallbackProvider,
      fallbackModel: input.embeddings.fallbackModel?.trim()
        || defaultEmbeddingModelForProvider(fallbackProvider)
        || null,
      fallbackBaseUrl: input.embeddings.fallbackBaseUrl?.trim()
        || defaultEmbeddingBaseUrlForProvider(fallbackProvider),
      vectorDimensions,
      schemaDimensions,
    },
    runtime: {
      aiEnabled: typeof input.runtime.aiEnabled === "boolean" ? input.runtime.aiEnabled : true,
      enableSimilarityExpansion: Boolean(input.runtime.enableSimilarityExpansion),
      strictCitationsDefault: Boolean(input.runtime.strictCitationsDefault),
      historyLimit: Math.max(1, Math.round(Number.isFinite(input.runtime.historyLimit) ? input.runtime.historyLimit : 12)),
      maxEvidenceItems: Math.max(1, Math.round(Number.isFinite(input.runtime.maxEvidenceItems) ? input.runtime.maxEvidenceItems : 6)),
      temperature: Math.max(0, Number.isFinite(input.runtime.temperature) ? input.runtime.temperature : 0.2),
      maxTokens: Math.max(1, Math.round(Number.isFinite(input.runtime.maxTokens) ? input.runtime.maxTokens : 700)),
    },
    providerKeys: {
      deepseekApiKey: input.providerKeys?.deepseekApiKey?.trim() || null,
      geminiApiKey: input.providerKeys?.geminiApiKey?.trim() || null,
      huggingFaceApiKey: input.providerKeys?.huggingFaceApiKey?.trim() || null,
      clearDeepseekApiKey: Boolean(input.providerKeys?.clearDeepseekApiKey),
      clearGeminiApiKey: Boolean(input.providerKeys?.clearGeminiApiKey),
      clearHuggingFaceApiKey: Boolean(input.providerKeys?.clearHuggingFaceApiKey),
    },
    apiKey: input.apiKey?.trim() || null,
    clearApiKey: Boolean(input.clearApiKey),
  };
}

function mapRowsToAdminChatSettings(
  settingsRow: Partial<AppSettingsRow> | null | undefined,
  secretsRow: Partial<AppSettingsSecretsRow> | null | undefined,
  pendingJob?: Partial<SearchIndexJobRow> | null,
) {
  const llmProvider = normalizeLlmProviderName(settingsRow?.chat_llm_provider || DEFAULT_LLM_PROVIDER);
  const embeddingProvider = settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER;
  const embeddingModel = settingsRow?.embedding_model
    || defaultEmbeddingModelForProvider(settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER);
  const embeddingBaseUrl = settingsRow?.embedding_base_url
    || defaultEmbeddingBaseUrlForProvider(settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER);
  const vectorDimensions = settingsRow?.embedding_vector_dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  const schemaDimensions = settingsRow?.embedding_schema_dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  const activeEmbeddingProvider = settingsRow?.active_embedding_provider || embeddingProvider;
  const activeEmbeddingModel = settingsRow?.active_embedding_model || embeddingModel;
  const activeEmbeddingBaseUrl = settingsRow?.active_embedding_base_url || embeddingBaseUrl;
  const activeVectorDimensions = settingsRow?.active_embedding_vector_dimensions ?? vectorDimensions;
  const activeSchemaDimensions = settingsRow?.active_embedding_schema_dimensions ?? schemaDimensions;
  const activeFingerprint = settingsRow?.active_embedding_fingerprint
    || buildEmbeddingConfigFingerprint(buildEmbeddingConfigSnapshot({
      embeddingProvider: activeEmbeddingProvider,
      embeddingModel: activeEmbeddingModel || "",
      embeddingBaseUrl: activeEmbeddingBaseUrl,
      vectorDimensions: activeVectorDimensions,
      schemaDimensions: activeSchemaDimensions,
    }));
  const selectedFingerprint = buildEmbeddingConfigFingerprint(buildEmbeddingConfigSnapshot({
    embeddingProvider,
    embeddingModel: embeddingModel || "",
    embeddingBaseUrl,
    vectorDimensions,
    schemaDimensions,
  }));

  return parseAdminChatSettings({
    provider: {
      llmProvider,
      llmModel: settingsRow?.chat_llm_model || defaultLlmModelForProvider(llmProvider),
      llmBaseUrl: settingsRow?.chat_llm_base_url || defaultLlmBaseUrlForProvider(llmProvider),
      llmTemperature: settingsRow?.chat_llm_temperature ?? 0.2,
      llmMaxTokens: settingsRow?.chat_llm_max_tokens ?? 700,
      apiKeyConfigured: Boolean(secretsRow?.chat_llm_api_key),
      apiKeyMasked: secretsRow?.chat_llm_api_key ? "Configured" : null,
      apiKeyUpdatedAt: typeof secretsRow?.updated_at === "string" ? secretsRow.updated_at : null,
    },
    embeddings: {
      embeddingProvider,
      embeddingModel,
      embeddingBaseUrl,
      fallbackProvider: settingsRow?.embedding_fallback_provider || "huggingface",
      fallbackModel: settingsRow?.embedding_fallback_model || defaultEmbeddingModelForProvider(settingsRow?.embedding_fallback_provider || "huggingface"),
      fallbackBaseUrl: settingsRow?.embedding_fallback_base_url || defaultEmbeddingBaseUrlForProvider(settingsRow?.embedding_fallback_provider || "huggingface"),
      vectorDimensions,
      schemaDimensions,
      activeRetrieval: {
        embeddingProvider: activeEmbeddingProvider,
        embeddingModel: activeEmbeddingModel,
        embeddingBaseUrl: activeEmbeddingBaseUrl,
        vectorDimensions: activeVectorDimensions,
        schemaDimensions: activeSchemaDimensions,
        generationId: settingsRow?.active_embedding_generation_id || null,
        fingerprint: activeFingerprint,
        activatedAt: typeof settingsRow?.active_embedding_activated_at === "string"
          ? settingsRow.active_embedding_activated_at
          : null,
      },
      reindexRequired: settingsRow?.embedding_reindex_required ?? (selectedFingerprint !== activeFingerprint),
      lastIndexedFingerprint: settingsRow?.embedding_last_indexed_fingerprint || activeFingerprint,
      lastIndexedAt: typeof settingsRow?.embedding_last_indexed_at === "string" ? settingsRow.embedding_last_indexed_at : null,
      activeGenerationId: settingsRow?.active_embedding_generation_id || null,
      selectedGenerationId: settingsRow?.embedding_pending_generation_id || settingsRow?.active_embedding_generation_id || null,
      pendingGenerationId: settingsRow?.embedding_pending_generation_id || null,
      pendingJobId: typeof pendingJob?.id === "string" ? pendingJob.id : null,
      pendingJobStatus: typeof pendingJob?.status === "string" ? pendingJob.status : null,
    },
    providerKeys: {
      deepseek: {
        configured: Boolean(secretsRow?.deepseek_api_key),
        masked: secretsRow?.deepseek_api_key ? "Configured" : null,
        updatedAt: typeof secretsRow?.updated_at === "string" ? secretsRow.updated_at : null,
      },
      gemini: {
        configured: Boolean(secretsRow?.gemini_api_key),
        masked: secretsRow?.gemini_api_key ? "Configured" : null,
        updatedAt: typeof secretsRow?.updated_at === "string" ? secretsRow.updated_at : null,
      },
      huggingface: {
        configured: Boolean(secretsRow?.hf_api_key),
        masked: secretsRow?.hf_api_key ? "Configured" : null,
        updatedAt: typeof secretsRow?.updated_at === "string" ? secretsRow.updated_at : null,
      },
    },
    runtime: {
      aiEnabled: settingsRow?.chat_ai_enabled ?? true,
      enableSimilarityExpansion: settingsRow?.chat_similarity_expansion_enabled ?? true,
      strictCitationsDefault: settingsRow?.chat_strict_citations_default ?? true,
      historyLimit: settingsRow?.chat_history_limit ?? 12,
      maxEvidenceItems: settingsRow?.chat_max_evidence_items ?? 6,
      temperature: settingsRow?.chat_runtime_temperature ?? 0.2,
      maxTokens: settingsRow?.chat_runtime_max_tokens ?? 700,
    },
  });
}

async function loadRuntimeSettingsFromTables(client: AppSupabaseClient) {
  const response = await client
    .from("app_settings")
    .select([
      "id",
      "chat_ai_enabled",
      "chat_similarity_expansion_enabled",
      "chat_strict_citations_default",
      "chat_history_limit",
      "chat_max_evidence_items",
      "chat_runtime_temperature",
      "chat_runtime_max_tokens",
      "chat_llm_temperature",
      "chat_llm_max_tokens",
    ].join(","))
    .eq("id", 1)
    .maybeSingle();
  const data = response.data as unknown as RuntimeSettingsTableRow | null;
  const error = response.error;

  if (error) {
    throw error;
  }

  return parseChatRuntimeSettings({
    aiEnabled: data?.chat_ai_enabled ?? true,
    similarityExpansion: data?.chat_similarity_expansion_enabled ?? true,
    strictCitationsDefault: data?.chat_strict_citations_default ?? true,
    historyMessageLimit: data?.chat_history_limit ?? 12,
    maxEvidenceItems: data?.chat_max_evidence_items ?? 6,
    answerTemperature: data?.chat_runtime_temperature ?? data?.chat_llm_temperature ?? 0.2,
    maxAnswerTokens: data?.chat_runtime_max_tokens ?? data?.chat_llm_max_tokens ?? 700,
  });
}

async function loadAdminSettingsFromTables(client: AppSupabaseClient) {
  const [settingsResponse, secretsResponse] = await Promise.all([
    client
      .from("app_settings")
      .select([
        "id",
        "chat_ai_enabled",
        "chat_llm_provider",
        "chat_llm_model",
        "chat_llm_base_url",
        "chat_llm_temperature",
        "chat_llm_max_tokens",
        "embedding_provider",
        "embedding_model",
        "embedding_base_url",
        "embedding_fallback_provider",
        "embedding_fallback_model",
        "embedding_fallback_base_url",
        "embedding_vector_dimensions",
        "embedding_schema_dimensions",
        "embedding_reindex_required",
        "embedding_last_indexed_fingerprint",
        "embedding_last_indexed_at",
        "active_embedding_provider",
        "active_embedding_model",
        "active_embedding_base_url",
        "active_embedding_vector_dimensions",
        "active_embedding_schema_dimensions",
        "active_embedding_generation_id",
        "active_embedding_fingerprint",
        "active_embedding_activated_at",
        "embedding_pending_generation_id",
        "chat_similarity_expansion_enabled",
        "chat_strict_citations_default",
        "chat_history_limit",
        "chat_max_evidence_items",
        "chat_runtime_temperature",
        "chat_runtime_max_tokens",
      ].join(","))
      .eq("id", 1)
      .maybeSingle(),
    client
      .from("app_setting_secrets")
      .select("id, chat_llm_api_key, deepseek_api_key, gemini_api_key, hf_api_key, updated_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (settingsResponse.error) {
    throw settingsResponse.error;
  }

  if (secretsResponse.error) {
    throw secretsResponse.error;
  }

  return mapRowsToAdminChatSettings(
    settingsResponse.data as Partial<AppSettingsRow> | null,
    secretsResponse.data as Partial<AppSettingsSecretsRow> | null,
  );
}

async function updateAdminSettingsThroughTables(
  client: AppSupabaseClient,
  input: AdminChatSettingsUpdateInput,
) {
  const sanitized = sanitizeAdminChatSettingsInput(input);
  const currentSettingsResponse = await client
    .from("app_settings")
    .select([
      "id",
      "embedding_provider",
      "embedding_model",
      "embedding_base_url",
      "embedding_vector_dimensions",
      "embedding_schema_dimensions",
      "embedding_reindex_required",
      "embedding_last_indexed_fingerprint",
      "embedding_last_indexed_at",
      "active_embedding_provider",
      "active_embedding_model",
      "active_embedding_base_url",
      "active_embedding_vector_dimensions",
      "active_embedding_schema_dimensions",
      "active_embedding_generation_id",
      "active_embedding_fingerprint",
      "active_embedding_activated_at",
      "embedding_pending_generation_id",
    ].join(","))
    .eq("id", 1)
    .maybeSingle();

  if (currentSettingsResponse.error && !isSchemaMissingError(currentSettingsResponse.error)) {
    throw currentSettingsResponse.error;
  }

  const currentSettings = currentSettingsResponse.data as Partial<AppSettingsRow> | null;
  const nextEmbeddingConfig = buildEmbeddingConfigSnapshot({
    embeddingProvider: sanitized.embeddings.embeddingProvider,
    embeddingModel: sanitized.embeddings.embeddingModel,
    embeddingBaseUrl: sanitized.embeddings.embeddingBaseUrl,
    vectorDimensions: sanitized.embeddings.vectorDimensions,
    schemaDimensions: sanitized.embeddings.schemaDimensions,
  });
  const nextEmbeddingFingerprint = buildEmbeddingConfigFingerprint(nextEmbeddingConfig);
  const currentEmbeddingFingerprint = currentSettings
    ? buildEmbeddingConfigFingerprint(buildEmbeddingConfigSnapshot({
        embeddingProvider: currentSettings.embedding_provider || DEFAULT_EMBEDDING_PROVIDER,
        embeddingModel: currentSettings.embedding_model
          || defaultEmbeddingModelForProvider(currentSettings.embedding_provider || DEFAULT_EMBEDDING_PROVIDER)
          || "",
        embeddingBaseUrl: currentSettings.embedding_base_url
          || defaultEmbeddingBaseUrlForProvider(currentSettings.embedding_provider || DEFAULT_EMBEDDING_PROVIDER),
        vectorDimensions: currentSettings.embedding_vector_dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS,
        schemaDimensions: currentSettings.embedding_schema_dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS,
      }))
    : nextEmbeddingFingerprint;
  const lastIndexedFingerprint = currentSettings?.embedding_last_indexed_fingerprint || currentEmbeddingFingerprint;
  const embeddingConfigChanged = currentEmbeddingFingerprint !== nextEmbeddingFingerprint;
  const reindexRequired = embeddingConfigChanged
    ? lastIndexedFingerprint !== nextEmbeddingFingerprint
    : Boolean(currentSettings?.embedding_reindex_required);
  const settingsPayload = {
    id: 1,
    allow_self_role_change: true,
    chat_llm_provider: sanitized.provider.llmProvider,
    chat_llm_model: sanitized.provider.llmModel,
    chat_llm_base_url: sanitized.provider.llmBaseUrl,
    chat_llm_temperature: sanitized.provider.llmTemperature,
    chat_llm_max_tokens: sanitized.provider.llmMaxTokens,
    embedding_provider: sanitized.embeddings.embeddingProvider,
    embedding_model: sanitized.embeddings.embeddingModel,
    embedding_base_url: sanitized.embeddings.embeddingBaseUrl,
    embedding_fallback_provider: sanitized.embeddings.fallbackProvider,
    embedding_fallback_model: sanitized.embeddings.fallbackModel,
    embedding_fallback_base_url: sanitized.embeddings.fallbackBaseUrl,
    embedding_vector_dimensions: sanitized.embeddings.vectorDimensions,
    embedding_schema_dimensions: sanitized.embeddings.schemaDimensions,
    embedding_reindex_required: reindexRequired,
    embedding_last_indexed_fingerprint: currentSettings?.embedding_last_indexed_fingerprint || nextEmbeddingFingerprint,
    embedding_last_indexed_at: currentSettings?.embedding_last_indexed_at || new Date().toISOString(),
    active_embedding_provider: currentSettings?.active_embedding_provider || currentSettings?.embedding_provider || sanitized.embeddings.embeddingProvider,
    active_embedding_model: currentSettings?.active_embedding_model || currentSettings?.embedding_model || sanitized.embeddings.embeddingModel,
    active_embedding_base_url: currentSettings?.active_embedding_base_url || currentSettings?.embedding_base_url || sanitized.embeddings.embeddingBaseUrl,
    active_embedding_vector_dimensions: currentSettings?.active_embedding_vector_dimensions ?? currentSettings?.embedding_vector_dimensions ?? sanitized.embeddings.vectorDimensions,
    active_embedding_schema_dimensions: currentSettings?.active_embedding_schema_dimensions ?? currentSettings?.embedding_schema_dimensions ?? sanitized.embeddings.schemaDimensions,
    active_embedding_generation_id: currentSettings?.active_embedding_generation_id || null,
    active_embedding_fingerprint: currentSettings?.active_embedding_fingerprint || currentEmbeddingFingerprint,
    active_embedding_activated_at: currentSettings?.active_embedding_activated_at || currentSettings?.embedding_last_indexed_at || new Date().toISOString(),
    embedding_pending_generation_id: embeddingConfigChanged ? (currentSettings?.embedding_pending_generation_id || nextEmbeddingFingerprint) : null,
    chat_similarity_expansion_enabled: sanitized.runtime.enableSimilarityExpansion,
    chat_strict_citations_default: sanitized.runtime.strictCitationsDefault,
    chat_ai_enabled: sanitized.runtime.aiEnabled,
    chat_history_limit: sanitized.runtime.historyLimit,
    chat_max_evidence_items: sanitized.runtime.maxEvidenceItems,
    chat_runtime_temperature: sanitized.runtime.temperature,
    chat_runtime_max_tokens: sanitized.runtime.maxTokens,
  };

  const { error: settingsError } = await client
    .from("app_settings")
    .upsert(settingsPayload, { onConflict: "id" });

  if (settingsError) {
    throw settingsError;
  }

  if (embeddingConfigChanged && reindexRequired) {
    try {
      await client.rpc("enqueue_search_index_job", {
        _job_type: "embed_stale_documents",
        _metadata: {
          reason: "embedding_config_changed",
          embeddingConfigFingerprint: nextEmbeddingFingerprint,
        },
      });
    } catch {
      // Older fallback schemas may not expose the backend-owned job RPC.
    }
  }

  if (sanitized.clearApiKey || typeof sanitized.apiKey === "string") {
    const { error: secretsError } = await client
      .from("app_setting_secrets")
      .upsert({
        id: 1,
        chat_llm_api_key: sanitized.clearApiKey ? null : sanitized.apiKey,
        deepseek_api_key: sanitized.providerKeys?.clearDeepseekApiKey ? null : sanitized.providerKeys?.deepseekApiKey,
        gemini_api_key: sanitized.providerKeys?.clearGeminiApiKey ? null : sanitized.providerKeys?.geminiApiKey,
        hf_api_key: sanitized.providerKeys?.clearHuggingFaceApiKey ? null : sanitized.providerKeys?.huggingFaceApiKey,
      }, { onConflict: "id" });

    if (secretsError) {
      throw secretsError;
    }
  } else if (
    sanitized.providerKeys?.clearDeepseekApiKey
    || sanitized.providerKeys?.clearGeminiApiKey
    || sanitized.providerKeys?.clearHuggingFaceApiKey
    || typeof sanitized.providerKeys?.deepseekApiKey === "string"
    || typeof sanitized.providerKeys?.geminiApiKey === "string"
    || typeof sanitized.providerKeys?.huggingFaceApiKey === "string"
  ) {
    const { error: secretsError } = await client
      .from("app_setting_secrets")
      .upsert({
        id: 1,
        deepseek_api_key: sanitized.providerKeys?.clearDeepseekApiKey ? null : sanitized.providerKeys?.deepseekApiKey,
        gemini_api_key: sanitized.providerKeys?.clearGeminiApiKey ? null : sanitized.providerKeys?.geminiApiKey,
        hf_api_key: sanitized.providerKeys?.clearHuggingFaceApiKey ? null : sanitized.providerKeys?.huggingFaceApiKey,
      }, { onConflict: "id" });

    if (secretsError) {
      throw secretsError;
    }
  }

  return loadAdminSettingsFromTables(client);
}

export async function fetchChatRuntimeSettings(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_chat_runtime_settings");

  if (error) {
    if (isSchemaMissingError(error)) {
      try {
        return await loadRuntimeSettingsFromTables(client);
      } catch (fallbackError) {
        if (!isSchemaMissingError(fallbackError) && !isUnauthorizedError(fallbackError)) {
          throw fallbackError;
        }
      }

      return defaultChatRuntimeSettings();
    }

    throw error;
  }

  return parseChatRuntimeSettings(data);
}

export async function fetchAdminChatSettings(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_admin_chat_settings");

  if (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("Admin access required");
    }

    if (isSchemaMissingError(error)) {
      try {
        return await loadAdminSettingsFromTables(client);
      } catch (fallbackError) {
        if (isUnauthorizedError(fallbackError)) {
          throw new Error("Admin access required");
        }

        if (!isSchemaMissingError(fallbackError)) {
          throw fallbackError;
        }

        return mapRowsToAdminChatSettings(null, null);
      }
    }

    throw error;
  }

  return parseAdminChatSettings(data);
}

export async function updateAdminChatSettings(
  client: AppSupabaseClient,
  input: AdminChatSettingsUpdateInput,
) {
  const sanitized = sanitizeAdminChatSettingsInput(input);
  const { data, error } = await client.rpc("update_admin_chat_settings", {
    _settings: {
      provider: {
        llmProvider: sanitized.provider.llmProvider,
        llmModel: sanitized.provider.llmModel,
        llmBaseUrl: sanitized.provider.llmBaseUrl,
        llmTemperature: sanitized.provider.llmTemperature,
        llmMaxTokens: sanitized.provider.llmMaxTokens,
      },
      embeddings: {
        embeddingProvider: sanitized.embeddings.embeddingProvider,
        embeddingModel: sanitized.embeddings.embeddingModel,
        embeddingBaseUrl: sanitized.embeddings.embeddingBaseUrl,
        fallbackProvider: sanitized.embeddings.fallbackProvider,
        fallbackModel: sanitized.embeddings.fallbackModel,
        fallbackBaseUrl: sanitized.embeddings.fallbackBaseUrl,
        vectorDimensions: sanitized.embeddings.vectorDimensions,
        schemaDimensions: sanitized.embeddings.schemaDimensions,
      },
      providerKeys: sanitized.providerKeys,
      runtime: {
        aiEnabled: sanitized.runtime.aiEnabled,
        enableSimilarityExpansion: sanitized.runtime.enableSimilarityExpansion,
        strictCitationsDefault: sanitized.runtime.strictCitationsDefault,
        historyLimit: sanitized.runtime.historyLimit,
        maxEvidenceItems: sanitized.runtime.maxEvidenceItems,
        temperature: sanitized.runtime.temperature,
        maxTokens: sanitized.runtime.maxTokens,
      },
    },
    _api_key: sanitized.apiKey,
    _clear_api_key: sanitized.clearApiKey,
  });

  if (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("Admin access required");
    }

    if (isSchemaMissingError(error)) {
      return updateAdminSettingsThroughTables(client, sanitized);
    }

    throw error;
  }

  return parseAdminChatSettings(data);
}
