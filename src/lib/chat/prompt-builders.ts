import type {
  ChatHistoryMessage,
  ChatPromptBuildInput,
  ChatPromptBuildResult,
} from "./types.ts";

function formatHistory(history: ChatHistoryMessage[]) {
  return history
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function formatEvidence(input: ChatPromptBuildInput) {
  return input.evidencePack
    .map((item) => [
      `[${item.citationId}] ${item.title}`,
      `Entity: ${item.entityType} ${item.entityId}`,
      item.ontologyTitle ? `Ontology: ${item.ontologyTitle}` : null,
      `Snippet: ${item.snippet}`,
      item.provenance.matchReasons.length > 0
        ? `Why retrieved: ${item.provenance.matchReasons.join("; ")}`
        : null,
      item.provenance.synonymExpansion?.length
        ? `Synonym expansion: ${item.provenance.synonymExpansion.join(", ")}`
        : null,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

function buildSystemPrompt(input: ChatPromptBuildInput) {
  const strictLine = input.settings.strictCitations
    ? "Every factual claim must be supported by one or more evidence citations."
    : "Prefer citing every factual claim with evidence citations.";

  return [
    "You are a grounded ontology assistant.",
    "Answer only from the provided evidence pack and conversation history.",
    "Never invent ontology facts, relations, workflows, comments, or review states.",
    strictLine,
    "If the evidence is weak, ambiguous, or missing, ask one concise clarifying question or state that the answer cannot be grounded confidently.",
    "Return JSON with keys: answer, citations, clarificationQuestion, refusal, refusalReason.",
    "Use citation ids like E1, E2, E3 that correspond to the evidence pack.",
  ].join(" ");
}

export function buildGroundedAnswerPrompt(input: ChatPromptBuildInput): ChatPromptBuildResult {
  const historyText = formatHistory(input.history);
  const evidenceText = formatEvidence(input);
  const retrievalNotes = [
    `Original query: ${input.retrieval.originalQuery}`,
    `Effective query: ${input.retrieval.effectiveQuery}`,
    `Retrieval confidence: ${input.retrieval.retrievalConfidence}`,
    `Context use: ${input.retrieval.contextUse}`,
    `Rewrite mode: ${input.retrieval.rewriteMode}`,
    input.retrieval.expansionsUsed.length > 0
      ? `Expansions used: ${input.retrieval.expansionsUsed.map((item) => `${item.originalTerm}->${item.expandedTerms.join("/")}`).join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    systemPrompt: buildSystemPrompt(input),
    responseFormat: "json",
    messages: [
      {
        role: "user",
        content: [
          `Conversation history:\n${historyText || "No prior conversation."}`,
          `Evidence pack:\n${evidenceText || "No evidence available."}`,
          `Retrieval notes:\n${retrievalNotes}`,
          input.responseMode === "clarification"
            ? `User message: ${input.userMessage}\nRespond with a short clarification question because the evidence is currently too weak.`
            : `User message: ${input.userMessage}\nAnswer using only the evidence pack.`,
        ].join("\n\n"),
      },
    ],
  };
}

export function buildClarificationPrompt(input: ChatPromptBuildInput) {
  return buildGroundedAnswerPrompt({
    ...input,
    responseMode: "clarification",
  });
}
