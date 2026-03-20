import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { APP_ROLES, normalizeRole, pickHighestRole, type AppRole } from "@/lib/authorization";

type AppSupabaseClient = SupabaseClient<Database>;
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
type RoleUpdateRpcName = "update_my_role" | "admin_update_user_access";
type RoleUpdatePayload = {
  success?: boolean;
  user_id?: string;
  role?: string;
  message?: string;
  code?: string;
  team?: string | null;
};

export type EditableRole = AppRole;
export const editableRoles: EditableRole[] = [...APP_ROLES];

export interface RoleUpdateResult {
  success: true;
  userId: string;
  role: EditableRole;
  message: string;
}

export class RoleChangeError extends Error {
  constructor(
    public readonly code:
      | "unauthorized-role-change"
      | "invalid-role",
    message: string,
  ) {
    super(message);
    this.name = "RoleChangeError";
  }
}

function isEditableRole(value: unknown): value is EditableRole {
  return typeof value === "string" && editableRoles.includes(value as EditableRole);
}

async function readRoleUpdateErrorPayload(error: unknown) {
  if (error && typeof error === "object") {
    return error as RoleUpdatePayload;
  }

  return null;
}

async function getRoleUpdateErrorMessage(error: unknown) {
  const payload = await readRoleUpdateErrorPayload(error);
  const code = typeof payload?.code === "string" ? payload.code : undefined;
  const payloadMessage = typeof payload?.message === "string" ? payload.message : undefined;
  const rawMessage = typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";
  const normalizedMessage = rawMessage.toLowerCase();

  if (code === "PGRST202" || normalizedMessage.includes("could not find the function")) {
    return "The role update service is not configured in the database.";
  }

  if (code === "invalid_role") {
    return payloadMessage || "The selected role is not supported.";
  }

  if (code === "not_authenticated") {
    return payloadMessage || "You need to be signed in to change roles.";
  }

  if (code === "unauthorized" || normalizedMessage.includes("admin access required")) {
    return "Only admins can change another user's role.";
  }

  if (code === "user_not_found" || normalizedMessage.includes("target user profile not found")) {
    return "The target user profile could not be found.";
  }

  if (normalizedMessage.includes("authentication required")) {
    return "You need to be signed in to change roles.";
  }

  if (payloadMessage) {
    return payloadMessage;
  }

  if (
    normalizedMessage.includes("check constraint") ||
    normalizedMessage.includes("unsupported role selection")
  ) {
    return "The selected role is not supported.";
  }

  return rawMessage || "Unable to update role information.";
}

function getRoleReadErrorMessage(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  if (error.code === "42501") {
    return "Your account is not allowed to read role information.";
  }

  return error.message || "Unable to load role information.";
}

function toCanonicalRoleList(rows: Array<Pick<UserRoleRow, "role">>) {
  const normalizedRoles = Array.from(
    new Set(rows.map((row) => normalizeRole(row.role))),
  );

  return normalizedRoles.length > 0 ? normalizedRoles : ["viewer"];
}

export async function fetchPrimaryRolesForUsers(client: AppSupabaseClient, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return {} as Record<string, EditableRole>;
  }

  const { data, error } = await client
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", uniqueUserIds);

  if (error) {
    console.error("Failed to load role assignments", {
      userIds: uniqueUserIds,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(getRoleReadErrorMessage(error));
  }

  const groupedRoles = new Map<string, Array<Pick<UserRoleRow, "role">>>();

  for (const row of (data || []) as Array<Pick<UserRoleRow, "user_id" | "role">>) {
    const existingRows = groupedRoles.get(row.user_id) || [];
    existingRows.push({ role: row.role });
    groupedRoles.set(row.user_id, existingRows);
  }

  return Object.fromEntries(
    uniqueUserIds.map((userId) => [
      userId,
      pickHighestRole(toCanonicalRoleList(groupedRoles.get(userId) || [])),
    ]),
  ) as Record<string, EditableRole>;
}

export async function fetchPrimaryRoleForUser(client: AppSupabaseClient, userId: string) {
  const rolesByUserId = await fetchPrimaryRolesForUsers(client, [userId]);

  return rolesByUserId[userId] ?? "viewer";
}

function toRoleUpdateResult(
  data: RoleUpdatePayload | null,
  fallbackMessage: string,
) {
  if (!data?.success || typeof data.user_id !== "string" || !isEditableRole(data.role)) {
    throw new Error("The role update service returned an unexpected response.");
  }

  return {
    success: true as const,
    userId: data.user_id,
    role: data.role,
    message: data?.message || fallbackMessage,
  } satisfies RoleUpdateResult;
}

async function invokeRoleUpdateRpc(
  client: AppSupabaseClient,
  functionName: RoleUpdateRpcName,
  args: Record<string, unknown>,
  fallbackMessage: string,
) {
  const { data, error } = await client.rpc(functionName, args as never);

  if (error) {
    console.error("Role update RPC failed", {
      functionName,
      args,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(await getRoleUpdateErrorMessage(error));
  }

  return toRoleUpdateResult((data as RoleUpdatePayload | null) ?? null, fallbackMessage);
}

export async function updateMyRole(client: AppSupabaseClient, targetRole: EditableRole) {
  if (!editableRoles.includes(targetRole)) {
    throw new RoleChangeError("invalid-role", "Unsupported role selection");
  }

  const normalizedRole = normalizeRole(targetRole);

  return await invokeRoleUpdateRpc(
    client,
    "update_my_role",
    {
      _target_role: normalizedRole,
    },
    "Role updated",
  );
}

export async function updateUserRoleAsAdmin(
  client: AppSupabaseClient,
  userId: string,
  targetRole: EditableRole,
) {
  if (!editableRoles.includes(targetRole)) {
    throw new RoleChangeError("invalid-role", "Unsupported role selection");
  }

  const normalizedRole = normalizeRole(targetRole);
  return await invokeRoleUpdateRpc(
    client,
    "admin_update_user_access",
    {
      _target_user_id: userId,
      _target_role: normalizedRole,
      _team: null,
    },
    "User role updated",
  );
}

export function getPrimaryRole(roles: string[]) {
  return pickHighestRole(roles);
}
