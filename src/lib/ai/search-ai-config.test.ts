import { describe, expect, it } from "vitest";

import { readSearchEmbeddingConfig } from "../../../supabase/functions/_shared/search-ai-config.ts";

describe("search-ai-config", () => {
  it("prefers persisted admin embedding settings over generic env defaults", () => {
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
      provider: "deepseek",
      model: "deepseek-embed",
      baseUrl: "https://api.deepseek.com",
      apiKey: "deepseek-key",
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

  it("uses schema dimensions from admin settings when provided", () => {
    const config = readSearchEmbeddingConfig({
      settings: {
        embedding_provider: "gemini",
        embedding_model: "gemini-embedding-001",
        embedding_vector_dimensions: 384,
        embedding_schema_dimensions: 1536,
      },
    });

    expect(config.vectorDimensions).toBe(384);
    expect(config.schemaDimensions).toBe(1536);
  });

  it("uses provider-specific local defaults when admin settings select local embeddings", () => {
    const config = readSearchEmbeddingConfig({
      settings: {
        embedding_provider: "local",
      },
    });

    expect(config.primary).toMatchObject({
      provider: "local",
      model: "nomic-embed-text",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: null,
    });
  });

  it("keeps retrieval on the active indexed embedding config while a selected rebuild target differs", () => {
    const config = readSearchEmbeddingConfig({
      settings: {
        embedding_provider: "local",
        embedding_model: "nomic-embed-text",
        embedding_base_url: "http://127.0.0.1:11434/v1",
        embedding_vector_dimensions: 768,
        embedding_schema_dimensions: 768,
        active_embedding_provider: "gemini",
        active_embedding_model: "gemini-embedding-001",
        active_embedding_base_url: "https://generativelanguage.googleapis.com/v1beta",
        active_embedding_vector_dimensions: 1536,
        active_embedding_schema_dimensions: 1536,
        active_embedding_generation_id: "gen-active",
        active_embedding_fingerprint: "fp_active",
        embedding_pending_generation_id: "gen-selected",
      },
    });

    expect(config.primary.provider).toBe("gemini");
    expect(config.primary.model).toBe("gemini-embedding-001");
    expect(config.indexing.provider).toBe("local");
    expect(config.indexing.model).toBe("nomic-embed-text");
    expect(config.activeGenerationId).toBe("gen-active");
    expect(config.targetGenerationId).toBe("gen-selected");
    expect(config.activeFingerprint).toBe("fp_active");
    expect(config.selectedFingerprint).not.toBe("fp_active");
    expect(config.reindexRequired).toBe(true);
  });

  it("uses LM Studio embedding settings directly without paid-provider defaults", () => {
    const config = readSearchEmbeddingConfig({
      settings: {
        embedding_provider: "lmstudio",
        embedding_model: "local-embed-model",
        embedding_base_url: "http://localhost:1234/v1",
        embedding_vector_dimensions: 768,
        embedding_schema_dimensions: 768,
      },
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        GEMINI_API_KEY: "gemini-key",
      },
    });

    expect(config.primary).toMatchObject({
      provider: "lmstudio",
      model: "local-embed-model",
      baseUrl: "http://localhost:1234/v1",
      apiKey: null,
    });
    expect(config.fallback).toBeNull();
  });
});
