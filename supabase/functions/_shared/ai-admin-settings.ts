import type { SearchAiSecretsRow, SearchAiSettingsRow } from "./search-ai-config.ts";

export interface AiSettingsLookupClient {
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

export async function loadAiRuntimeRows(adminClient: AiSettingsLookupClient | null) {
  if (!adminClient) {
    return {
      settings: null as SearchAiSettingsRow | null,
      secrets: null as SearchAiSecretsRow | null,
    };
  }

  const [settingsResponse, secretsResponse] = await Promise.all([
    adminClient
      .from("app_settings")
      .select([
        "chat_llm_provider",
        "chat_llm_model",
        "chat_llm_base_url",
        "embedding_provider",
        "embedding_model",
        "embedding_base_url",
        "embedding_fallback_provider",
        "embedding_fallback_model",
        "embedding_fallback_base_url",
        "embedding_vector_dimensions",
      ].join(","))
      .eq("id", 1)
      .maybeSingle(),
    adminClient
      .from("app_setting_secrets")
      .select([
        "chat_llm_api_key",
        "deepseek_api_key",
        "gemini_api_key",
        "hf_api_key",
      ].join(","))
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (settingsResponse.error) {
    console.warn("AI runtime settings unavailable, falling back to env.", {
      message: settingsResponse.error.message,
    });
  }

  if (secretsResponse.error) {
    console.warn("AI runtime secrets unavailable, falling back to env.", {
      message: secretsResponse.error.message,
    });
  }

  return {
    settings: (settingsResponse.data || null) as SearchAiSettingsRow | null,
    secrets: (secretsResponse.data || null) as SearchAiSecretsRow | null,
  };
}
