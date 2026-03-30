import { describe, expect, it, vi } from "vitest";

import { expandQueryWithLLM } from "@/lib/search/query-expansion";

function createClientMock() {
  return {
    functions: {
      invoke: vi.fn(),
    },
  } as any;
}

describe("search query expansion", () => {
  it("returns normalized semantic variants from the edge function", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: {
        expansions: ["Employee", " werknemer ", "worker"],
        providerConfigured: true,
        provider: "deepseek",
        model: "deepseek-chat",
      },
      error: null,
    });

    const variants = await expandQueryWithLLM(client, "worker");

    expect(variants).toEqual(["Employee", "werknemer"]);
  });

  it("falls back safely when the expansion function is unavailable", async () => {
    const client = createClientMock();
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Function unavailable",
      },
    });

    await expect(expandQueryWithLLM(client, "worker")).resolves.toEqual([]);
  });
});
