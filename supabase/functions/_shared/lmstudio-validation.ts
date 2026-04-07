export interface LmStudioModelsFetchResult {
  ok: boolean;
  reachable: boolean;
  responseValid: boolean;
  baseUrl: string;
  modelIds: string[];
  message: string;
}

export interface LmStudioValidationRequest {
  baseUrl: string | null;
  chatModel: string | null;
  embeddingModel: string | null;
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

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/$/, "") : null;
}

function isValidModelsPayload(payload: unknown): payload is { data: Array<{ id: string }> } {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return false;
  }

  return (payload as { data: unknown[] }).data.every((entry) =>
    entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
  );
}

export async function fetchLmStudioModels(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LmStudioModelsFetchResult> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return {
      ok: false,
      reachable: false,
      responseValid: false,
      baseUrl: baseUrl || "",
      modelIds: [],
      message: "LM Studio base URL is missing.",
    };
  }

  const requestTarget = `${normalizedBaseUrl}/models`;

  try {
    const response = await fetchImpl(requestTarget, {
      method: "GET",
    });

    if (!response.ok) {
      return {
        ok: false,
        reachable: true,
        responseValid: false,
        baseUrl: normalizedBaseUrl,
        modelIds: [],
        message: `LM Studio check failed (${response.status}) at ${requestTarget}.`,
      };
    }

    const payload = await response.json();

    if (!isValidModelsPayload(payload)) {
      return {
        ok: false,
        reachable: true,
        responseValid: false,
        baseUrl: normalizedBaseUrl,
        modelIds: [],
        message: "LM Studio returned an invalid /models response.",
      };
    }

    return {
      ok: true,
      reachable: true,
      responseValid: true,
      baseUrl: normalizedBaseUrl,
      modelIds: payload.data.map((entry) => entry.id),
      message: `Connected to LM Studio. ${payload.data.length} models available.`,
    };
  } catch (_error) {
    return {
      ok: false,
      reachable: false,
      responseValid: false,
      baseUrl: normalizedBaseUrl,
      modelIds: [],
      message: `LM Studio is unreachable at ${requestTarget}.`,
    };
  }
}

function buildModelMessage(label: "chat" | "embedding", selectedModel: string | null, modelIds: string[]) {
  if (!selectedModel?.trim()) {
    return {
      found: false,
      message: `Select an LM Studio ${label} model before validating this configuration.`,
    };
  }

  if (!modelIds.includes(selectedModel)) {
    return {
      found: false,
      message: `Configured ${label} model '${selectedModel}' is not available.`,
    };
  }

  return {
    found: true,
    message: `${label === "chat" ? "Chat" : "Embedding"} model is available on LM Studio.`,
  };
}

export async function validateLmStudioConnection(
  input: LmStudioValidationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LmStudioValidationResponse> {
  const connection = await fetchLmStudioModels(input.baseUrl || "", fetchImpl);

  if (!connection.ok) {
    return {
      ok: false,
      reachable: connection.reachable,
      responseValid: connection.responseValid,
      baseUrl: connection.baseUrl,
      models: [],
      selectedChatModelFound: false,
      selectedEmbeddingModelFound: false,
      message: connection.message,
      chatModelMessage: input.chatModel ? "Unable to validate the chat model until LM Studio responds." : null,
      embeddingModelMessage: input.embeddingModel ? "Unable to validate the embedding model until LM Studio responds." : null,
    };
  }

  const chatModel = buildModelMessage("chat", input.chatModel, connection.modelIds);
  const embeddingModel = buildModelMessage("embedding", input.embeddingModel, connection.modelIds);

  return {
    ok: true,
    reachable: true,
    responseValid: true,
    baseUrl: connection.baseUrl,
    models: connection.modelIds,
    selectedChatModelFound: chatModel.found,
    selectedEmbeddingModelFound: embeddingModel.found,
    message: connection.message,
    chatModelMessage: chatModel.message,
    embeddingModelMessage: embeddingModel.message,
  };
}
