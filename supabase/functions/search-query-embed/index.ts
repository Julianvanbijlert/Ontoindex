import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { loadAiRuntimeRows } from "../_shared/ai-admin-settings.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { readSearchEmbeddingConfig } from "../_shared/search-ai-config.ts";
import { createEmbeddingProviderClient, toVectorString } from "../_shared/search-embeddings.ts";
import {
  buildContextSummary,
  buildEmbeddingInput,
  buildSearchQueryEmbeddingCacheKey,
  normalizeContextEmbeddingMode,
} from "../_shared/search-query-context.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function normalizeSessionId(value: string | null | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function createAdminClient() {
  if (!supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function readContextEmbeddingMode() {
  return normalizeContextEmbeddingMode(Deno.env.get("SEARCH_CONTEXT_EMBEDDING_MODE") || "concat");
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
    const user = await requireUser(request);
    const adminClient = createAdminClient();
    const aiRuntimeRows = await loadAiRuntimeRows(adminClient);
    const embeddingConfig = readSearchEmbeddingConfig(aiRuntimeRows);

    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const contextHash = typeof body?.contextHash === "string" ? body.contextHash.trim() : "";
    const sessionId = normalizeSessionId(typeof body?.sessionId === "string" ? body.sessionId.trim() : "");
    const fallbackContextSummary = typeof body?.contextSummary === "string" ? body.contextSummary.trim() : "";
    const requestedMode = normalizeContextEmbeddingMode(
      typeof body?.mode === "string" ? body.mode : readContextEmbeddingMode(),
    );
    const cacheKey = buildSearchQueryEmbeddingCacheKey(query, contextHash || "none");

    if (!query) {
      return new Response(JSON.stringify({
        embedding: null,
        model: null,
        debug: {
          cacheHit: false,
          cacheKey,
          contextHash: contextHash || null,
          contextSummary: null,
          contextSummarySource: "none",
          effectiveMode: "none",
          requestedMode,
          sessionModeFallback: false,
        },
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const startedAt = Date.now();
    if (adminClient) {
      const cacheResponse = await adminClient
        .from("search_query_embeddings")
        .select("embedding, model, debug_metadata, context_mode, context_summary")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cacheResponse.data?.embedding && cacheResponse.data.context_mode === requestedMode) {
        return new Response(JSON.stringify({
          embedding: cacheResponse.data.embedding,
          model: cacheResponse.data.model,
          latencyMs: Date.now() - startedAt,
          providerConfigured: true,
          debug: {
            ...(cacheResponse.data.debug_metadata || {}),
            cacheHit: true,
            cacheKey,
            contextHash: contextHash || null,
            reindexRequired: embeddingConfig.reindexRequired,
            embeddingConfigFingerprint: embeddingConfig.activeFingerprint,
            indexedConfigFingerprint: embeddingConfig.lastIndexedFingerprint,
            selectedEmbeddingConfigFingerprint: embeddingConfig.selectedFingerprint,
            activeEmbeddingGenerationId: embeddingConfig.activeGenerationId,
            selectedEmbeddingGenerationId: embeddingConfig.targetGenerationId,
          },
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }
    }

    const contextSummaryState = adminClient
      ? await buildContextSummary(adminClient, {
          userId: user.id,
          sessionId,
          fallbackSummary: fallbackContextSummary || null,
        })
      : {
          summary: fallbackContextSummary || null,
          debug: {
            recentQueryCount: 0,
            recentEntityCount: 0,
            source: fallbackContextSummary ? "fallback" : "none",
          },
        };
    const embeddingInputState = buildEmbeddingInput(query, {
      mode: requestedMode,
      contextSummary: contextSummaryState.summary,
    });
    const embeddingProvider = createEmbeddingProviderClient(aiRuntimeRows, "active");
    const embeddingResult = await embeddingProvider.embedQuery(embeddingInputState.embeddingInput);
    const embedding = embeddingResult.providerConfigured && embeddingResult.embedding.length > 0
      ? toVectorString(embeddingResult.embedding)
      : null;
    console.info("search_query_embedding_result", {
      providerUsed: embeddingResult.providerUsed || embeddingResult.info.provider || null,
      model: embeddingResult.info.model || null,
      providerConfigured: embeddingResult.providerConfigured,
      parsedEmbeddingCount: embeddingResult.embedding.length ? 1 : 0,
      firstEmbeddingVectorLength: embeddingResult.embedding.length,
      configurationError: embeddingResult.configurationError || null,
      configuredDimensions: embeddingResult.info.dimensions,
      storageDimensions: embeddingResult.info.storageDimensions || null,
    });
    const debug = {
      cacheHit: false,
      cacheKey,
      contextHash: contextHash || null,
      contextSummary: embeddingInputState.contextSummary,
      contextSummarySource: contextSummaryState.debug.source,
      effectiveMode: embeddingInputState.effectiveMode,
      requestedMode: embeddingInputState.requestedMode,
      sessionModeFallback: embeddingInputState.sessionModeFallback,
      summaryDebug: contextSummaryState.debug,
      embeddingProvider: embeddingResult.providerUsed || embeddingResult.info.provider || null,
      embeddingModel: embeddingResult.info.model || null,
      embeddingDimensions: embeddingResult.info.dimensions,
      embeddingStorageDimensions: embeddingResult.info.storageDimensions || null,
      reindexRequired: embeddingConfig.reindexRequired,
      embeddingConfigFingerprint: embeddingConfig.activeFingerprint,
      indexedConfigFingerprint: embeddingConfig.lastIndexedFingerprint,
      selectedEmbeddingConfigFingerprint: embeddingConfig.selectedFingerprint,
      activeEmbeddingGenerationId: embeddingConfig.activeGenerationId,
      selectedEmbeddingGenerationId: embeddingConfig.targetGenerationId,
    };

    if (adminClient && embedding) {
      await adminClient
        .from("search_query_embeddings")
        .upsert({
          cache_key: cacheKey,
          user_id: user.id,
          session_id: sessionId,
          query_text: query,
          context_hash: contextHash || "none",
          context_mode: requestedMode,
          context_summary: embeddingInputState.contextSummary,
          embedding,
          model: embeddingResult.info.model,
          embedding_provider: embeddingResult.providerUsed || embeddingResult.info.provider || null,
          embedding_dimensions: embeddingResult.info.storageDimensions || embeddingResult.info.dimensions,
          debug_metadata: debug,
          expires_at: new Date(Date.now() + (1000 * 60 * 60 * 24)).toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "cache_key",
        });
    }

    return new Response(JSON.stringify({
      embedding,
      latencyMs: Date.now() - startedAt,
      model: embeddingResult.info.model,
      provider: embeddingResult.providerUsed || embeddingResult.info.provider || null,
      dimensions: embeddingResult.info.dimensions,
      storageDimensions: embeddingResult.info.storageDimensions || null,
      providerConfigured: embeddingResult.providerConfigured,
      providerError: embeddingResult.configurationError || null,
      debug,
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unable to embed query.",
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
