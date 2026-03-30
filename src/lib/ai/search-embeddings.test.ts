import { afterEach, describe, expect, it, vi } from "vitest";

import { embedTexts } from "../../../supabase/functions/_shared/search-embeddings.ts";

describe("search-embeddings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Gemini batch embeddings and normalizes vector dimensions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [
          {
            values: [0.25, -0.5, 0.75],
          },
        ],
      }),
    }));

    const result = await embedTexts(["worker"], {
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_VECTOR_DIMENSION: "5",
        GEMINI_API_KEY: "gemini-key",
      },
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("gemini");
    expect(result.model).toBe("gemini-embedding-001");
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toEqual([0.25, -0.5, 0.75, 0, 0]);
  });

  it("accepts GOOGLE_API_KEY as a Gemini key fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [
          {
            values: [1, 2, 3],
          },
        ],
      }),
    }));

    const result = await embedTexts(["werknemer"], {
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_VECTOR_DIMENSION: "3",
        GOOGLE_API_KEY: "google-key",
      },
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("gemini");
    expect(result.embeddings[0]).toEqual([1, 2, 3]);
  });
});
