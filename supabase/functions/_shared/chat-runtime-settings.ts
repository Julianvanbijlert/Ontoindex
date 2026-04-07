import {
  defaultChatBaseUrlForProvider,
  defaultChatModelForProvider,
} from "../../../src/lib/ai/provider-factory.ts";
import {
  resolveLlmProviderRuntimeConfig,
  type LlmProviderRuntimeConfig,
} from "../../../src/lib/chat/provider-config.ts";

interface ChatSettingsRow {
  chat_ai_enabled?: boolean | null;
  chat_llm_provider?: string | null;
  chat_llm_model?: string | null;
  chat_llm_base_url?: string | null;
  chat_llm_temperature?: number | null;
  chat_llm_max_tokens?: number | null;
  chat_history_limit?: number | null;
  chat_max_evidence_items?: number | null;
  chat_runtime_temperature?: number | null;
  chat_runtime_max_tokens?: number | null;
}

interface ChatSecretsRow {
  chat_llm_api_key?: string | null;
  deepseek_api_key?: string | null;
  gemini_api_key?: string | null;
}

export interface ChatRuntimeSettingsClient {
  from(table: "app_settings" | "app_setting_secrets"): {
    select(columns: string): {
      eq(column: string, value: number): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

export interface ChatRuntimeSettingsResult {
  provider: LlmProviderRuntimeConfig;
  fallbackProviders: LlmProviderRuntimeConfig[];
  runtime: {
    aiEnabled: boolean;
    historyLimit: number;
    maxEvidenceItems: number;
    answerTemperature: number;
    maxAnswerTokens: number;
  };
}

function resolveProviderCredential(
  provider: string,
  env: Record<string, string | undefined>,
  secrets?: ChatSecretsRow | null,
) {
  switch (provider) {
    case "lmstudio":
    case "mock":
      return { apiKey: null, apiKeySource: null };
    case "deepseek":
      if (secrets?.chat_llm_api_key) {
        return { apiKey: secrets.chat_llm_api_key, apiKeySource: "app_setting_secrets.chat_llm_api_key" };
      }
      if (secrets?.deepseek_api_key) {
        return { apiKey: secrets.deepseek_api_key, apiKeySource: "app_setting_secrets.deepseek_api_key" };
      }
      if (env.DEEPSEEK_API_KEY) {
        return { apiKey: env.DEEPSEEK_API_KEY, apiKeySource: "DEEPSEEK_API_KEY" };
      }
      if (env.LLM_API_KEY) {
        return { apiKey: env.LLM_API_KEY, apiKeySource: "LLM_API_KEY" };
      }
      return { apiKey: null, apiKeySource: null };
    case "gemini":
      if (secrets?.gemini_api_key) {
        return { apiKey: secrets.gemini_api_key, apiKeySource: "app_setting_secrets.gemini_api_key" };
      }
      if (env.GEMINI_API_KEY) {
        return { apiKey: env.GEMINI_API_KEY, apiKeySource: "GEMINI_API_KEY" };
      }
      if (env.GOOGLE_API_KEY) {
        return { apiKey: env.GOOGLE_API_KEY, apiKeySource: "GOOGLE_API_KEY" };
      }
      return { apiKey: null, apiKeySource: null };
    case "openai":
      if (secrets?.chat_llm_api_key) {
        return { apiKey: secrets.chat_llm_api_key, apiKeySource: "app_setting_secrets.chat_llm_api_key" };
      }
      if (env.OPENAI_API_KEY) {
        return { apiKey: env.OPENAI_API_KEY, apiKeySource: "OPENAI_API_KEY" };
      }
      if (env.LLM_API_KEY) {
        return { apiKey: env.LLM_API_KEY, apiKeySource: "LLM_API_KEY" };
      }
      return { apiKey: null, apiKeySource: null };
    case "anthropic":
      if (secrets?.chat_llm_api_key) {
        return { apiKey: secrets.chat_llm_api_key, apiKeySource: "app_setting_secrets.chat_llm_api_key" };
      }
      if (env.ANTHROPIC_API_KEY) {
        return { apiKey: env.ANTHROPIC_API_KEY, apiKeySource: "ANTHROPIC_API_KEY" };
      }
      if (env.LLM_API_KEY) {
        return { apiKey: env.LLM_API_KEY, apiKeySource: "LLM_API_KEY" };
      }
      return { apiKey: null, apiKeySource: null };
    case "openai-compatible":
    default:
      if (secrets?.chat_llm_api_key) {
        return { apiKey: secrets.chat_llm_api_key, apiKeySource: "app_setting_secrets.chat_llm_api_key" };
      }
      return { apiKey: env.LLM_API_KEY || null, apiKeySource: env.LLM_API_KEY ? "LLM_API_KEY" : null };
  }
}

function buildFallbackProviders(
  primaryProvider: string,
  envConfig: LlmProviderRuntimeConfig,
  env: Record<string, string | undefined>,
  secrets?: ChatSecretsRow | null,
): LlmProviderRuntimeConfig[] {
  const fallbackProviders: LlmProviderRuntimeConfig[] = [];

  if (primaryProvider === "lmstudio" || primaryProvider === "mock") {
    return fallbackProviders;
  }

  if (primaryProvider !== "gemini") {
    const geminiCredential = resolveProviderCredential("gemini", env, secrets);

    if (geminiCredential.apiKey) {
      fallbackProviders.push({
        provider: "gemini",
        model: env.LLM_GEMINI_FALLBACK_MODEL || defaultChatModelForProvider("gemini"),
        baseUrl: defaultChatBaseUrlForProvider("gemini"),
        apiKey: geminiCredential.apiKey,
        apiKeySource: geminiCredential.apiKeySource,
        temperature: envConfig.temperature,
        maxTokens: envConfig.maxTokens,
      });
    }
  }

  if (primaryProvider !== "deepseek") {
    const deepseekCredential = resolveProviderCredential("deepseek", env, secrets);

    if (deepseekCredential.apiKey) {
      fallbackProviders.push({
        provider: "deepseek",
        model: env.LLM_DEEPSEEK_FALLBACK_MODEL || defaultChatModelForProvider("deepseek"),
        baseUrl: defaultChatBaseUrlForProvider("deepseek"),
        apiKey: deepseekCredential.apiKey,
        apiKeySource: deepseekCredential.apiKeySource,
        temperature: envConfig.temperature,
        maxTokens: envConfig.maxTokens,
      });
    }
  }

  return fallbackProviders;
}

export function resolveChatRuntimeSettings(input: {
  env: Record<string, string | undefined>;
  settings?: ChatSettingsRow | null;
  secrets?: ChatSecretsRow | null;
}): ChatRuntimeSettingsResult {
  const envConfig = resolveLlmProviderRuntimeConfig(input.env);
  const settings = input.settings;
  const secrets = input.secrets;
  const providerName = settings?.chat_llm_provider || envConfig.provider;
  const providerCredential = resolveProviderCredential(providerName, input.env, secrets);
  const providerModel = settings?.chat_llm_model?.trim()
    || defaultChatModelForProvider(providerName)
    || envConfig.model;
  const providerBaseUrl = settings?.chat_llm_base_url?.trim()
    || defaultChatBaseUrlForProvider(providerName)
    || envConfig.baseUrl;

  return {
    provider: {
      provider: providerName,
      model: providerModel,
      baseUrl: providerBaseUrl,
      apiKey: providerCredential.apiKey,
      apiKeySource: providerCredential.apiKeySource,
      temperature: Math.max(settings?.chat_llm_temperature ?? envConfig.temperature, 0),
      maxTokens: Math.max(settings?.chat_llm_max_tokens ?? envConfig.maxTokens, 1),
    },
    fallbackProviders: buildFallbackProviders(providerName, envConfig, input.env, secrets),
    runtime: {
      aiEnabled: settings?.chat_ai_enabled ?? true,
      historyLimit: Math.max(settings?.chat_history_limit ?? 12, 1),
      maxEvidenceItems: Math.max(settings?.chat_max_evidence_items ?? 6, 1),
      answerTemperature: Math.max(settings?.chat_runtime_temperature ?? settings?.chat_llm_temperature ?? envConfig.temperature, 0),
      maxAnswerTokens: Math.max(settings?.chat_runtime_max_tokens ?? settings?.chat_llm_max_tokens ?? envConfig.maxTokens, 1),
    },
  };
}

export async function loadChatRuntimeSettings(
  adminClient: ChatRuntimeSettingsClient | null,
  env: Record<string, string | undefined>,
): Promise<ChatRuntimeSettingsResult> {
  if (!adminClient) {
    return resolveChatRuntimeSettings({ env });
  }

  const [settingsResponse, secretsResponse] = await Promise.all([
    adminClient
      .from("app_settings")
      .select([
        "chat_ai_enabled",
        "chat_llm_provider",
        "chat_llm_model",
        "chat_llm_base_url",
        "chat_llm_temperature",
        "chat_llm_max_tokens",
        "chat_history_limit",
        "chat_max_evidence_items",
        "chat_runtime_temperature",
        "chat_runtime_max_tokens",
      ].join(","))
      .eq("id", 1)
      .maybeSingle(),
    adminClient
      .from("app_setting_secrets")
      .select("chat_llm_api_key, deepseek_api_key, gemini_api_key")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (settingsResponse.error) {
    console.warn("Chat runtime settings unavailable, falling back to env config.", {
      message: settingsResponse.error.message,
    });
  }

  if (secretsResponse.error) {
    console.warn("Chat provider secrets unavailable, falling back to env config.", {
      message: secretsResponse.error.message,
    });
  }

  return resolveChatRuntimeSettings({
    env,
    settings: settingsResponse.data as ChatSettingsRow | null,
    secrets: secretsResponse.data as ChatSecretsRow | null,
  });
}
