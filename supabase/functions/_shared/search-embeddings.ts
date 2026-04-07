import type { EmbeddingModelInfo, EmbeddingProviderClient } from "../../../src/lib/ai/embedding-provider.ts";
import type { EmbeddingProvider } from "../../../src/lib/ai/provider-types.ts";
import { resolveEmbeddingDimensionCompatibility } from "../../../src/lib/ai/embedding-dimensions.ts";
import {
  readSearchEmbeddingConfig,
  type SearchEmbeddingProviderRuntimeConfig,
} from "./search-ai-config.ts";

interface OpenAiCompatibleEmbeddingResponsePayload {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

interface GeminiBatchEmbeddingResponsePayload {
  embeddings?: Array<{
    values?: number[];
  }>;
}

interface EmbeddingExecutionMetadata {
  requestTarget: string | null;
  embeddingCount: number;
  firstEmbeddingLength: number;
}

function getEmbeddingConfigurationError(provider: SearchEmbeddingProviderRuntimeConfig) {
  if (!provider.model) {
    return `Embedding provider ${provider.provider} is missing a model configuration.`;
  }

  switch (provider.provider) {
    case "local":
      return provider.baseUrl ? null : "Local embedding provider requires a base URL for an OpenAI-compatible /embeddings endpoint.";
    case "lmstudio":
      if (!provider.baseUrl) {
        return "LM Studio embedding provider requires a base URL for an OpenAI-compatible /embeddings endpoint.";
      }
      return null;
    case "gemini":
      return provider.apiKey ? null : "Gemini embedding provider not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.";
    case "deepseek":
      return provider.apiKey ? null : "DeepSeek embedding provider not configured. Set DEEPSEEK_API_KEY.";
    case "huggingface":
      return provider.apiKey ? null : "HuggingFace embedding provider not configured. Set HF_API_KEY.";
    default:
      return `Embedding provider ${provider.provider} is not configured.`;
  }
}

export function hasEmbeddingProvider() {
  const config = readSearchEmbeddingConfig();
  return config.providers.some((provider) => !getEmbeddingConfigurationError(provider));
}

export function toVectorString(vector: number[]) {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

function sanitizeEmbeddingInput(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 6000 ? collapsed.slice(0, 6000) : collapsed || " ";
}

function normalizeVectorLength(vector: number[], dimensions: number) {
  const safe = vector.map((value) => (Number.isFinite(value) ? value : 0));

  if (safe.length === dimensions) {
    return safe;
  }

  if (safe.length > dimensions) {
    return safe.slice(0, dimensions);
  }

  return [...safe, ...Array.from({ length: dimensions - safe.length }, () => 0)];
}

function buildEmbeddingRequestTarget(provider: SearchEmbeddingProviderRuntimeConfig) {
  if (!provider.baseUrl || !provider.model) {
    return null;
  }

  switch (provider.provider) {
    case "gemini":
      return `${provider.baseUrl}/models/${provider.model}:batchEmbedContents`;
    case "deepseek":
      return `${provider.baseUrl}/v1/embeddings`;
    case "huggingface":
      return `${provider.baseUrl}/${provider.model}`;
    case "local":
    case "lmstudio":
      return provider.baseUrl ? `${provider.baseUrl}/embeddings` : null;
    default:
      return provider.baseUrl;
  }
}

function describeEmbeddingOutput(embeddings: number[][]): EmbeddingExecutionMetadata {
  return {
    requestTarget: null,
    embeddingCount: embeddings.length,
    firstEmbeddingLength: embeddings[0]?.length || 0,
  };
}

async function embedWithOpenAiCompatible(
  provider: SearchEmbeddingProviderRuntimeConfig,
  input: string[],
  options?: {
    includeAuthorizationHeader?: boolean;
  },
) {
  const requestTarget = buildEmbeddingRequestTarget(provider);

  if (!requestTarget) {
    throw new Error(getEmbeddingConfigurationError(provider) || `Embedding provider ${provider.provider} is not configured.`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.includeAuthorizationHeader !== false && provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const response = await fetch(requestTarget, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      input: input.map(sanitizeEmbeddingInput),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(JSON.stringify({
      provider: provider.provider,
      status: response.status,
      message,
    }));
  }

  const payload = await response.json() as OpenAiCompatibleEmbeddingResponsePayload;

  const embeddings = payload.data
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.embedding);

  return {
    embeddings,
    metadata: {
      ...describeEmbeddingOutput(embeddings),
      requestTarget,
    },
  };
}

async function embedWithGemini(
  provider: SearchEmbeddingProviderRuntimeConfig,
  input: string[],
  dimensions: number,
) {
  const response = await fetch(`${provider.baseUrl}/models/${provider.model}:batchEmbedContents?key=${encodeURIComponent(provider.apiKey || "")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: input.map((text) => ({
        model: `models/${provider.model}`,
        content: {
          parts: [{ text: sanitizeEmbeddingInput(text) }],
        },
        outputDimensionality: dimensions,
      })),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(JSON.stringify({
      provider: provider.provider,
      status: response.status,
      message,
    }));
  }

  const payload = await response.json() as GeminiBatchEmbeddingResponsePayload;
  const embeddings = (payload.embeddings || []).map((entry) => entry.values || []);

  return {
    embeddings,
    metadata: {
      ...describeEmbeddingOutput(embeddings),
      requestTarget: buildEmbeddingRequestTarget(provider),
    },
  };
}

function normalizeHuggingFaceEmbeddingPayload(payload: unknown, expectedSize: number) {
  if (!Array.isArray(payload)) {
    return [];
  }

  if (payload.length > 0 && Array.isArray(payload[0])) {
    return payload
      .map((entry) => Array.isArray(entry) ? entry.filter((value): value is number => typeof value === "number") : [])
      .slice(0, expectedSize);
  }

  return [
    payload.filter((value): value is number => typeof value === "number"),
  ];
}

async function embedWithHuggingFace(
  provider: SearchEmbeddingProviderRuntimeConfig,
  input: string[],
) {
  const response = await fetch(`${provider.baseUrl}/${provider.model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: input.map(sanitizeEmbeddingInput),
      options: {
        wait_for_model: true,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(JSON.stringify({
      provider: provider.provider,
      status: response.status,
      message,
    }));
  }

  const embeddings = normalizeHuggingFaceEmbeddingPayload(await response.json(), input.length);

  return {
    embeddings,
    metadata: {
      ...describeEmbeddingOutput(embeddings),
      requestTarget: buildEmbeddingRequestTarget(provider),
    },
  };
}

async function embedWithLocal(
  provider: SearchEmbeddingProviderRuntimeConfig,
  input: string[],
) {
  if (!provider.baseUrl || !provider.model) {
    throw new Error(getEmbeddingConfigurationError(provider) || "Local embedding provider is not configured.");
  }

  const response = await fetch(`${provider.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      input: input.map(sanitizeEmbeddingInput),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(JSON.stringify({
      provider: provider.provider,
      status: response.status,
      message,
    }));
  }

  const payload = await response.json() as OpenAiCompatibleEmbeddingResponsePayload;
  const embeddings = payload.data
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.embedding);

  return {
    embeddings,
    metadata: {
      ...describeEmbeddingOutput(embeddings),
      requestTarget: buildEmbeddingRequestTarget(provider),
    },
  };
}

async function embedWithProvider(
  provider: SearchEmbeddingProviderRuntimeConfig,
  input: string[],
  dimensions: number,
) {
  switch (provider.provider) {
    case "gemini":
      return embedWithGemini(provider, input, dimensions);
    case "deepseek":
      return embedWithOpenAiCompatible(provider, input);
    case "huggingface":
      return embedWithHuggingFace(provider, input);
    case "local":
      return embedWithLocal(provider, input);
    case "lmstudio":
      return embedWithOpenAiCompatible(provider, input, {
        includeAuthorizationHeader: false,
      });
    default:
      throw new Error(`Unsupported embedding provider: ${provider.provider}`);
  }
}

function buildEmbeddingModelInfo(input: {
  provider: EmbeddingProvider | null;
  model: string | null;
  configuredDimensions: number;
  storageDimensions: number;
}): EmbeddingModelInfo {
  return {
    provider: input.provider || "unknown",
    model: input.model,
    dimensions: input.configuredDimensions,
    storageDimensions: input.storageDimensions,
  };
}

export function createEmbeddingProviderClient(
  options?: Parameters<typeof readSearchEmbeddingConfig>[0],
  target: "active" | "selected" = "active",
): EmbeddingProviderClient {
  const env = options?.env || (
    typeof globalThis !== "undefined" && "Deno" in globalThis
      ? (globalThis as { Deno?: { env: { toObject(): Record<string, string | undefined> } } }).Deno?.env.toObject() || {}
      : {}
  );
  const config = readSearchEmbeddingConfig(options);
  const resolvedConfig = target === "selected" ? config.selected : config.active;
  const configuredDimensions = resolvedConfig.vectorDimensions;
  const storageDimensions = resolvedConfig.schemaDimensions;
  const dimensionCompatibility = resolveEmbeddingDimensionCompatibility(configuredDimensions, storageDimensions);

  if (configuredDimensions !== storageDimensions) {
    console.warn("embedding_dimensions_mismatch", {
      configuredDimensions,
      storageDimensions,
      note: "Adjust SEARCH_EMBEDDING_SCHEMA_DIMENSIONS if the database vector size changed.",
    });
  }

  return {
    getModelInfo: () =>
      buildEmbeddingModelInfo({
        provider: resolvedConfig.primary.provider,
        model: resolvedConfig.primary.model,
        configuredDimensions,
        storageDimensions,
      }),
    embedQuery: async (text: string) => {
      const result = await embedTexts([text], options, target);
      return {
        embedding: result.embeddings[0] || [],
        info: buildEmbeddingModelInfo({
          provider: result.providerUsed || resolvedConfig.primary.provider,
          model: result.model || resolvedConfig.primary.model || null,
          configuredDimensions: result.configuredDimensions,
          storageDimensions: result.storageDimensions,
        }),
        providerConfigured: result.providerConfigured,
        providerUsed: result.providerUsed,
        configurationError: result.configurationError || null,
        dimensionCompatibility: result.dimensionCompatibility || dimensionCompatibility,
      };
    },
    embedDocuments: async (texts: string[]) => {
      const result = await embedTexts(texts, options, target);
      return {
        embeddings: result.embeddings,
        info: buildEmbeddingModelInfo({
          provider: result.providerUsed || resolvedConfig.primary.provider,
          model: result.model || resolvedConfig.primary.model || null,
          configuredDimensions: result.configuredDimensions,
          storageDimensions: result.storageDimensions,
        }),
        providerConfigured: result.providerConfigured,
        providerUsed: result.providerUsed,
        configurationError: result.configurationError || null,
        dimensionCompatibility: result.dimensionCompatibility || dimensionCompatibility,
      };
    },
  };
}

export async function embedTexts(
  input: string[],
  options?: Parameters<typeof readSearchEmbeddingConfig>[0],
  target: "active" | "selected" = "active",
) {
  const env = options?.env || (
    typeof globalThis !== "undefined" && "Deno" in globalThis
      ? (globalThis as { Deno?: { env: { toObject(): Record<string, string | undefined> } } }).Deno?.env.toObject() || {}
      : {}
  );
  const config = readSearchEmbeddingConfig(options);
  const resolvedConfig = target === "selected" ? config.selected : config.active;
  const configuredDimensions = resolvedConfig.vectorDimensions;
  const storageDimensions = resolvedConfig.schemaDimensions;
  const dimensionCompatibility = resolveEmbeddingDimensionCompatibility(configuredDimensions, storageDimensions);
  const shouldWarnDimensions = dimensionCompatibility.mismatch;
  const aiEnabled = options?.settings?.chat_ai_enabled;
  const attempts: Array<{ provider: EmbeddingProvider; error?: string }> = [];
  const configuredProviders = resolvedConfig.providers.filter((provider) => !getEmbeddingConfigurationError(provider));

  if (aiEnabled === false) {
    return {
      embeddings: [] as number[][],
      model: null as string | null,
      providerConfigured: false,
      providerUsed: null as EmbeddingProvider | null,
      configurationError: "AI features are disabled by admin settings.",
      configuredDimensions,
      storageDimensions,
      dimensionCompatibility,
    };
  }

  if (configuredProviders.length === 0) {
    const primaryProvider = resolvedConfig.primary.provider;
    const primaryConfigurationError = getEmbeddingConfigurationError(resolvedConfig.primary);
    const geminiKeyExists = Boolean(
      options?.secrets?.gemini_api_key
      || env.GEMINI_API_KEY
      || env.GOOGLE_API_KEY,
    );

    console.warn("embedding_provider_not_configured", {
      provider: primaryProvider,
      model: resolvedConfig.primary.model,
      geminiKeyExists,
      requestTarget: buildEmbeddingRequestTarget(resolvedConfig.primary),
      configurationError: primaryConfigurationError,
    });
    const configurationError = primaryConfigurationError
      || (primaryProvider === "gemini"
        ? "Gemini embedding provider not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY."
        : `Embedding provider not configured for ${primaryProvider}.`);

    return {
      embeddings: [] as number[][],
      model: null as string | null,
      providerConfigured: false,
      providerUsed: null as EmbeddingProvider | null,
      configurationError,
      configuredDimensions,
      storageDimensions,
      dimensionCompatibility,
    };
  }

  if (shouldWarnDimensions) {
    console.warn("embedding_dimensions_mismatch", {
      configuredDimensions,
      storageDimensions,
      note: "Embedding vectors will be padded or truncated to match storage dimensions.",
    });
  }

  for (const provider of configuredProviders) {
    try {
      const configurationError = getEmbeddingConfigurationError(provider);

      if (configurationError) {
        attempts.push({
          provider: provider.provider,
          error: configurationError,
        });
        console.warn("embedding_provider_skipped", {
          provider: provider.provider,
          model: provider.model,
          requestTarget: buildEmbeddingRequestTarget(provider),
          configurationError,
        });
        continue;
      }

      console.info("embedding_provider_attempt", {
        provider: provider.provider,
        model: provider.model,
        hasApiKey: Boolean(provider.apiKey),
        geminiKeyExists: provider.provider === "gemini",
        requestTarget: buildEmbeddingRequestTarget(provider),
        inputCount: input.length,
      });
      const { embeddings, metadata } = await embedWithProvider(provider, input, configuredDimensions);
      console.info("embedding_provider_used", {
        provider: provider.provider,
        model: provider.model,
        hasApiKey: Boolean(provider.apiKey),
        geminiKeyExists: provider.provider === "gemini" && Boolean(provider.apiKey),
        requestTarget: metadata.requestTarget,
        parsedEmbeddingCount: metadata.embeddingCount,
        firstEmbeddingVectorLength: metadata.firstEmbeddingLength,
      });
      return {
        embeddings: embeddings.map((vector) => normalizeVectorLength(vector, storageDimensions)),
        model: provider.model,
        providerConfigured: true,
        providerUsed: provider.provider,
        configurationError: null,
        configuredDimensions,
        storageDimensions,
        dimensionCompatibility,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        provider: provider.provider,
        error: message,
      });
      console.error("embedding_request_failed", {
        provider: provider.provider,
        model: provider.model,
        hasApiKey: Boolean(provider.apiKey),
        geminiKeyExists: provider.provider === "gemini" && Boolean(provider.apiKey),
        requestTarget: buildEmbeddingRequestTarget(provider),
        message,
      });
    }
  }

  throw new Error(`Embedding request failed: ${JSON.stringify({
    attemptedProviders: attempts,
  })}`);
}
