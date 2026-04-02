import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_PROVIDER,
  defaultEmbeddingBaseUrlForProvider,
  defaultEmbeddingModelForProvider,
  normalizeEmbeddingProvider,
} from "@/lib/ai/provider-factory";
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
  | "chat_history_limit"
  | "chat_llm_max_tokens"
  | "chat_llm_temperature"
  | "chat_max_evidence_items"
  | "chat_runtime_max_tokens"
  | "chat_runtime_temperature"
  | "chat_similarity_expansion_enabled"
  | "chat_strict_citations_default"
>;

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

export function defaultChatRuntimeSettings(): ChatRuntimeSettings {
  return {
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
  const providerKeys = source.providerKeys && typeof source.providerKeys === "object" && !Array.isArray(source.providerKeys)
    ? source.providerKeys as Record<string, unknown>
    : {};
  const runtime = source.runtime && typeof source.runtime === "object" && !Array.isArray(source.runtime)
    ? source.runtime as Record<string, unknown>
    : {};

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
      embeddingProvider: normalizeEmbeddingProvider(coerceString(embeddings.embeddingProvider, DEFAULT_EMBEDDING_PROVIDER)),
      embeddingModel: coerceString(
        embeddings.embeddingModel,
        defaultEmbeddingModelForProvider(coerceString(embeddings.embeddingProvider, DEFAULT_EMBEDDING_PROVIDER)),
      ) || (defaultEmbeddingModelForProvider(coerceString(embeddings.embeddingProvider, DEFAULT_EMBEDDING_PROVIDER)) || ""),
      embeddingBaseUrl: coerceString(
        embeddings.embeddingBaseUrl,
        defaultEmbeddingBaseUrlForProvider(coerceString(embeddings.embeddingProvider, DEFAULT_EMBEDDING_PROVIDER)),
      ),
      fallbackProvider: coerceString(embeddings.fallbackProvider, "huggingface"),
      fallbackModel: coerceString(
        embeddings.fallbackModel,
        defaultEmbeddingModelForProvider(coerceString(embeddings.fallbackProvider, "huggingface")),
      ),
      fallbackBaseUrl: coerceString(
        embeddings.fallbackBaseUrl,
        defaultEmbeddingBaseUrlForProvider(coerceString(embeddings.fallbackProvider, "huggingface")),
      ),
      vectorDimensions: Math.max(1, Math.round(coerceNumber(embeddings.vectorDimensions, DEFAULT_EMBEDDING_DIMENSIONS))),
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
      vectorDimensions: Math.max(
        1,
        Math.round(Number.isFinite(input.embeddings.vectorDimensions) ? input.embeddings.vectorDimensions : DEFAULT_EMBEDDING_DIMENSIONS),
      ),
    },
    runtime: {
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
) {
  const llmProvider = normalizeLlmProviderName(settingsRow?.chat_llm_provider || DEFAULT_LLM_PROVIDER);

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
      embeddingProvider: settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER,
      embeddingModel: settingsRow?.embedding_model || defaultEmbeddingModelForProvider(settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER),
      embeddingBaseUrl: settingsRow?.embedding_base_url || defaultEmbeddingBaseUrlForProvider(settingsRow?.embedding_provider || DEFAULT_EMBEDDING_PROVIDER),
      fallbackProvider: settingsRow?.embedding_fallback_provider || "huggingface",
      fallbackModel: settingsRow?.embedding_fallback_model || defaultEmbeddingModelForProvider(settingsRow?.embedding_fallback_provider || "huggingface"),
      fallbackBaseUrl: settingsRow?.embedding_fallback_base_url || defaultEmbeddingBaseUrlForProvider(settingsRow?.embedding_fallback_provider || "huggingface"),
      vectorDimensions: settingsRow?.embedding_vector_dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS,
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
    chat_similarity_expansion_enabled: sanitized.runtime.enableSimilarityExpansion,
    chat_strict_citations_default: sanitized.runtime.strictCitationsDefault,
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
      },
      providerKeys: sanitized.providerKeys,
      runtime: {
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
