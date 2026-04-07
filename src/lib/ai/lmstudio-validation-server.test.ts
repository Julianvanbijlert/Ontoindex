import { describe, expect, it, vi } from "vitest";

import {
  fetchLmStudioModels,
  validateLmStudioConnection,
} from "../../../supabase/functions/_shared/lmstudio-validation.ts";

describe("lmstudio-validation server helper", () => {
  it("calls LM Studio /v1/models with a normal GET request and no Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "local-chat-model" },
          { id: "local-embed-model" },
        ],
      }),
    });

    const result = await fetchLmStudioModels("http://localhost:1234/v1", fetchMock as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:1234/v1/models", {
      method: "GET",
    });
    expect(result.ok).toBe(true);
    expect(result.modelIds).toEqual(["local-chat-model", "local-embed-model"]);
  });

  it("returns a clear failure state when LM Studio is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await validateLmStudioConnection({
      baseUrl: "http://localhost:1234/v1",
      chatModel: "local-chat-model",
      embeddingModel: "local-embed-model",
    }, fetchMock as typeof fetch);

    expect(result.ok).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.message.toLowerCase()).toContain("unreachable");
    expect(result.selectedChatModelFound).toBe(false);
    expect(result.selectedEmbeddingModelFound).toBe(false);
  });

  it("returns a clear failure state when LM Studio returns an invalid models payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
      }),
    });

    const result = await validateLmStudioConnection({
      baseUrl: "http://localhost:1234/v1",
      chatModel: "local-chat-model",
      embeddingModel: "local-embed-model",
    }, fetchMock as typeof fetch);

    expect(result.ok).toBe(false);
    expect(result.responseValid).toBe(false);
    expect(result.message.toLowerCase()).toContain("invalid");
  });

  it("reports selected chat and embedding model availability from the LM Studio model list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "local-chat-model" },
          { id: "other-model" },
        ],
      }),
    });

    const result = await validateLmStudioConnection({
      baseUrl: "http://localhost:1234/v1",
      chatModel: "local-chat-model",
      embeddingModel: "local-embed-model",
    }, fetchMock as typeof fetch);

    expect(result.ok).toBe(true);
    expect(result.selectedChatModelFound).toBe(true);
    expect(result.selectedEmbeddingModelFound).toBe(false);
    expect(result.chatModelMessage).toContain("available");
    expect(result.embeddingModelMessage).toContain("not available");
  });
});
