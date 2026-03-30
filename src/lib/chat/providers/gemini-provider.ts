import {
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_CHAT_MODEL,
} from "../../ai/provider-factory.ts";
import type {
  GroundedAnswerPayload,
  LlmGenerationInput,
  LlmGenerationResult,
  LlmProvider,
} from "../types.ts";

interface GeminiProviderOptions {
  model?: string;
  apiKey: string;
  baseUrl?: string | null;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: string | null;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function parseStructuredOutput(text: string): GroundedAnswerPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<GroundedAnswerPayload>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.filter((item): item is string => typeof item === "string")
        : [],
      clarificationQuestion: typeof parsed.clarificationQuestion === "string" ? parsed.clarificationQuestion : null,
      refusal: Boolean(parsed.refusal),
      refusalReason: typeof parsed.refusalReason === "string" ? parsed.refusalReason : null,
    };
  } catch (_error) {
    return null;
  }
}

export class GeminiProvider implements LlmProvider {
  readonly info;
  readonly capabilities;

  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model?.trim() || DEFAULT_GEMINI_CHAT_MODEL;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_GEMINI_BASE_URL).replace(/\/$/, "");
    this.capabilities = {
      supportsStreaming: false,
      supportsJsonMode: true,
      supportsStrictCitationMode: true,
      supportsToolCalls: true,
    };
    this.info = {
      name: "gemini",
      family: "gemini",
      baseUrl: this.baseUrl,
    };
  }

  async generate(input: LlmGenerationInput): Promise<LlmGenerationResult> {
    const response = await fetch(
      `${this.baseUrl}/models/${input.model || this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            role: "system",
            parts: [{ text: input.systemPrompt }],
          },
          contents: input.messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: input.temperature,
            maxOutputTokens: input.maxTokens,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as GeminiGenerateContentResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    const structuredOutput = parseStructuredOutput(text);

    if (!structuredOutput) {
      throw new Error("Provider returned an invalid JSON response.");
    }

    return {
      assistantText: structuredOutput.answer || text,
      structuredOutput,
      citations: structuredOutput.citations,
      finishReason: payload.candidates?.[0]?.finishReason || null,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
        outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
      },
      providerMetadata: {
        rawFinishReason: payload.candidates?.[0]?.finishReason || null,
      },
      refusal: {
        refused: Boolean(structuredOutput.refusal),
        reason: structuredOutput.refusalReason || null,
      },
    };
  }
}
