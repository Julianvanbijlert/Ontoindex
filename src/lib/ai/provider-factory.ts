import type { ChatProvider, EmbeddingProvider } from "./provider-types.ts";

type EnvSource = Record<string, string | undefined>;

export const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "gemini";
export const DEFAULT_CHAT_PROVIDER: ChatProvider = "gemini";
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
export const DEFAULT_EMBEDDING_FALLBACK_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-2.0-flash";
export const DEFAULT_DEEPSEEK_CHAT_MODEL = "deepseek-chat";
export const DEFAULT_CHAT_MODEL = DEFAULT_GEMINI_CHAT_MODEL;
export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_HUGGINGFACE_BASE_URL = "https://api-inference.huggingface.co/models";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

const runtimeProcessEnv: EnvSource = typeof process !== "undefined"
  ? (process.env as EnvSource)
  : {};

export function normalizeEmbeddingProvider(value: string | null | undefined): EmbeddingProvider {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "gemini":
    case "deepseek":
    case "huggingface":
    case "local":
      return normalized;
    default:
      return DEFAULT_EMBEDDING_PROVIDER;
  }
}

export function normalizeChatProvider(value: string | null | undefined): ChatProvider {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "deepseek":
    case "gemini":
    case "mock":
      return normalized;
    default:
      return DEFAULT_CHAT_PROVIDER;
  }
}

export function getEmbeddingProvider(env: EnvSource = runtimeProcessEnv): EmbeddingProvider {
  return normalizeEmbeddingProvider(env.EMBEDDING_PROVIDER || env.SEARCH_EMBEDDING_PROVIDER);
}

export function getChatProvider(env: EnvSource = runtimeProcessEnv): ChatProvider {
  return normalizeChatProvider(env.LLM_PROVIDER);
}

export function defaultEmbeddingBaseUrlForProvider(provider: string | null | undefined) {
  switch (normalizeEmbeddingProvider(provider)) {
    case "gemini":
      return DEFAULT_GEMINI_BASE_URL;
    case "deepseek":
      return DEFAULT_DEEPSEEK_BASE_URL;
    case "huggingface":
      return DEFAULT_HUGGINGFACE_BASE_URL;
    case "local":
      return null;
    default:
      return DEFAULT_GEMINI_BASE_URL;
  }
}

export function defaultEmbeddingModelForProvider(provider: string | null | undefined) {
  switch (normalizeEmbeddingProvider(provider)) {
    case "gemini":
      return DEFAULT_EMBEDDING_MODEL;
    case "huggingface":
      return DEFAULT_EMBEDDING_FALLBACK_MODEL;
    default:
      return null;
  }
}

export function defaultChatBaseUrlForProvider(provider: string | null | undefined) {
  switch (normalizeChatProvider(provider)) {
    case "deepseek":
      return DEFAULT_DEEPSEEK_BASE_URL;
    case "gemini":
      return DEFAULT_GEMINI_BASE_URL;
    case "mock":
      return null;
    default:
      return DEFAULT_GEMINI_BASE_URL;
  }
}

export function defaultChatModelForProvider(provider: string | null | undefined) {
  switch (normalizeChatProvider(provider)) {
    case "deepseek":
      return DEFAULT_DEEPSEEK_CHAT_MODEL;
    case "gemini":
      return DEFAULT_GEMINI_CHAT_MODEL;
    case "mock":
      return "mock-grounded-chat";
    default:
      return DEFAULT_CHAT_MODEL;
  }
}

export function normalizeBaseUrl(value: string | null | undefined, fallback: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/$/, "") : fallback;
}

export function normalizeEmbeddingDimensions(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }

  return Math.max(1, Math.trunc(value as number));
}
