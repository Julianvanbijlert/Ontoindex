import { resolveLlmProviderRuntimeConfig, type LlmProviderRuntimeConfig } from "./provider-config.ts";
import { AnthropicProvider } from "./providers/anthropic-provider.ts";
import { DeepSeekProvider } from "./providers/deepseek-provider.ts";
import { GeminiProvider } from "./providers/gemini-provider.ts";
import { MockProvider } from "./providers/mock-provider.ts";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible-provider.ts";
import { OpenAiProvider } from "./providers/openai-provider.ts";
import type { ChatCompletionInput, ChatModelProvider, LlmProvider } from "./types.ts";

export function createLlmProvider(config: LlmProviderRuntimeConfig): LlmProvider {
  switch (config.provider) {
    case "deepseek":
      if (!config.apiKey) {
        throw new Error("LLM_API_KEY is required for the DeepSeek provider.");
      }
      return new DeepSeekProvider({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case "gemini":
      if (!config.apiKey) {
        throw new Error("LLM_API_KEY is required for the Gemini provider.");
      }
      return new GeminiProvider({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case "openai":
      if (!config.apiKey) {
        throw new Error("LLM_API_KEY is required for the OpenAI provider.");
      }
      return new OpenAiProvider({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case "openai-compatible":
      if (!config.apiKey) {
        throw new Error("LLM_API_KEY is required for the OpenAI-compatible provider.");
      }
      return new OpenAiCompatibleProvider({
        name: "openai-compatible",
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case "lmstudio":
      return new OpenAiCompatibleProvider({
        name: "lmstudio",
        model: config.model,
        apiKey: null,
        baseUrl: config.baseUrl,
      });
    case "anthropic":
      if (!config.apiKey) {
        throw new Error("LLM_API_KEY is required for the Anthropic provider.");
      }
      return new AnthropicProvider({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case "mock":
    default:
      return new MockProvider();
  }
}

export function createLlmProviderFromEnv(env: Record<string, string | undefined>) {
  return createLlmProvider(resolveLlmProviderRuntimeConfig(env));
}

export function createChatModelProvider(config: LlmProviderRuntimeConfig): ChatModelProvider {
  const provider = createLlmProvider(config);

  return {
    info: {
      provider: config.provider,
      model: config.model,
      family: provider.info.family,
      baseUrl: provider.info.baseUrl ?? null,
    },
    complete: (input: ChatCompletionInput) =>
      provider.generate({
        ...input,
        model: input.model || config.model,
      }),
  };
}
