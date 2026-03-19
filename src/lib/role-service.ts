import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export type EditableRole = "viewer" | "editor" | "admin";
export const editableRoles: EditableRole[] = ["viewer", "editor", "admin"];

export async function updateMyRole(client: AppSupabaseClient, targetRole: EditableRole) {
  if (!editableRoles.includes(targetRole)) {
    throw new Error("Unsupported role selection");
  }

  const { data, error } = await client.rpc("update_my_role", {
    _target_role: targetRole,
  });

  if (error) {
    throw error;
  }

  return data;
}

export function getPrimaryRole(roles: string[]) {
  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes("editor")) {
    return "editor";
  }

  return "viewer";
}
