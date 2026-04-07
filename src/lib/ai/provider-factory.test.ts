import { describe, expect, it } from "vitest";

import {
  defaultEmbeddingBaseUrlForProvider,
  defaultEmbeddingModelForProvider,
  getChatProvider,
  getEmbeddingProvider,
} from "@/lib/ai/provider-factory";

describe("ai provider factory", () => {
  it("defaults embeddings to Gemini", () => {
    expect(getEmbeddingProvider({})).toBe("gemini");
    expect(defaultEmbeddingModelForProvider("gemini")).toBe("gemini-embedding-001");
    expect(defaultEmbeddingBaseUrlForProvider("gemini")).toBe("https://generativelanguage.googleapis.com/v1beta");
  });

  it("defaults chat to Gemini", () => {
    expect(getChatProvider({})).toBe("gemini");
  });

  it("allows explicit HuggingFace embedding selection", () => {
    expect(getEmbeddingProvider({ EMBEDDING_PROVIDER: "huggingface" })).toBe("huggingface");
    expect(defaultEmbeddingModelForProvider("huggingface")).toBe("sentence-transformers/all-MiniLM-L6-v2");
  });

  it("provides local embedding defaults for the free-first provider path", () => {
    expect(getEmbeddingProvider({ EMBEDDING_PROVIDER: "local" })).toBe("local");
    expect(defaultEmbeddingModelForProvider("local")).toBe("nomic-embed-text");
    expect(defaultEmbeddingBaseUrlForProvider("local")).toBe("http://127.0.0.1:11434/v1");
  });

  it("provides explicit LM Studio defaults for chat and embeddings", () => {
    expect(getEmbeddingProvider({ EMBEDDING_PROVIDER: "lmstudio" })).toBe("lmstudio");
    expect(getChatProvider({ LLM_PROVIDER: "lmstudio" })).toBe("lmstudio");
    expect(defaultEmbeddingModelForProvider("lmstudio")).toBe("");
    expect(defaultEmbeddingBaseUrlForProvider("lmstudio")).toBe("http://localhost:1234/v1");
  });
});
