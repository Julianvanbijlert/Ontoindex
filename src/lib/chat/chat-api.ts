import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ChatBackendRequest, ChatBackendResponse } from "@/lib/chat/types";

type AppSupabaseClient = SupabaseClient<Database>;
const SUPABASE_FUNCTIONS_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
const IS_DEV = Boolean(import.meta.env.DEV);

export class ChatEdgeFunctionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId: string | null = null,
    public readonly status: number | null = null,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ChatEdgeFunctionError";
  }
}

interface ResponseLike {
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function isResponseLike(value: unknown): value is ResponseLike {
  return Boolean(value)
    && typeof value === "object"
    && ("status" in (value as Record<string, unknown>))
    && (typeof (value as ResponseLike).json === "function" || typeof (value as ResponseLike).text === "function");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : String(message || "");
  }

  return String(error || "");
}

function mapStatusOnlyChatFunctionError(status: number | undefined, message: string | null = null) {
  if (status === 401 || status === 403) {
    return new ChatEdgeFunctionError(
      message || "Your session is not authorized to use grounded chat right now. Sign in again and verify function access.",
      "unauthorized",
      null,
      status,
    );
  }

  if (status === 404) {
    return new ChatEdgeFunctionError(
      "Chat backend is not available in this environment yet. Deploy the chat-complete Edge Function.",
      "edge_function_not_deployed",
      null,
      404,
    );
  }

  if (status === 500 || status === 502 || status === 503) {
    return new ChatEdgeFunctionError(
      message || "The chat backend failed before it could return a structured response. Check the chat-complete runtime logs.",
      "chat_backend_runtime_error",
      null,
      status,
    );
  }

  return null;
}

async function normalizeChatFunctionError(error: unknown) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;

    if (isResponseLike(context)) {
      try {
        let payload: {
          error?: string;
          code?: string;
          requestId?: string | null;
          details?: Record<string, unknown> | null;
        } | null = null;
        let textPayload: string | null = null;

        if (typeof context.json === "function") {
          payload = await context.json() as {
            error?: string;
            code?: string;
            requestId?: string | null;
            details?: Record<string, unknown> | null;
          };
        } else if (typeof context.text === "function") {
          textPayload = await context.text();

          try {
            payload = JSON.parse(textPayload) as {
              error?: string;
              code?: string;
              requestId?: string | null;
              details?: Record<string, unknown> | null;
            };
          } catch (_jsonParseError) {
            payload = null;
          }
        }

        if (payload?.error) {
          return new ChatEdgeFunctionError(
            payload.error,
            payload.code || "chat_backend_error",
            payload.requestId || null,
            typeof context.status === "number" ? context.status : null,
            payload.details || null,
          );
        }

        const statusOnlyError = mapStatusOnlyChatFunctionError(
          typeof context.status === "number" ? context.status : undefined,
          textPayload?.trim() || null,
        );

        if (statusOnlyError) {
          return statusOnlyError;
        }
      } catch (_responseError) {
        const statusOnlyError = mapStatusOnlyChatFunctionError(
          typeof context.status === "number" ? context.status : undefined,
        );

        if (statusOnlyError) {
          return statusOnlyError;
        }
      }
    }
  }

  const message = getErrorMessage(error);

  if (message.includes("Failed to send a request to the Edge Function") || message === "Failed to fetch") {
    return new ChatEdgeFunctionError(
      "Chat backend request failed before the browser received a usable response. Verify function CORS/access settings and the chat-complete runtime logs.",
      "edge_function_transport_error",
    );
  }

  return new ChatEdgeFunctionError(
    message || "Unable to reach the chat backend.",
    "chat_backend_error",
  );
}

async function parseChatFunctionResponse(response: Response) {
  const requestId = response.headers.get("X-Request-Id");
  const text = await response.text();
  let payload: {
    error?: string;
    code?: string;
    requestId?: string | null;
    details?: Record<string, unknown> | null;
  } | null = null;

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as {
        error?: string;
        code?: string;
        requestId?: string | null;
        details?: Record<string, unknown> | null;
      };
    } catch (_error) {
      payload = null;
    }
  }

  if (IS_DEV) {
    console.info("chat_complete_response_received", {
      status: response.status,
      ok: response.ok,
      requestId,
      parseableJson: Boolean(payload),
      errorCode: payload?.code || null,
      hasDetails: Boolean(payload?.details),
      bodyLength: text.length,
    });
  }

  if (!response.ok) {
    throw new ChatEdgeFunctionError(
      payload?.error
        || text.trim()
        || mapStatusOnlyChatFunctionError(response.status)?.message
        || "Unable to reach the chat backend.",
      payload?.code
        || mapStatusOnlyChatFunctionError(response.status)?.code
        || "chat_backend_error",
      payload?.requestId || requestId,
      response.status,
      payload?.details || null,
    );
  }

  if (!text.trim()) {
    throw new ChatEdgeFunctionError(
      "The chat backend returned no response.",
      "chat_backend_empty_response",
      requestId,
      response.status,
    );
  }

  try {
    return JSON.parse(text) as ChatBackendResponse;
  } catch (_parseError) {
    throw new ChatEdgeFunctionError(
      "The chat backend returned an unreadable response payload.",
      "chat_backend_invalid_response",
      requestId,
      response.status,
    );
  }
}

export async function requestChatCompletion(
  client: AppSupabaseClient,
  request: ChatBackendRequest,
) {
  const sessionResponse = await client.auth.getSession();
  const accessToken = sessionResponse.data.session?.access_token || null;

  if (!accessToken) {
    throw new ChatEdgeFunctionError(
      "You must be signed in to use grounded chat.",
      "unauthorized",
      null,
      401,
    );
  }

  if (!SUPABASE_FUNCTIONS_URL || SUPABASE_FUNCTIONS_URL === "/functions/v1") {
    throw new ChatEdgeFunctionError(
      "The Supabase function URL is not configured for this environment.",
      "chat_backend_url_missing",
    );
  }

  try {
    const requestUrl = `${SUPABASE_FUNCTIONS_URL}/chat-complete`;
    if (IS_DEV) {
      console.info("chat_complete_request_started", {
        url: requestUrl,
        hasAccessToken: Boolean(accessToken),
        hasPublishableKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
      });
    }

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(request),
    });

    return await parseChatFunctionResponse(response);
  } catch (error) {
    if (error instanceof ChatEdgeFunctionError) {
      throw error;
    }

    console.error("Chat completion request failed", {
      message: getErrorMessage(error),
    });
    throw await normalizeChatFunctionError(error);
  }
}
