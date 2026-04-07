import type { EmbeddingDimensionCompatibility } from "../ai/embedding-dimensions.ts";
import type { EmbeddingReindexState } from "../ai/embedding-config-state.ts";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

export type ChatRole = "system" | "user" | "assistant" | "tool";
export type ChatGroundingStatus = "grounded" | "weak" | "refused" | "clarification";
export type ChatResponseMode = "grounded_answer" | "clarification";

export interface ChatCitation {
  id: string;
  entityId: string;
  entityType: "definition" | "ontology";
  title: string;
  href: string;
}

export interface ChatEvidenceItem {
  citationId: string;
  entityId: string;
  entityType: "definition" | "ontology";
  title: string;
  snippet: string;
  href: string;
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  score: number;
  scores?: {
    lexical?: number;
    dense?: number;
    fusion?: number;
    rerank?: number;
    context?: number;
  };
  provenance: {
    retrievalStrategy: "hybrid" | "legacy";
    matchReasons: string[];
    appliedFilters: string[];
    appliedBoosts: string[];
    synonymExpansion?: string[] | null;
    relationPath?: string[] | null;
  };
  safety: {
    isDeleted: boolean;
    tombstoneDetected: boolean;
  };
}

export interface ChatExpansionSignal {
  source: "synonym_graph" | "similarity_hint" | "manual_scope";
  originalTerm: string;
  expandedTerms: string[];
}

export interface ChatSessionSettings {
  similarityExpansion: boolean;
  strictCitations: boolean;
  ontologyScopeId: string | null;
  ontologyScopeTitle?: string | null;
  allowClarificationQuestions: boolean;
}

export interface ChatRuntimeSettings {
  aiEnabled: boolean;
  enableSimilarityExpansion: boolean;
  strictCitationsDefault: boolean;
  historyMessageLimit: number;
  maxEvidenceItems: number;
  answerTemperature: number;
  maxAnswerTokens: number;
}

export interface AdminChatProviderSettings {
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string | null;
  llmTemperature: number;
  llmMaxTokens: number;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  apiKeyUpdatedAt: string | null;
}

export interface AdminEmbeddingProviderSettings {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingBaseUrl: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  fallbackBaseUrl: string | null;
  vectorDimensions: number;
  schemaDimensions: number;
  dimensionCompatibility: EmbeddingDimensionCompatibility;
  activeRetrieval: {
    embeddingProvider: string;
    embeddingModel: string;
    embeddingBaseUrl: string | null;
    vectorDimensions: number;
    schemaDimensions: number;
    generationId: string | null;
    fingerprint: string;
    activatedAt: string | null;
  };
  reindexState: EmbeddingReindexState;
}

export interface AdminAiProviderSecrets {
  deepseek: {
    configured: boolean;
    masked: string | null;
    updatedAt: string | null;
  };
  gemini: {
    configured: boolean;
    masked: string | null;
    updatedAt: string | null;
  };
  huggingface: {
    configured: boolean;
    masked: string | null;
    updatedAt: string | null;
  };
}

export interface AdminChatSettings {
  provider: AdminChatProviderSettings;
  embeddings: AdminEmbeddingProviderSettings;
  providerKeys: AdminAiProviderSecrets;
  runtime: {
    aiEnabled: boolean;
    enableSimilarityExpansion: boolean;
    strictCitationsDefault: boolean;
    historyLimit: number;
    maxEvidenceItems: number;
    temperature: number;
    maxTokens: number;
  };
}

export interface AdminChatSettingsUpdateInput {
  provider: {
    llmProvider: string;
    llmModel: string;
    llmBaseUrl: string | null;
    llmTemperature: number;
    llmMaxTokens: number;
  };
  embeddings: {
    embeddingProvider: string;
    embeddingModel: string;
    embeddingBaseUrl: string | null;
    fallbackProvider: string | null;
    fallbackModel: string | null;
    fallbackBaseUrl: string | null;
    vectorDimensions: number;
    schemaDimensions: number;
  };
  runtime: {
    aiEnabled: boolean;
    enableSimilarityExpansion: boolean;
    strictCitationsDefault: boolean;
    historyLimit: number;
    maxEvidenceItems: number;
    temperature: number;
    maxTokens: number;
  };
  providerKeys?: {
    deepseekApiKey?: string | null;
    geminiApiKey?: string | null;
    huggingFaceApiKey?: string | null;
    clearDeepseekApiKey?: boolean;
    clearGeminiApiKey?: boolean;
    clearHuggingFaceApiKey?: boolean;
  };
  apiKey?: string | null;
  clearApiKey?: boolean;
}

export interface ChatHistoryMessage {
  id?: string;
  role: ChatRole;
  content: string;
  citations?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface ChatRetrievalSummary {
  originalQuery: string;
  effectiveQuery: string;
  normalizedQuery: string;
  contextUse: "none" | "light" | "full";
  rewriteMode: "none" | "heuristic" | "llm";
  denseRetrievalGate: "on" | "off";
  retrievalConfidence: "strong" | "medium" | "weak" | "unknown";
  ambiguityFlags: string[];
  expansionsUsed: ChatExpansionSignal[];
  stageTimings: Record<string, number>;
}

export interface ChatPromptBuildInput {
  userMessage: string;
  responseMode: ChatResponseMode;
  history: ChatHistoryMessage[];
  evidencePack: ChatEvidenceItem[];
  settings: ChatSessionSettings;
  retrieval: ChatRetrievalSummary;
}

export interface ChatPromptBuildResult {
  systemPrompt: string;
  messages: ChatHistoryMessage[];
  responseFormat: "json";
}

export interface GroundedAnswerPayload {
  answer: string;
  citations: string[];
  clarificationQuestion?: string | null;
  refusal?: boolean;
  refusalReason?: string | null;
}

export interface CitationValidationResult {
  text: string;
  validCitations: string[];
  invalidCitations: string[];
  grounded: boolean;
  fallbackText?: string | null;
}

export interface LlmProviderInfo {
  name: string;
  family: string;
  baseUrl?: string | null;
}

export interface LlmProviderCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsStrictCitationMode: boolean;
  supportsToolCalls: boolean;
}

export interface LlmGenerationInput {
  systemPrompt: string;
  messages: ChatHistoryMessage[];
  evidencePack: ChatEvidenceItem[];
  model: string;
  temperature: number;
  maxTokens: number;
  responseFormat: "json";
  strictCitationMode: boolean;
  metadata?: Record<string, JsonValue>;
}

export interface LlmGenerationResult {
  assistantText: string;
  structuredOutput?: GroundedAnswerPayload | null;
  citations: string[];
  finishReason: string | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  } | null;
  providerMetadata?: Record<string, JsonValue> | null;
  refusal?: {
    refused: boolean;
    reason?: string | null;
  } | null;
}

export interface LlmProvider {
  readonly info: LlmProviderInfo;
  readonly capabilities: LlmProviderCapabilities;
  generate(input: LlmGenerationInput): Promise<LlmGenerationResult>;
}

export interface ChatModelInfo {
  provider: string;
  model: string;
  family?: string;
  baseUrl?: string | null;
}

export type ChatCompletionInput = LlmGenerationInput;
export type ChatCompletionResult = LlmGenerationResult;

export interface ChatModelProvider {
  readonly info: ChatModelInfo;
  complete(input: ChatCompletionInput): Promise<ChatCompletionResult>;
}

export interface ChatBackendRequest {
  sessionId?: string | null;
  userMessage: string;
  evidencePack: ChatEvidenceItem[];
  retrieval: ChatRetrievalSummary;
  settings: ChatSessionSettings;
}

export interface ChatBackendResponse {
  sessionId: string;
  title: string | null;
  userMessageId: string;
  assistantMessageId: string;
  answer: string;
  citations: ChatCitation[];
  groundingStatus: ChatGroundingStatus;
  clarificationQuestion?: string | null;
  refusalReason?: string | null;
  provider: {
    name: string;
    model: string;
  };
  stageTimings: Record<string, number>;
  logId?: string | null;
}

export interface ChatTurnResult {
  sessionId: string;
  title: string | null;
  userMessage: ChatHistoryMessage;
  assistantMessage: ChatHistoryMessage;
  citations: ChatCitation[];
  evidencePack: ChatEvidenceItem[];
  retrieval: ChatRetrievalSummary;
  groundingStatus: ChatGroundingStatus;
  clarificationQuestion?: string | null;
  refusalReason?: string | null;
}
