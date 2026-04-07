import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { createChatModelProvider } from "../../../src/lib/chat/provider-factory.ts";
import { buildClarificationPrompt, buildGroundedAnswerPrompt } from "../../../src/lib/chat/prompt-builders.ts";
import { validateGroundedAnswer } from "../../../src/lib/chat/citation-validator.ts";
import type { LlmProviderRuntimeConfig } from "../../../src/lib/chat/provider-config.ts";
import type {
  ChatBackendRequest,
  ChatBackendResponse,
  ChatCitation,
  ChatHistoryMessage,
  ChatCompletionInput,
  ChatPromptBuildInput,
  ChatResponseMode,
  GroundedAnswerPayload,
} from "../../../src/lib/chat/types.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { loadChatRuntimeSettings } from "../_shared/chat-runtime-settings.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

console.info("chat_complete_module_loaded", {
  hasSupabaseUrl: Boolean(supabaseUrl),
  hasSupabaseAnonKey: Boolean(supabaseAnonKey),
  hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
});

class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

type ProviderFailureClass =
  | "quota_exceeded"
  | "invalid_api_key"
  | "provider_unavailable"
  | "malformed_provider_response";

interface ProviderFailureDiagnostic {
  provider: string;
  model: string;
  apiKeySource: string | null;
  failureClass: ProviderFailureClass;
  message: string;
  continuedToFallback: boolean;
}

function createUserClient(request: Request) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: request.headers.get("Authorization") || "",
      },
    },
  });
}

function createAdminClient() {
  if (!supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function requireUser(request: Request) {
  const client = createUserClient(request);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new ChatRequestError("Unauthorized", 401, "unauthorized");
  }

  return {
    user,
    client,
  };
}

function truncateTitle(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function buildRequestId() {
  return crypto.randomUUID();
}

function createErrorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
) {
  console.info("chat_complete_response_returned", {
    requestId,
    status,
    code,
    responseType: "error",
    hasDetails: Boolean(details),
  });
  return new Response(JSON.stringify({
    error: message,
    code,
    requestId,
    details,
  }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

function createJsonResponse(requestId: string, status: number, payload: unknown) {
  console.info("chat_complete_response_returned", {
    requestId,
    status,
    code: "ok",
    responseType: "success",
  });

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}


function summarizeRequestBody(body: ChatBackendRequest | null | undefined) {
  if (!body || typeof body !== "object") {
    return {
      hasBody: false,
    };
  }

  return {
    hasBody: true,
    hasSessionId: Boolean(body.sessionId),
    userMessageLength: typeof body.userMessage === "string" ? body.userMessage.trim().length : 0,
    evidenceItemCount: Array.isArray(body.evidencePack) ? body.evidencePack.length : 0,
    retrievalConfidence: body.retrieval?.retrievalConfidence || null,
    responseModeHint: Array.isArray(body.evidencePack) && body.evidencePack.length > 0 ? "grounded_candidate" : "clarification_candidate",
    similarityExpansionEnabled: Boolean(body.settings?.similarityExpansion),
    strictCitationsEnabled: Boolean(body.settings?.strictCitations),
    allowClarificationQuestions: Boolean(body.settings?.allowClarificationQuestions),
    hasOntologyScopeId: Boolean(body.settings?.ontologyScopeId),
  };
}

function validateChatBackendRequest(body: unknown): ChatBackendRequest {
  if (!body || typeof body !== "object") {
    throw new ChatRequestError("Chat request body must be a JSON object.", 400, "invalid_request");
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.userMessage !== "string" || candidate.userMessage.trim().length === 0) {
    throw new ChatRequestError("A non-empty userMessage is required.", 400, "invalid_request");
  }

  if (!Array.isArray(candidate.evidencePack)) {
    throw new ChatRequestError("evidencePack must be an array.", 400, "invalid_request");
  }

  if (!candidate.retrieval || typeof candidate.retrieval !== "object") {
    throw new ChatRequestError("retrieval metadata is required.", 400, "invalid_request");
  }

  if (!candidate.settings || typeof candidate.settings !== "object") {
    throw new ChatRequestError("settings are required.", 400, "invalid_request");
  }

  return candidate as unknown as ChatBackendRequest;
}

function ensureProviderChain(configs: LlmProviderRuntimeConfig[]) {
  const runnableConfigs = configs.filter((config) => {
    if (config.provider === "mock") {
      return true;
    }

    if (config.provider === "lmstudio") {
      return Boolean(config.baseUrl?.trim()) && Boolean(config.model?.trim());
    }

    return Boolean(config.apiKey);
  });

  if (configs.length === 0 || runnableConfigs.length === 0) {
    throw new ChatRequestError(
      "No configured chat provider is available for this environment.",
      503,
      "provider_config_missing",
      {
        providerChain: configs.map((config) => ({
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl || null,
          apiKeySource: config.apiKeySource || null,
          hasApiKey: Boolean(config.apiKey),
          runnable: config.provider === "mock"
            ? true
            : config.provider === "lmstudio"
              ? Boolean(config.baseUrl?.trim()) && Boolean(config.model?.trim())
              : Boolean(config.apiKey),
        })),
      },
    );
  }
}

function classifyProviderFailure(message: string): ProviderFailureClass {
  const lowered = message.toLowerCase();

  if (
    lowered.includes("resource_exhausted")
    || lowered.includes("insufficient_quota")
    || lowered.includes("quota")
    || lowered.includes("429")
  ) {
    return "quota_exceeded";
  }

  if (
    lowered.includes("invalid api key")
    || lowered.includes("api key not valid")
    || lowered.includes("incorrect api key")
    || lowered.includes("authentication")
    || lowered.includes("unauthorized")
    || lowered.includes("401")
  ) {
    return "invalid_api_key";
  }

  if (
    lowered.includes("invalid json response")
    || lowered.includes("unreadable response")
    || lowered.includes("malformed")
  ) {
    return "malformed_provider_response";
  }

  return "provider_unavailable";
}

async function generateWithFallback(
  providerConfigs: LlmProviderRuntimeConfig[],
  input: ChatCompletionInput,
) {
  const diagnostics: ProviderFailureDiagnostic[] = [];

  for (const [index, providerConfig] of providerConfigs.entries()) {
    try {
      console.info("chat_provider_attempt", {
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKeySource: providerConfig.apiKeySource || null,
      });
      const provider = createChatModelProvider(providerConfig);
      const generation = await provider.complete({
        ...input,
        model: providerConfig.model,
      });

      console.info("chat_provider_used", {
        provider: provider.info.provider,
        model: providerConfig.model,
      });
      return {
        provider,
        providerConfig,
        generation,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureClass = classifyProviderFailure(message);
      const continuedToFallback = index < providerConfigs.length - 1;
      diagnostics.push({
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKeySource: providerConfig.apiKeySource || null,
        failureClass,
        message,
        continuedToFallback,
      });
      console.warn("chat_provider_failed", {
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKeySource: providerConfig.apiKeySource || null,
        failureClass,
        message,
        continuedToFallback,
      });
    }
  }

  throw new ChatRequestError(
    `Chat provider chain failed: ${diagnostics.map((item) => `${item.provider}:${item.failureClass}`).join(" | ")}`,
    503,
    "provider_chain_failed",
    {
      providerFailures: diagnostics,
    },
  );
}

function resolveErrorStatus(error: unknown) {
  if (error instanceof ChatRequestError) {
    return error.status;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();

  if (message.includes("unauthorized")) {
    return 401;
  }

  if (message.includes("provider") || message.includes("api key")) {
    return 503;
  }

  if (
    message.includes("chat_sessions")
    || message.includes("chat_messages")
    || message.includes("chat_context_summaries")
    || message.includes("chat_logs")
    || message.includes("chat storage")
  ) {
    return 503;
  }

  return 400;
}

function resolveErrorCode(error: unknown) {
  if (error instanceof ChatRequestError) {
    return error.code;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();

  if (message.includes("unauthorized")) {
    return "unauthorized";
  }

  if (message.includes("provider") || message.includes("api key")) {
    return "provider_config_missing";
  }

  if (
    message.includes("chat_sessions")
    || message.includes("chat_messages")
    || message.includes("chat_context_summaries")
    || message.includes("chat_logs")
  ) {
    return "chat_storage_unavailable";
  }

  return "chat_backend_error";
}

function normalizeChatStorageMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lowered = message.toLowerCase();
  const missingTables = [
    "chat_sessions",
    "chat_messages",
    "chat_context_summaries",
    "chat_logs",
  ].filter((table) => lowered.includes(table));

  if (missingTables.length === 0) {
    return message;
  }

  return `Chat storage is not configured in this environment yet. Apply the latest chat migrations. Missing: ${missingTables.join(", ")}.`;
}

function toHistoryMessages(
  rows: Array<{
    id: string;
    role: string;
    content: string;
    metadata: Record<string, unknown> | null;
  }>,
): ChatHistoryMessage[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role as ChatHistoryMessage["role"],
      content: row.content,
      citations: Array.isArray(row.metadata?.citations)
        ? (row.metadata?.citations as string[])
        : [],
      metadata: row.metadata || {},
    }));
}

function buildRollingSummary(history: ChatHistoryMessage[], userMessage: string, answer: string) {
  const lines = [
    ...history.slice(-5).map((message) => `${message.role}: ${message.content}`),
    `user: ${userMessage}`,
    `assistant: ${answer}`,
  ];

  const summary = lines.join("\n").replace(/\s+/g, " ").trim();
  return summary.length > 1800 ? `${summary.slice(0, 1797)}...` : summary;
}

function buildFallbackAnswer(
  request: ChatBackendRequest,
): {
  payload: GroundedAnswerPayload;
  mode: ChatResponseMode;
  groundingStatus: ChatBackendResponse["groundingStatus"];
} {
  if (request.settings.allowClarificationQuestions) {
    return {
      mode: "clarification",
      groundingStatus: "clarification",
      payload: {
        answer: "",
        citations: [],
        clarificationQuestion: request.settings.ontologyScopeTitle
          ? `Do you want this narrowed to a specific concept within ${request.settings.ontologyScopeTitle}?`
          : "Could you narrow this to a specific ontology, concept, or relation so I can ground it better?",
        refusal: false,
        refusalReason: null,
      },
    };
  }

  return {
    mode: "clarification",
    groundingStatus: "refused",
    payload: {
      answer: "I couldn't ground a confident answer from the current evidence.",
      citations: [],
      clarificationQuestion: null,
      refusal: true,
      refusalReason: "Insufficient grounded evidence.",
    },
  };
}

function determineResponseMode(request: ChatBackendRequest): ChatResponseMode {
  if (request.evidencePack.length === 0 || request.retrieval.retrievalConfidence === "weak") {
    return "clarification";
  }

  return "grounded_answer";
}

function toCitations(request: ChatBackendRequest, citationIds: string[]): ChatCitation[] {
  const evidenceMap = new Map(request.evidencePack.map((item) => [item.citationId, item]));

  return citationIds
    .map((citationId) => evidenceMap.get(citationId))
    .filter(Boolean)
    .map((item) => ({
      id: item!.citationId,
      entityId: item!.entityId,
      entityType: item!.entityType,
      title: item!.title,
      href: item!.href,
    }));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = buildRequestId();
  console.info("chat_complete_request_received", {
    requestId,
    method: request.method,
    authHeaderPresent: Boolean(request.headers.get("Authorization")),
  });

  try {
    const { user, client } = await requireUser(request);
    console.info("chat_complete_auth_resolved", {
      requestId,
      userId: user.id,
    });
    const body = validateChatBackendRequest(await request.json());
    console.info("chat_complete_request_parsed", {
      requestId,
      ...summarizeRequestBody(body),
    });
    const adminClient = createAdminClient();

  const resolvedConfig = await loadChatRuntimeSettings(adminClient, Deno.env.toObject());
    if (!resolvedConfig.runtime.aiEnabled) {
      throw new ChatRequestError("AI features are disabled for this workspace.", 403, "ai_disabled");
    }
    const providerConfig = resolvedConfig.provider;
    const providerChain = [
      providerConfig,
      ...resolvedConfig.fallbackProviders,
    ];
    ensureProviderChain(providerChain);
    console.info("chat_complete_provider_selected", {
      requestId,
      provider: providerConfig.provider,
      model: providerConfig.model,
      providerSecretExists: Boolean(providerConfig.apiKey),
      providerKeySource: providerConfig.apiKeySource || null,
      fallbackProviderCount: resolvedConfig.fallbackProviders.length,
      fallbackProviders: resolvedConfig.fallbackProviders.map((config) => ({
        provider: config.provider,
        model: config.model,
        apiKeySource: config.apiKeySource || null,
        hasApiKey: Boolean(config.apiKey),
      })),
    });
    const startedAt = Date.now();

    let sessionId = body.sessionId || null;
    let sessionTitle: string | null = null;

    if (sessionId) {
      const sessionResponse = await client
        .from("chat_sessions")
        .select("id, title")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .single();

      if (sessionResponse.error) {
        throw sessionResponse.error;
      }

      sessionTitle = sessionResponse.data.title;

      const sessionUpdate = await client
        .from("chat_sessions")
        .update({
          settings: body.settings,
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);

      if (sessionUpdate.error) {
        throw sessionUpdate.error;
      }
    } else {
      const sessionInsert = await client
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          title: truncateTitle(body.userMessage),
          settings: body.settings,
        })
        .select("id, title")
        .single();

      if (sessionInsert.error) {
        throw sessionInsert.error;
      }

      sessionId = sessionInsert.data.id;
      sessionTitle = sessionInsert.data.title;
    }

    const historyResponse = await client
      .from("chat_messages")
      .select("id, role, content, metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(resolvedConfig.runtime.historyLimit);

    if (historyResponse.error) {
      throw historyResponse.error;
    }

    const history = toHistoryMessages([...(historyResponse.data || [])].reverse());

    const userMessageInsert = await client
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: body.userMessage,
        metadata: {
          retrieval: body.retrieval,
        },
      })
      .select("id")
      .single();

    if (userMessageInsert.error) {
      throw userMessageInsert.error;
    }

    const responseMode = determineResponseMode(body);
    let groundedPayload: GroundedAnswerPayload;
    let groundingStatus: ChatBackendResponse["groundingStatus"];
    let citationIds: string[] = [];
    let invalidCitationCount = 0;
    let providerLatencyMs = 0;
    let tokenUsage: Record<string, number | null> = {};
    let providerName = providerConfig.provider;
    let modelName = providerConfig.model;
    let refusalReason: string | null = null;

    if (body.evidencePack.length === 0) {
      const fallback = buildFallbackAnswer(body);
      groundedPayload = fallback.payload;
      groundingStatus = fallback.groundingStatus;
      refusalReason = fallback.payload.refusalReason || null;
    } else {
      const promptInput: ChatPromptBuildInput = {
        userMessage: body.userMessage,
        responseMode,
        history,
        evidencePack: body.evidencePack,
        settings: body.settings,
        retrieval: body.retrieval,
      };
      const prompt = responseMode === "clarification"
        ? buildClarificationPrompt(promptInput)
        : buildGroundedAnswerPrompt(promptInput);

      const providerStartedAt = Date.now();
      const generationResult = await generateWithFallback(providerChain, {
        systemPrompt: prompt.systemPrompt,
        messages: prompt.messages,
        evidencePack: body.evidencePack,
        model: providerConfig.model,
        temperature: resolvedConfig.runtime.answerTemperature,
        maxTokens: resolvedConfig.runtime.maxAnswerTokens,
        responseFormat: prompt.responseFormat,
        strictCitationMode: body.settings.strictCitations,
        metadata: {
          sessionId,
          retrievalConfidence: body.retrieval.retrievalConfidence,
          responseMode,
        },
      });
      const generation = generationResult.generation;
      providerLatencyMs = Date.now() - providerStartedAt;
      tokenUsage = {
        inputTokens: generation.usage?.inputTokens ?? null,
        outputTokens: generation.usage?.outputTokens ?? null,
        totalTokens: generation.usage?.totalTokens ?? null,
      };
      providerName = generationResult.provider.info.provider;
      modelName = generationResult.providerConfig.model;

      groundedPayload = generation.structuredOutput || {
        answer: generation.assistantText,
        citations: generation.citations,
        clarificationQuestion: null,
        refusal: generation.refusal?.refused || false,
        refusalReason: generation.refusal?.reason || null,
      };

      const validation = validateGroundedAnswer(
        groundedPayload,
        body.evidencePack,
        body.settings.strictCitations,
      );

      citationIds = validation.validCitations;
      invalidCitationCount = validation.invalidCitations.length;
      refusalReason = groundedPayload.refusalReason || validation.fallbackText || null;

      if (groundedPayload.refusal) {
        groundingStatus = "refused";
      } else if (responseMode === "clarification" || groundedPayload.clarificationQuestion) {
        groundingStatus = "clarification";
      } else {
        groundingStatus = validation.grounded ? "grounded" : "weak";
      }

      groundedPayload = {
        ...groundedPayload,
        answer: validation.text || validation.fallbackText || groundedPayload.answer,
        citations: citationIds,
      };
    }

    const citations = toCitations(body, citationIds);
    const assistantContent = groundedPayload.answer || groundedPayload.clarificationQuestion || "I couldn't ground a confident answer.";
    const assistantInsert = await client
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: assistantContent,
        metadata: {
          citations: citationIds,
          sources: citations,
          groundingStatus,
          clarificationQuestion: groundedPayload.clarificationQuestion || null,
          refusalReason,
          providerName,
          modelName,
        },
        retrieval_reference: {
          evidenceIds: citationIds,
          retrieval: body.retrieval,
        },
      })
      .select("id")
      .single();

    if (assistantInsert.error) {
      throw assistantInsert.error;
    }

    const rollingSummary = buildRollingSummary(history, body.userMessage, assistantContent);
    const summaryUpsert = await client
      .from("chat_context_summaries")
      .upsert({
        session_id: sessionId,
        rolling_summary: rollingSummary,
        metadata: {
          lastGroundingStatus: groundingStatus,
          lastCitationCount: citations.length,
        },
      }, {
        onConflict: "session_id",
      });

    if (summaryUpsert.error) {
      throw summaryUpsert.error;
    }

    const logInsert = await client
      .from("chat_logs")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        user_message_id: userMessageInsert.data.id,
        assistant_message_id: assistantInsert.data.id,
        user_message_text: body.userMessage,
        retrieval_plan: body.retrieval,
        expansions_used: body.retrieval.expansionsUsed,
        evidence_references: body.evidencePack.map((item) => ({
          citationId: item.citationId,
          entityId: item.entityId,
          entityType: item.entityType,
        })),
        stage_latencies: {
          retrieval: body.retrieval.stageTimings,
          providerMs: providerLatencyMs,
          totalMs: Date.now() - startedAt,
        },
        provider_name: providerName,
        model_name: modelName,
        grounding_status: groundingStatus,
        citation_count: citations.length,
        invalid_citation_count: invalidCitationCount,
        refusal: Boolean(groundedPayload.refusal),
        fallback_used: body.retrieval.retrievalConfidence === "weak",
        token_usage: tokenUsage,
        metadata: {
          clarificationQuestion: groundedPayload.clarificationQuestion || null,
          refusalReason,
        },
      })
      .select("id")
      .single();

    if (logInsert.error) {
      throw logInsert.error;
    }

    const payload: ChatBackendResponse = {
      sessionId,
      title: sessionTitle,
      userMessageId: userMessageInsert.data.id,
      assistantMessageId: assistantInsert.data.id,
      answer: assistantContent,
      citations,
      groundingStatus,
      clarificationQuestion: groundedPayload.clarificationQuestion || null,
      refusalReason,
      provider: {
        name: providerName,
        model: modelName,
      },
      stageTimings: {
        ...body.retrieval.stageTimings,
        providerMs: providerLatencyMs,
        totalMs: Date.now() - startedAt,
      },
      logId: logInsert.data.id,
    };

    console.info("chat_complete_response_ready", {
      requestId,
      sessionId,
      groundingStatus,
      providerName,
      modelName,
      citationCount: citations.length,
      totalMs: Date.now() - startedAt,
    });

    return createJsonResponse(requestId, 200, payload);
  } catch (error) {
    const errorCode = resolveErrorCode(error);
    const normalizedMessage = errorCode === "chat_storage_unavailable"
      ? normalizeChatStorageMessage(error)
      : (error instanceof Error ? error.message : "Unable to complete the grounded chat turn.");

    console.error("chat-complete failed", {
      requestId,
      code: errorCode,
      errorName: error instanceof Error ? error.name : typeof error,
      message: normalizedMessage,
      rawMessage: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(
      requestId,
      resolveErrorStatus(error),
      errorCode,
      normalizedMessage,
      error instanceof ChatRequestError ? error.details : null,
    );
  }
});
