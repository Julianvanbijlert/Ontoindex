import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiProvider } from "@/lib/chat/providers/gemini-provider";

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes a JSON-mode Gemini response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answer: "Employee is the grounded ontology term. [G1]",
                    citations: ["G1"],
                    clarificationQuestion: null,
                    refusal: false,
                    refusalReason: null,
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 12,
          totalTokenCount: 22,
        },
      }),
    }));

    const provider = new GeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "gemini-key",
    });

    const result = await provider.generate({
      systemPrompt: "system",
      messages: [{ role: "user", content: "What is an employee?" }],
      evidencePack: [],
      model: "gemini-2.0-flash",
      temperature: 0.2,
      maxTokens: 100,
      responseFormat: "json",
      strictCitationMode: true,
    });

    expect(provider.info.name).toBe("gemini");
    expect(result.assistantText).toContain("Employee is the grounded ontology term.");
    expect(result.citations).toEqual(["G1"]);
    expect(result.usage?.totalTokens).toBe(22);
  });
});
