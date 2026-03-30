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
});
