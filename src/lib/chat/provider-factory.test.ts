import { describe, expect, it } from "vitest";

import { resolveLlmProviderRuntimeConfig } from "@/lib/chat/provider-config";
import { createLlmProvider, createLlmProviderFromEnv } from "@/lib/chat/provider-factory";

describe("createLlmProvider", () => {
  it("returns a mock provider by default", async () => {
    const provider = createLlmProvider({
      provider: "mock",
      model: "mock-grounded-chat",
      baseUrl: null,
      apiKey: null,
      temperature: 0.2,
      maxTokens: 200,
    });

    const result = await provider.generate({
      systemPrompt: "system",
      messages: [{ role: "user", content: "What is an employee?" }],
      evidencePack: [],
      model: "mock-grounded-chat",
      temperature: 0.2,
      maxTokens: 200,
      responseFormat: "json",
      strictCitationMode: true,
    });

    expect(provider.info.name).toBe("mock");
    expect(result.refusal?.refused).toBe(true);
  });

  it("selects Gemini from env by default", () => {
    const provider = createLlmProviderFromEnv({
      LLM_API_KEY: "gemini-key",
    });

    expect(provider.info.name).toBe("gemini");
    expect(provider.info.family).toBe("gemini");
    expect(provider.info.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
  });

  it("resolves Gemini runtime defaults when no override is set", () => {
    expect(resolveLlmProviderRuntimeConfig({})).toMatchObject({
      provider: "gemini",
      model: "gemini-2.0-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: null,
      temperature: 0.2,
      maxTokens: 700,
    });
  });

  it("uses GOOGLE_API_KEY as the Gemini env fallback", () => {
    expect(resolveLlmProviderRuntimeConfig({
      GOOGLE_API_KEY: "google-gemini-key",
    })).toMatchObject({
      provider: "gemini",
      apiKey: "google-gemini-key",
    });
  });

  it("supports Gemini as a selectable chat provider", () => {
    const provider = createLlmProvider({
      provider: "gemini",
      model: "gemini-2.0-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "gemini-key",
      temperature: 0.2,
      maxTokens: 200,
    });

    expect(provider.info.name).toBe("gemini");
    expect(provider.info.family).toBe("gemini");
    expect(provider.info.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
  });

  it("creates the optional DeepSeek reasoner model with the right capabilities", () => {
    const provider = createLlmProvider({
      provider: "deepseek",
      model: "deepseek-reasoner",
      baseUrl: null,
      apiKey: "deepseek-key",
      temperature: 0.2,
      maxTokens: 200,
    });

    expect(provider.info.name).toBe("deepseek");
    expect(provider.capabilities.supportsJsonMode).toBe(true);
    expect(provider.capabilities.supportsToolCalls).toBe(false);
  });

  it("throws when a real provider is selected without a key", () => {
    expect(() => createLlmProvider({
      provider: "deepseek",
      model: "deepseek-chat",
      baseUrl: null,
      apiKey: null,
      temperature: 0.2,
      maxTokens: 200,
    })).toThrow("LLM_API_KEY");
  });
});
