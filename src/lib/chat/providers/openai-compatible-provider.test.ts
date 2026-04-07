import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepSeekProvider } from "@/lib/chat/providers/deepseek-provider";
import { OpenAiCompatibleProvider } from "@/lib/chat/providers/openai-compatible-provider";

describe("OpenAiCompatibleProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes a structured JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "Employee is the preferred ontology term. [E1]",
                citations: ["E1"],
                clarificationQuestion: null,
                refusal: false,
                refusalReason: null,
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 13,
          total_tokens: 24,
        },
      }),
    }));

    const provider = new OpenAiCompatibleProvider({
      name: "openai-compatible",
      model: "gpt-test",
      apiKey: "key",
      baseUrl: "https://example.test/v1",
    });

    const result = await provider.generate({
      systemPrompt: "system",
      messages: [{ role: "user", content: "What is an employee?" }],
      evidencePack: [],
      model: "gpt-test",
      temperature: 0.2,
      maxTokens: 100,
      responseFormat: "json",
      strictCitationMode: true,
    });

    expect(result.assistantText).toContain("Employee is the preferred ontology term.");
    expect(result.citations).toEqual(["E1"]);
    expect(result.usage?.totalTokens).toBe(24);
  });

  it("normalizes DeepSeek responses through the shared provider abstraction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "Medewerker is the grounded ontology term. [D1]",
                citations: ["D1"],
                clarificationQuestion: null,
                refusal: false,
                refusalReason: null,
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 9,
          completion_tokens: 10,
          total_tokens: 19,
        },
      }),
    }));

    const provider = new DeepSeekProvider({
      model: "deepseek-chat",
      apiKey: "key",
    });

    const result = await provider.generate({
      systemPrompt: "system",
      messages: [{ role: "user", content: "What is a worker?" }],
      evidencePack: [],
      model: "deepseek-chat",
      temperature: 0.2,
      maxTokens: 100,
      responseFormat: "json",
      strictCitationMode: true,
    });

    expect(provider.info.name).toBe("deepseek");
    expect(provider.info.baseUrl).toBe("https://api.deepseek.com");
    expect(provider.capabilities.supportsToolCalls).toBe(true);
    expect(result.assistantText).toContain("Medewerker is the grounded ontology term.");
    expect(result.citations).toEqual(["D1"]);
  });

  it("supports LM Studio-style local chat completions without sending a paid API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "The local ontology answer is grounded. [L1]",
                citations: ["L1"],
                clarificationQuestion: null,
                refusal: false,
                refusalReason: null,
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 7,
          completion_tokens: 12,
          total_tokens: 19,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiCompatibleProvider({
      name: "lmstudio",
      model: "local-chat-model",
      apiKey: null,
      baseUrl: "http://localhost:1234/v1",
    });

    const result = await provider.generate({
      systemPrompt: "system",
      messages: [{ role: "user", content: "Ground this locally" }],
      evidencePack: [],
      model: "local-chat-model",
      temperature: 0.2,
      maxTokens: 100,
      responseFormat: "json",
      strictCitationMode: true,
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:1234/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.not.objectContaining({
        Authorization: expect.any(String),
      }),
    }));
    expect(result.assistantText).toContain("local ontology answer");
    expect(result.citations).toEqual(["L1"]);
  });
});
