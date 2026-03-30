import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { loadAiRuntimeRows } from "../_shared/ai-admin-settings.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { embedTexts, toVectorString } from "../_shared/search-embeddings.ts";
import {
  embedStaleDocuments,
  syncEntity,
  syncOntologySubtree,
  type SearchEmbeddingProvider,
} from "../_shared/search-index-maintenance.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

type SearchIndexAction =
  | "syncEntity"
  | "syncOntologySubtree"
  | "embedStaleDocuments";

interface SyncEntityRequest {
  action: "syncEntity";
  entityId?: string;
}

interface SyncOntologySubtreeRequest {
  action: "syncOntologySubtree";
  ontologyId?: string;
}

interface EmbedStaleDocumentsRequest {
  action: "embedStaleDocuments";
  limit?: number;
  workerId?: string;
}

type SearchIndexRequest =
  | SyncEntityRequest
  | SyncOntologySubtreeRequest
  | EmbedStaleDocumentsRequest;

function createUserClient(request: Request) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: request.headers.get("Authorization") || "",
      },
    },
  });
}

async function requireAuthorizedOperator(request: Request) {
  const expectedToken = supabaseServiceRoleKey.trim();
  const authorization = (request.headers.get("Authorization") || "").trim();
  const apiKey = (request.headers.get("apikey") || "").trim();
  const [scheme = "", ...tokenParts] = authorization.split(/\s+/);
  const bearerToken = tokenParts.join(" ").trim();

  if (!expectedToken) {
    throw new Error("Service role key is not configured in the function runtime.");
  }

  const hasServiceRoleToken =
    (scheme.toLowerCase() !== "bearer" || !bearerToken || bearerToken !== expectedToken)
    ? apiKey === expectedToken
    : bearerToken === expectedToken || apiKey === expectedToken;

  if (hasServiceRoleToken) {
    return;
  }

  if (!supabaseAnonKey) {
    throw new Error("Unauthorized");
  }

  const userClient = createUserClient(request);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const adminClient = createAdminClient();
  const { data: isAdmin, error: roleError } = await adminClient.rpc<boolean>("has_role", {
    _user_id: user.id,
    _role: "admin",
  });

  if (roleError || !isAdmin) {
    throw new Error("Unauthorized");
  }
}

function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getAction(body: unknown): SearchIndexAction | null {
  if (!body || typeof body !== "object" || !("action" in body)) {
    return null;
  }

  const action = (body as { action?: string }).action;
  return action === "syncEntity" || action === "syncOntologySubtree" || action === "embedStaleDocuments"
    ? action
    : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAuthorizedOperator(request);

    const body = await request.json() as SearchIndexRequest;
    const action = getAction(body);

    if (!action) {
      throw new Error("A valid search indexing action is required.");
    }

    const adminClient = createAdminClient();
    const aiRuntimeRows = await loadAiRuntimeRows(adminClient);
    const embeddingProvider: SearchEmbeddingProvider = {
      embedDocuments: (texts) => embedTexts(texts, aiRuntimeRows),
      toVectorString,
    };
    let payload: Record<string, unknown>;

    if (action === "syncEntity") {
      const entityRequest = body as SyncEntityRequest;
      const entityId = typeof entityRequest.entityId === "string" ? entityRequest.entityId : "";

      if (!entityId) {
        throw new Error("entityId is required for syncEntity.");
      }

      payload = {
        action,
        result: await syncEntity(adminClient, entityId),
      };
    } else if (action === "syncOntologySubtree") {
      const ontologyRequest = body as SyncOntologySubtreeRequest;
      const ontologyId = typeof ontologyRequest.ontologyId === "string" ? ontologyRequest.ontologyId : "";

      if (!ontologyId) {
        throw new Error("ontologyId is required for syncOntologySubtree.");
      }

      payload = {
        action,
        result: await syncOntologySubtree(adminClient, ontologyId),
      };
    } else {
      console.info("search_index_embedding_backfill", {
        action,
        note: "Run embedStaleDocuments and verify docs_with_embedding > 0 in public.search_documents.",
      });
      const result = await embedStaleDocuments(adminClient, embeddingProvider, {
        limit: (body as EmbedStaleDocumentsRequest).limit,
        workerId: (body as EmbedStaleDocumentsRequest).workerId,
      });
      console.info("search_index_embedding_backfill_result", {
        action,
        providerConfigured: result.providerConfigured ?? null,
        providerUsed: result.providerUsed ?? null,
        model: result.model ?? null,
        documentCount: result.documentCount ?? 0,
        synced: result.synced ?? 0,
      });
      payload = {
        action,
        ...result,
      };
    }

    return new Response(JSON.stringify(payload), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unable to synchronize the search index.",
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
