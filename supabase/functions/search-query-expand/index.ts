import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { loadAiRuntimeRows } from "../_shared/ai-admin-settings.ts";
import { readSearchQueryExpansionConfig } from "../_shared/search-ai-config.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface QueryExpansionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface GeminiQueryExpansionResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function normalizeContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function parseExpandedQueries(content: string, originalQuery: string) {
  const normalizedOriginal = originalQuery.trim().toLowerCase();

  try {
    const parsed = JSON.parse(content) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && Array.isArray((parsed as { expansions?: unknown }).expansions))
        ? (parsed as { expansions: unknown[] }).expansions
        : [];

    const deduped = new Map<string, string>();
    values.forEach((value) => {
      if (typeof value !== "string") {
        return;
      }

      const normalized = value.trim().replace(/\s+/g, " ");
      if (!normalized) {
        return;
      }

      if (normalized.toLowerCase() === normalizedOriginal) {
        return;
      }

      if (!deduped.has(normalized.toLowerCase())) {
        deduped.set(normalized.toLowerCase(), normalized);
      }
    });

    return [...deduped.values()].slice(0, 6);
  } catch (_error) {
    return [];
  }
}

function providerRequiresApiKey(provider: string) {
  return provider !== "gemini" && provider !== "lmstudio" && provider !== "mock";
}

async function requireUser(request: Request) {
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: request.headers.get("Authorization") || "",
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireUser(request);
    const adminClient = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;
    const aiRuntimeRows = await loadAiRuntimeRows(adminClient);

    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) {
      return new Response(JSON.stringify({
        expansions: [],
        providerConfigured: false,
        provider: null,
        model: null,
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const config = readSearchQueryExpansionConfig(aiRuntimeRows);

    const missingModel = !config.model?.trim();
    const missingBaseUrl = config.provider !== "mock" && !config.baseUrl?.trim();
    const missingApiKey = providerRequiresApiKey(config.provider) && !config.apiKey;

    if (missingModel || missingBaseUrl || missingApiKey) {
      return new Response(JSON.stringify({
        error: missingModel
          ? "Query expansion provider is missing a model."
          : missingBaseUrl
            ? "Query expansion provider is missing a base URL."
            : config.provider === "gemini"
              ? "Query expansion provider not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY."
              : "Query expansion provider not configured.",
        code: "provider_not_configured",
        provider: config.provider,
        model: config.model,
      }), {
        status: 503,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const providerRequest = config.provider === "gemini"
      ? fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              role: "system",
              parts: [{ text: "Expand the user's search query into short semantic equivalents, synonyms, and related lookup terms. Return only a JSON array of strings." }],
            },
            contents: [{
              role: "user",
              parts: [{ text: `Expand the following search query into semantic equivalents, synonyms, and related terms.\n\nQuery: "${query}"\n\nReturn ONLY a JSON array of strings.` }],
            }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 200,
              responseMimeType: "application/json",
            },
          }),
        })
      : fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            max_tokens: 200,
            messages: [
              {
                role: "system",
                content: "Expand the user's search query into short semantic equivalents, synonyms, and related lookup terms. Return only a JSON array of strings.",
              },
              {
                role: "user",
                content: `Expand the following search query into semantic equivalents, synonyms, and related terms.\n\nQuery: "${query}"\n\nReturn ONLY a JSON array of strings.`,
              },
            ],
          }),
        });

    const response = await providerRequest;

    if (!response.ok) {
      const message = await response.text();
      return new Response(JSON.stringify({
        error: "Query expansion request failed.",
        code: "provider_request_failed",
        provider: config.provider,
        model: config.model,
        status: response.status,
        details: message,
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const payload = await response.json() as QueryExpansionResponse | GeminiQueryExpansionResponse;
    const content = config.provider === "gemini"
      ? ((payload as GeminiQueryExpansionResponse).candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "")
      : normalizeContent((payload as QueryExpansionResponse).choices?.[0]?.message?.content);
    const expansions = parseExpandedQueries(content, query);

    return new Response(JSON.stringify({
      expansions,
      providerConfigured: true,
      provider: config.provider,
      model: config.model,
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unable to expand query.",
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
