import {
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_CHAT_MODEL,
  DEFAULT_LMSTUDIO_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  defaultChatModelForProvider,
  normalizeBaseUrl,
} from "../ai/provider-factory.ts";
import type { ChatProvider } from "../ai/provider-types.ts";

export const DEFAULT_LLM_PROVIDER: ChatProvider = "gemini";
export const DEFAULT_LLM_MODEL = DEFAULT_CHAT_MODEL;
export const DEFAULT_MOCK_LLM_MODEL = "mock-grounded-chat";
export const DEFAULT_OPENAI_LLM_MODEL = "gpt-4.1-mini";
export const DEFAULT_OPENAI_COMPATIBLE_LLM_MODEL = DEFAULT_OPENAI_LLM_MODEL;
export const DEFAULT_ANTHROPIC_LLM_MODEL = "claude-3-5-sonnet-latest";

export const SUPPORTED_LLM_PROVIDERS = [
  "deepseek",
  "gemini",
  "mock",
  "openai",
  "openai-compatible",
  "anthropic",
  "lmstudio",
] as const;

export type SupportedLlmProvider = (typeof SUPPORTED_LLM_PROVIDERS)[number];

export interface LlmProviderRuntimeConfig {
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeySource?: string | null;
  temperature: number;
  maxTokens: number;
}

export function normalizeLlmProviderName(value: string | null | undefined): SupportedLlmProvider {
  const normalized = value?.trim().toLowerCase();

  if (normalized && SUPPORTED_LLM_PROVIDERS.includes(normalized as SupportedLlmProvider)) {
    return normalized as SupportedLlmProvider;
  }

  return DEFAULT_LLM_PROVIDER;
}

export function defaultLlmModelForProvider(
  provider: string | null | undefined,
  fallbackModel = DEFAULT_LLM_MODEL,
) {
  const normalized = normalizeLlmProviderName(provider);

  switch (normalized) {
    case "mock":
      return DEFAULT_MOCK_LLM_MODEL;
    case "gemini":
      return DEFAULT_GEMINI_CHAT_MODEL;
    case "deepseek":
      return defaultChatModelForProvider(normalized);
    case "openai":
      return DEFAULT_OPENAI_LLM_MODEL;
    case "openai-compatible":
      return DEFAULT_OPENAI_COMPATIBLE_LLM_MODEL;
    case "anthropic":
      return DEFAULT_ANTHROPIC_LLM_MODEL;
    case "lmstudio":
      return "";
    default:
      return fallbackModel;
  }
}

export function defaultLlmBaseUrlForProvider(provider: string | null | undefined) {
  switch (normalizeLlmProviderName(provider)) {
    case "deepseek":
      return DEFAULT_DEEPSEEK_BASE_URL;
    case "gemini":
      return DEFAULT_GEMINI_BASE_URL;
    case "openai":
      return DEFAULT_OPENAI_BASE_URL;
    case "openai-compatible":
      return DEFAULT_OPENAI_BASE_URL;
    case "anthropic":
      return DEFAULT_ANTHROPIC_BASE_URL;
    case "lmstudio":
      return DEFAULT_LMSTUDIO_BASE_URL;
    default:
      return null;
  }
}

export function resolveLlmProviderRuntimeConfig(env: Record<string, string | undefined>): LlmProviderRuntimeConfig {
  const maxTokens = Number(env.LLM_MAX_TOKENS || "700");
  const temperature = Number(env.LLM_TEMPERATURE || "0.2");
  const provider = normalizeLlmProviderName(env.LLM_PROVIDER);
  const model = env.LLM_MODEL?.trim() || defaultLlmModelForProvider(provider);
  const baseUrl = normalizeBaseUrl(env.LLM_BASE_URL, defaultLlmBaseUrlForProvider(provider));
  const apiKey = env.LLM_API_KEY
    || (provider === "deepseek" ? env.DEEPSEEK_API_KEY : null)
    || (provider === "gemini" ? (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) : null)
    || (provider === "openai" ? env.OPENAI_API_KEY : null)
    || (provider === "anthropic" ? env.ANTHROPIC_API_KEY : null);
  const apiKeySource = env.LLM_API_KEY
    ? "LLM_API_KEY"
    : provider === "deepseek" && env.DEEPSEEK_API_KEY
      ? "DEEPSEEK_API_KEY"
      : provider === "gemini" && env.GEMINI_API_KEY
        ? "GEMINI_API_KEY"
        : provider === "gemini" && env.GOOGLE_API_KEY
          ? "GOOGLE_API_KEY"
          : provider === "openai" && env.OPENAI_API_KEY
            ? "OPENAI_API_KEY"
            : provider === "anthropic" && env.ANTHROPIC_API_KEY
              ? "ANTHROPIC_API_KEY"
            : null;

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    apiKeySource,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 700,
  };
}
