import type {
  GroundedAnswerPayload,
  LlmGenerationInput,
  LlmGenerationResult,
  LlmProvider,
} from "../types.ts";

interface AnthropicProviderOptions {
  model: string;
  apiKey: string;
  baseUrl?: string | null;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
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
      citations: Array.isArray(parsed.citations) ? parsed.citations.filter((item): item is string => typeof item === "string") : [],
      clarificationQuestion: typeof parsed.clarificationQuestion === "string" ? parsed.clarificationQuestion : null,
      refusal: Boolean(parsed.refusal),
      refusalReason: typeof parsed.refusalReason === "string" ? parsed.refusalReason : null,
    };
  } catch (_error) {
    return null;
  }
}

export class AnthropicProvider implements LlmProvider {
  readonly info;
  readonly capabilities = {
    supportsStreaming: false,
    supportsJsonMode: true,
    supportsStrictCitationMode: true,
    supportsToolCalls: false,
  };

  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    this.info = {
      name: "anthropic",
      family: "anthropic",
      baseUrl: this.baseUrl,
    };
  }

  async generate(input: LlmGenerationInput): Promise<LlmGenerationResult> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model || this.model,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: input.systemPrompt,
        messages: input.messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as AnthropicResponse;
    const text = (payload.content || [])
      .map((item) => item.text || "")
      .join("")
      .trim();
    const structuredOutput = parseStructuredOutput(text);

    return {
      assistantText: structuredOutput?.answer || text,
      structuredOutput,
      citations: structuredOutput?.citations || [],
      finishReason: payload.stop_reason || null,
      usage: {
        inputTokens: payload.usage?.input_tokens ?? null,
        outputTokens: payload.usage?.output_tokens ?? null,
        totalTokens: (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0) || null,
      },
      providerMetadata: null,
      refusal: {
        refused: Boolean(structuredOutput?.refusal),
        reason: structuredOutput?.refusalReason || null,
      },
    };
  }
}
