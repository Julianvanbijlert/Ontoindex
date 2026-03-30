import type { LlmGenerationInput, LlmGenerationResult, LlmProvider } from "../types.ts";

export class MockProvider implements LlmProvider {
  readonly info = {
    name: "mock",
    family: "mock",
    baseUrl: null,
  };

  readonly capabilities = {
    supportsStreaming: false,
    supportsJsonMode: true,
    supportsStrictCitationMode: true,
    supportsToolCalls: false,
  };

  async generate(input: LlmGenerationInput): Promise<LlmGenerationResult> {
    const firstEvidence = input.evidencePack[0];
    const citations = firstEvidence ? [firstEvidence.citationId] : [];
    const answer = firstEvidence
      ? `${firstEvidence.title}: ${firstEvidence.snippet} [${firstEvidence.citationId}]`
      : "I couldn't ground a confident answer from the current evidence.";

    return {
      assistantText: answer,
      structuredOutput: {
        answer,
        citations,
        clarificationQuestion: firstEvidence ? null : "Could you narrow the question to a specific ontology concept?",
        refusal: !firstEvidence,
        refusalReason: firstEvidence ? null : "No grounded evidence available.",
      },
      citations,
      finishReason: "stop",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      providerMetadata: {
        mock: true,
      },
      refusal: {
        refused: !firstEvidence,
        reason: firstEvidence ? null : "No grounded evidence available.",
      },
    };
  }
}
