import type {
  GroundedAnswerPayload,
  LlmGenerationInput,
  LlmGenerationResult,
  LlmProviderCapabilities,
  LlmProvider,
} from "../types.ts";

interface OpenAiCompatibleProviderOptions {
  name: string;
  family?: string;
  model: string;
  apiKey: string | null;
  baseUrl?: string | null;
  capabilities?: Partial<LlmProviderCapabilities>;
}

interface OpenAiCompatibleResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function normalizeContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
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

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly info;
  readonly capabilities;
  protected readonly defaultModel: string;

  private readonly model: string;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.defaultModel = options.model;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.capabilities = {
      supportsStreaming: false,
      supportsJsonMode: true,
      supportsStrictCitationMode: true,
      supportsToolCalls: true,
      ...options.capabilities,
    };
    this.info = {
      name: options.name,
      family: options.family || "openai-compatible",
      baseUrl: this.baseUrl,
    };
  }

  async generate(input: LlmGenerationInput): Promise<LlmGenerationResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model || this.model,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: input.systemPrompt,
          },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as OpenAiCompatibleResponse;
    const choice = payload.choices?.[0];
    const text = normalizeContent(choice?.message?.content);
    const structuredOutput = parseStructuredOutput(text);

    if (!structuredOutput) {
      throw new Error("Provider returned an invalid JSON response.");
    }

    return {
      assistantText: structuredOutput.answer || text,
      structuredOutput,
      citations: structuredOutput.citations,
      finishReason: choice?.finish_reason || null,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? null,
        outputTokens: payload.usage?.completion_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null,
      },
      providerMetadata: {
        rawFinishReason: choice?.finish_reason || null,
      },
      refusal: {
        refused: Boolean(structuredOutput.refusal || choice?.message?.refusal),
        reason: structuredOutput.refusalReason || choice?.message?.refusal || null,
      },
    };
  }
}
