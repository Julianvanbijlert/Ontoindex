import type { AdminChatSettings } from "@/lib/chat/types";

export type LmStudioValidationStatus = "idle" | "success" | "warning" | "error" | "not_applicable";

export interface LmStudioConnectionStatus {
  status: LmStudioValidationStatus;
  message: string | null;
  modelIds: string[];
  baseUrl: string | null;
}

export interface LmStudioModelStatus {
  status: LmStudioValidationStatus;
  message: string | null;
}

export interface LmStudioSettingsValidationResult {
  connection: LmStudioConnectionStatus;
  chatModel: LmStudioModelStatus;
  embeddingModel: LmStudioModelStatus;
}

export interface LmStudioValidationResponse {
  ok: boolean;
  reachable: boolean;
  responseValid: boolean;
  baseUrl: string;
  models: string[];
  selectedChatModelFound: boolean;
  selectedEmbeddingModelFound: boolean;
  message: string;
  chatModelMessage: string | null;
  embeddingModelMessage: string | null;
}

export interface LmStudioValidationClient {
  functions: {
    invoke(
      functionName: "validate-lmstudio",
      options: {
        body: {
          baseUrl: string;
          chatModel: string | null;
          embeddingModel: string | null;
        };
      },
    ): Promise<{
      data: LmStudioValidationResponse | null;
      error: { message?: string } | null;
    }>;
  };
}

function normalizeValidationServiceError(message: string | null | undefined) {
  const normalized = message?.trim();

  if (!normalized) {
    return "LM Studio validation service unavailable.";
  }

  const lower = normalized.toLowerCase();

  if (
    lower.includes("admin access required")
    || lower.includes("unauthorized")
    || lower.includes("401")
    || lower.includes("403")
  ) {
    return "Admin access is required to validate LM Studio settings.";
  }

  if (lower.includes("non-2xx")) {
    return "LM Studio validation service unavailable.";
  }

  return normalized;
}

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/$/, "") : null;
}

function buildIdleResult(): LmStudioSettingsValidationResult {
  return {
    connection: {
      status: "idle",
      message: null,
      modelIds: [],
      baseUrl: null,
    },
    chatModel: {
      status: "not_applicable",
      message: null,
    },
    embeddingModel: {
      status: "not_applicable",
      message: null,
    },
  };
}

function buildUnavailableResult(
  message: string,
  baseUrl: string | null,
  chatEnabled: boolean,
  embeddingEnabled: boolean,
): LmStudioSettingsValidationResult {
  return {
    connection: {
      status: "error",
      message,
      modelIds: [],
      baseUrl,
    },
    chatModel: {
      status: chatEnabled ? "error" : "not_applicable",
      message: chatEnabled ? "Unable to validate the chat model until LM Studio responds." : null,
    },
    embeddingModel: {
      status: embeddingEnabled ? "error" : "not_applicable",
      message: embeddingEnabled ? "Unable to validate the embedding model until LM Studio responds." : null,
    },
  };
}

function toModelStatus(
  enabled: boolean,
  found: boolean,
  message: string | null,
): LmStudioModelStatus {
  if (!enabled) {
    return {
      status: "not_applicable",
      message: null,
    };
  }

  return {
    status: found ? "success" : "warning",
    message,
  };
}

export async function validateLmStudioSettings(
  client: LmStudioValidationClient,
  settings: AdminChatSettings,
): Promise<LmStudioSettingsValidationResult> {
  const chatEnabled = settings.provider.llmProvider === "lmstudio";
  const embeddingEnabled = settings.embeddings.embeddingProvider === "lmstudio";

  if (!chatEnabled && !embeddingEnabled) {
    return buildIdleResult();
  }

  const baseUrl = normalizeBaseUrl(
    settings.provider.llmBaseUrl || settings.embeddings.embeddingBaseUrl,
  );

  if (!baseUrl) {
    return buildUnavailableResult("LM Studio base URL is missing.", baseUrl, chatEnabled, embeddingEnabled);
  }

  const { data, error } = await client.functions.invoke("validate-lmstudio", {
    body: {
      baseUrl,
      chatModel: chatEnabled ? settings.provider.llmModel?.trim() || null : null,
      embeddingModel: embeddingEnabled ? settings.embeddings.embeddingModel?.trim() || null : null,
    },
  });

  if (error || !data) {
    return buildUnavailableResult(
      normalizeValidationServiceError(error?.message),
      baseUrl,
      chatEnabled,
      embeddingEnabled,
    );
  }

  return {
    connection: {
      status: data.ok ? "success" : "error",
      message: data.message,
      modelIds: data.models,
      baseUrl: data.baseUrl,
    },
    chatModel: toModelStatus(chatEnabled, data.selectedChatModelFound, data.chatModelMessage),
    embeddingModel: toModelStatus(embeddingEnabled, data.selectedEmbeddingModelFound, data.embeddingModelMessage),
  };
}
