import { describe, expect, it } from "vitest";

import { resolveChatRuntimeSettings } from "../../../supabase/functions/_shared/chat-runtime-settings.ts";

describe("resolveChatRuntimeSettings", () => {
  it("prefers admin settings for provider selection", () => {
    const result = resolveChatRuntimeSettings({
      env: {
        LLM_PROVIDER: "gemini",
        LLM_MODEL: "gemini-2.0-flash",
        LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
        GEMINI_API_KEY: "gemini-key",
      },
      settings: {
        chat_llm_provider: "openai",
        chat_llm_model: "gpt-4.1-mini",
        chat_llm_base_url: "https://api.openai.com/v1",
        chat_history_limit: 9,
        chat_max_evidence_items: 4,
        chat_ai_enabled: true,
      },
      secrets: {
        chat_llm_api_key: "openai-key",
      },
    });

    expect(result.provider.provider).toBe("openai");
    expect(result.provider.model).toBe("gpt-4.1-mini");
    expect(result.provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(result.provider.apiKey).toBe("openai-key");
    expect(result.runtime.historyLimit).toBe(9);
    expect(result.runtime.maxEvidenceItems).toBe(4);
  });

  it("reflects aiEnabled when disabled in admin settings", () => {
    const result = resolveChatRuntimeSettings({
      env: {},
      settings: {
        chat_ai_enabled: false,
      },
      secrets: null,
    });

    expect(result.runtime.aiEnabled).toBe(false);
  });

  it("uses admin-selected LM Studio chat settings directly and disables paid fallbacks", () => {
    const result = resolveChatRuntimeSettings({
      env: {
        LLM_PROVIDER: "gemini",
        LLM_MODEL: "gemini-2.0-flash",
        GEMINI_API_KEY: "gemini-key",
      },
      settings: {
        chat_llm_provider: "lmstudio",
        chat_llm_model: "local-chat-model",
        chat_llm_base_url: "http://localhost:1234/v1",
        chat_ai_enabled: true,
      },
      secrets: null,
    });

    expect(result.provider).toMatchObject({
      provider: "lmstudio",
      model: "local-chat-model",
      baseUrl: "http://localhost:1234/v1",
      apiKey: null,
      apiKeySource: null,
    });
    expect(result.fallbackProviders).toEqual([]);
  });
});
