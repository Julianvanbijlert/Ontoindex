import { describe, expect, it } from "vitest";

import { readSearchEmbeddingConfig } from "../../../supabase/functions/_shared/search-ai-config.ts";

describe("search-ai-config", () => {
  it("prefers Edge env embedding overrides over persisted settings", () => {
    const config = readSearchEmbeddingConfig({
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
        GOOGLE_API_KEY: "google-key",
      },
      settings: {
        embedding_provider: "deepseek",
        embedding_model: "deepseek-embed",
        embedding_base_url: "https://api.deepseek.com",
      },
      secrets: {
        deepseek_api_key: "deepseek-key",
      },
    });

    expect(config.primary).toMatchObject({
      provider: "gemini",
      model: "gemini-embedding-001",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-key",
    });
  });

  it("does not fall back to chat secrets for embeddings", () => {
    const config = readSearchEmbeddingConfig({
      env: {
        EMBEDDING_PROVIDER: "deepseek",
      },
      settings: {
        embedding_provider: "deepseek",
      },
      secrets: {
        chat_llm_api_key: "chat-key-only",
      },
    });

    expect(config.primary.provider).toBe("deepseek");
    expect(config.primary.apiKey).toBeNull();
  });
});
