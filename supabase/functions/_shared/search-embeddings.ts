import type { EmbeddingProvider } from "../../../src/lib/ai/provider-types.ts";
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

export function hasEmbeddingProvider() {
  const config = readSearchEmbeddingConfig();
  return config.providers.some((provider) => provider.provider === "local" || Boolean(provider.apiKey));
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
      return "local://embedding";
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
) {
  const response = await fetch(`${provider.baseUrl}/v1/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
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
  input: string[],
  dimensions: number,
) {
  const embeddings = input.map((text) => {
    const seed = sanitizeEmbeddingInput(text);
    const vector = Array.from({ length: dimensions }, (_, index) => {
      const code = seed.charCodeAt(index % Math.max(seed.length, 1)) || 0;
      return ((code % 31) - 15) / 15;
    });
    return vector;
  });

  return {
    embeddings,
    metadata: {
      ...describeEmbeddingOutput(embeddings),
      requestTarget: "local://embedding",
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
      return embedWithLocal(input, dimensions);
    default:
      throw new Error(`Unsupported embedding provider: ${provider.provider}`);
  }
}

export async function embedTexts(
  input: string[],
  options?: Parameters<typeof readSearchEmbeddingConfig>[0],
) {
  const env = options?.env || (typeof Deno !== "undefined" ? Deno.env.toObject() : {});
  const config = readSearchEmbeddingConfig(options);
  const attempts: Array<{ provider: EmbeddingProvider; error?: string }> = [];
  const configuredProviders = config.providers.filter((provider) => {
    if (!provider.model) {
      return false;
    }

    if (provider.provider === "local") {
      return true;
    }

    return Boolean(provider.apiKey);
  });

  if (configuredProviders.length === 0) {
    const primaryProvider = config.primary.provider;
    const geminiKeyExists = Boolean(
      options?.secrets?.gemini_api_key
      || env.GEMINI_API_KEY
      || env.GOOGLE_API_KEY,
    );

    console.warn("embedding_provider_not_configured", {
      provider: primaryProvider,
      model: config.primary.model,
      geminiKeyExists,
      requestTarget: buildEmbeddingRequestTarget(config.primary),
    });
    const configurationError = primaryProvider === "gemini"
      ? "Gemini embedding provider not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY."
      : `Embedding provider not configured for ${primaryProvider}.`;

    return {
      embeddings: [] as number[][],
      model: null as string | null,
      providerConfigured: false,
      providerUsed: null as EmbeddingProvider | null,
      configurationError,
    };
  }

  for (const provider of configuredProviders) {
    try {
      console.info("embedding_provider_attempt", {
        provider: provider.provider,
        model: provider.model,
        hasApiKey: Boolean(provider.apiKey),
        geminiKeyExists: provider.provider === "gemini",
        requestTarget: buildEmbeddingRequestTarget(provider),
        inputCount: input.length,
      });
      const { embeddings, metadata } = await embedWithProvider(provider, input, config.vectorDimensions);
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
        embeddings: embeddings.map((vector) => normalizeVectorLength(vector, config.vectorDimensions)),
        model: provider.model,
        providerConfigured: true,
        providerUsed: provider.provider,
        configurationError: null,
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
