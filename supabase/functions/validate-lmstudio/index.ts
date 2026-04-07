import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireDatabaseAdminAccess, AdminAccessError } from "../_shared/admin-access.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateLmStudioConnection } from "../_shared/lmstudio-validation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function requireAdmin(request: Request) {
  const userClient = createUserClient(request);
  const adminClient = createAdminClient();

  await requireDatabaseAdminAccess({
    getUser: async () => {
      const {
        data: { user },
        error,
      } = await userClient.auth.getUser();

      if (error || !user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email ?? null,
        requestedRole: typeof user.user_metadata?.requested_role === "string"
          ? user.user_metadata.requested_role
          : null,
      };
    },
    loadProfile: async (userId) => {
      const { data, error } = await adminClient
        .from("profiles")
        .select("user_id, email")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        userId: data.user_id,
        email: typeof data.email === "string" ? data.email : null,
      };
    },
    loadRoles: async (userId) => {
      const { data, error } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error || !data) {
        return [];
      }

      return data
        .map((row) => (typeof row.role === "string" ? row.role : null))
        .filter((role): role is string => Boolean(role));
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed",
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    await requireAdmin(request);

    const body = await request.json();
    const result = await validateLmStudioConnection({
      baseUrl: typeof body?.baseUrl === "string" ? body.baseUrl : null,
      chatModel: typeof body?.chatModel === "string" ? body.chatModel : null,
      embeddingModel: typeof body?.embeddingModel === "string" ? body.embeddingModel : null,
    });

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate LM Studio.";
    const status = error instanceof AdminAccessError
      ? error.status
      : message === "Unauthorized"
        ? 401
        : message === "Admin access required"
          ? 403
          : 400;

    return new Response(JSON.stringify({
      error: message,
    }), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
