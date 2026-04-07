import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmbeddingProviderClient, embedTexts } from "../../../supabase/functions/_shared/search-embeddings.ts";

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
      settings: {
        embedding_schema_dimensions: 5,
      },
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("gemini");
    expect(result.model).toBe("gemini-embedding-001");
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toEqual([0.25, -0.5, 0.75, 0, 0]);
    expect(result.dimensionCompatibility).toMatchObject({
      status: "match",
      mismatch: false,
    });
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
      settings: {
        embedding_schema_dimensions: 3,
      },
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("gemini");
    expect(result.embeddings[0]).toEqual([1, 2, 3]);
    expect(result.dimensionCompatibility).toMatchObject({
      status: "match",
      mismatch: false,
    });
  });

  it("respects schema dimensions by truncating larger vectors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [
          {
            values: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        ],
      }),
    }));

    const result = await embedTexts(["schema-test"], {
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_VECTOR_DIMENSION: "5",
        SEARCH_EMBEDDING_SCHEMA_DIMENSIONS: "3",
        GEMINI_API_KEY: "gemini-key",
      },
    });

    expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.configuredDimensions).toBe(5);
    expect(result.storageDimensions).toBe(3);
    expect(result.dimensionCompatibility).toMatchObject({
      status: "truncated",
      mismatch: true,
    });
  });

  it("pads vectors when schema dimensions are larger than model output", async () => {
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

    const result = await embedTexts(["schema-pad"], {
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_VECTOR_DIMENSION: "3",
        SEARCH_EMBEDDING_SCHEMA_DIMENSIONS: "5",
        GEMINI_API_KEY: "gemini-key",
      },
    });

    expect(result.embeddings[0]).toEqual([0.25, -0.5, 0.75, 0, 0]);
    expect(result.configuredDimensions).toBe(3);
    expect(result.storageDimensions).toBe(5);
    expect(result.dimensionCompatibility).toMatchObject({
      status: "padded",
      mismatch: true,
    });
  });

  it("short-circuits embeddings when AI is disabled in admin settings", async () => {
    const result = await embedTexts(["disabled"], {
      settings: {
        chat_ai_enabled: false,
      },
      env: {
        EMBEDDING_PROVIDER: "gemini",
        EMBEDDING_MODEL: "gemini-embedding-001",
        EMBEDDING_VECTOR_DIMENSION: "3",
        GEMINI_API_KEY: "gemini-key",
      },
    });

    expect(result.providerConfigured).toBe(false);
    expect(result.embeddings).toEqual([]);
    expect(result.configurationError?.toLowerCase()).toContain("disabled");
  });

  it("exposes schema dimensions on the embedding client model info", () => {
    const provider = createEmbeddingProviderClient({
      env: {
        EMBEDDING_PROVIDER: "local",
        EMBEDDING_MODEL: "local-embed",
        EMBEDDING_VECTOR_DIMENSION: "3",
      },
      settings: {
        embedding_schema_dimensions: 7,
      },
    });

    expect(provider.getModelInfo().storageDimensions).toBe(7);
  });

  it("calls the local embeddings endpoint instead of using a stub vector generator", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            index: 0,
            embedding: [0.5, 0.25, -0.25],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await embedTexts(["vrije zoekterm"], {
      env: {
        EMBEDDING_PROVIDER: "local",
        EMBEDDING_FALLBACK_PROVIDER: "local",
        EMBEDDING_VECTOR_DIMENSION: "3",
        SEARCH_EMBEDDING_SCHEMA_DIMENSIONS: "3",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:11434/v1/embeddings", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: ["vrije zoekterm"],
      }),
    }));
    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("local");
    expect(result.model).toBe("nomic-embed-text");
    expect(result.embeddings[0]).toEqual([0.5, 0.25, -0.25]);
    expect(result.dimensionCompatibility).toMatchObject({
      status: "match",
      mismatch: false,
    });
  });

  it("surfaces a clear error when the configured local embeddings endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "local provider offline",
    }));

    await expect(embedTexts(["vrije zoekterm"], {
      env: {
        EMBEDDING_PROVIDER: "local",
        EMBEDDING_FALLBACK_PROVIDER: "local",
      },
    })).rejects.toThrow(/local/i);
  });

  it("calls the LM Studio embeddings endpoint without a paid-provider fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            index: 0,
            embedding: [0.2, 0.1, -0.1],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await embedTexts(["lokale demo"], {
      env: {
        EMBEDDING_PROVIDER: "lmstudio",
        EMBEDDING_MODEL: "local-embed-model",
        EMBEDDING_BASE_URL: "http://localhost:1234/v1",
        EMBEDDING_FALLBACK_PROVIDER: "lmstudio",
        EMBEDDING_VECTOR_DIMENSION: "3",
        SEARCH_EMBEDDING_SCHEMA_DIMENSIONS: "3",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:1234/v1/embeddings", expect.objectContaining({
      method: "POST",
      headers: expect.not.objectContaining({
        Authorization: expect.any(String),
      }),
      body: JSON.stringify({
        model: "local-embed-model",
        input: ["lokale demo"],
      }),
    }));
    expect(result.providerConfigured).toBe(true);
    expect(result.providerUsed).toBe("lmstudio");
    expect(result.model).toBe("local-embed-model");
    expect(result.dimensionCompatibility).toMatchObject({
      status: "match",
      mismatch: false,
    });
  });
});
