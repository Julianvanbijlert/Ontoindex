import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Bell,
  CheckCheck,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  MessageSquareReply,
  PencilLine,
  Trash2,
} from "lucide-react";
import { isThisMonth, isThisWeek, isToday } from "date-fns";

import type { Database, Json } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;
type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

export type NotificationCategory =
  | "tracking"
  | "tracked ontology activity"
  | "tracked definition activity"
  | "comments"
  | "reviews";
export type NotificationType =
  | "tracked_ontology_history_changed"
  | "tracked_definition_history_changed"
  | "ontology_workflow_changed"
  | "ontology_edited"
  | "ontology_relation_added"
  | "ontology_relation_deleted"
  | "ontology_deleted"
  | "ontology_other_activity"
  | "definition_workflow_changed"
  | "definition_edited"
  | "definition_relation_added"
  | "definition_relation_deleted"
  | "definition_deleted"
  | "definition_other_activity"
  | "comment_reply"
  | "comment_resolved"
  | "definition_commented_for_author"
  | "review_request_incorporated"
  | "assigned_definition_review"
  | "assigned_change_review";

export interface NotificationItem {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  parent_entity_type: string | null;
  parent_entity_id: string | null;
  metadata: Json | null;
}

export interface NotificationPreference {
  notification_type: NotificationType | string;
  category: NotificationCategory | string;
  label: string;
  description: string;
  default_enabled: boolean;
  enabled: boolean;
}

export interface NotificationGroup {
  id: string;
  label: string;
  items: NotificationItem[];
}

const notificationPreferenceCatalog = [
  {
    notification_type: "ontology_workflow_changed",
    category: "tracked ontology activity",
    label: "Workflow changes",
    description: "Notify me when a tracked ontology changes workflow status.",
    default_enabled: true,
  },
  {
    notification_type: "ontology_edited",
    category: "tracked ontology activity",
    label: "Edits",
    description: "Notify me when a tracked ontology is edited.",
    default_enabled: true,
  },
  {
    notification_type: "ontology_relation_added",
    category: "tracked ontology activity",
    label: "New relations",
    description: "Notify me when a tracked ontology gets a new relation.",
    default_enabled: true,
  },
  {
    notification_type: "ontology_relation_deleted",
    category: "tracked ontology activity",
    label: "Deleted relations",
    description: "Notify me when a tracked ontology loses a relation.",
    default_enabled: true,
  },
  {
    notification_type: "ontology_deleted",
    category: "tracked ontology activity",
    label: "Deletions",
    description: "Notify me when a tracked ontology is deleted.",
    default_enabled: true,
  },
  {
    notification_type: "ontology_other_activity",
    category: "tracked ontology activity",
    label: "Other activity",
    description: "Notify me about other tracked ontology history events, such as imports or review activity.",
    default_enabled: true,
  },
  {
    notification_type: "definition_workflow_changed",
    category: "tracked definition activity",
    label: "Workflow changes",
    description: "Notify me when a tracked definition changes workflow status.",
    default_enabled: true,
  },
  {
    notification_type: "definition_edited",
    category: "tracked definition activity",
    label: "Edits",
    description: "Notify me when a tracked definition is edited.",
    default_enabled: true,
  },
  {
    notification_type: "definition_relation_added",
    category: "tracked definition activity",
    label: "New relations",
    description: "Notify me when a tracked definition gets a new relation.",
    default_enabled: true,
  },
  {
    notification_type: "definition_relation_deleted",
    category: "tracked definition activity",
    label: "Deleted relations",
    description: "Notify me when a tracked definition loses a relation.",
    default_enabled: true,
  },
  {
    notification_type: "definition_deleted",
    category: "tracked definition activity",
    label: "Deletions",
    description: "Notify me when a tracked definition is deleted.",
    default_enabled: true,
  },
  {
    notification_type: "definition_other_activity",
    category: "tracked definition activity",
    label: "Other activity",
    description: "Notify me about other tracked definition history events, such as review activity.",
    default_enabled: true,
  },
  {
    notification_type: "comment_reply",
    category: "comments",
    label: "Comment replies",
    description: "Notify me when someone replies to one of my comments.",
    default_enabled: true,
  },
  {
    notification_type: "comment_resolved",
    category: "comments",
    label: "Comment resolution",
    description: "Notify me when someone resolves one of my comments.",
    default_enabled: true,
  },
  {
    notification_type: "definition_commented_for_author",
    category: "comments",
    label: "Comments on my definitions",
    description: "Notify me when someone comments on a definition I authored.",
    default_enabled: true,
  },
  {
    notification_type: "review_request_incorporated",
    category: "reviews",
    label: "My review requests were incorporated",
    description: "Notify me when a review request I created is approved and incorporated.",
    default_enabled: true,
  },
  {
    notification_type: "assigned_definition_review",
    category: "reviews",
    label: "Assigned definition reviews",
    description: "Notify me when I am assigned to review a definition.",
    default_enabled: true,
  },
  {
    notification_type: "assigned_change_review",
    category: "reviews",
    label: "Assigned change reviews",
    description: "Notify me when I am assigned to review a change.",
    default_enabled: true,
  },
] satisfies Array<Omit<NotificationPreference, "enabled">>;

function buildDefaultPreferences() {
  return notificationPreferenceCatalog.map((item) => ({
    ...item,
    enabled: item.default_enabled,
  })) as NotificationPreference[];
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown notification error";
}

function logNotificationError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const supabaseError = (error || {}) as SupabaseErrorLike;

  console.error(`[notifications] ${context}`, {
    message: toErrorMessage(error),
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    ...extra,
  });
}

function isMissingRpcError(error: unknown, rpcName: string) {
  const message = toErrorMessage(error);
  const code = (error as SupabaseErrorLike | undefined)?.code;

  return code === "PGRST202" || message.includes(`public.${rpcName}`) || message.includes(`function ${rpcName}`);
}

function isMissingRelationError(error: unknown, relationName: string) {
  const message = toErrorMessage(error).toLowerCase();
  const code = (error as SupabaseErrorLike | undefined)?.code;

  return code === "42P01" || code === "PGRST205" || message.includes(relationName.toLowerCase());
}

function isMissingColumnError(error: unknown, relationName: string, columnName: string) {
  const message = toErrorMessage(error).toLowerCase();
  const code = (error as SupabaseErrorLike | undefined)?.code;

  return (
    code === "42703"
    || code === "PGRST204"
    || message.includes(`'${columnName.toLowerCase()}' column of '${relationName.toLowerCase()}'`)
    || (message.includes(`column ${columnName.toLowerCase()}`) && message.includes(relationName.toLowerCase()))
  );
}

function normalizeNotificationItem(item: Record<string, any>) {
  return {
    id: item.id,
    type: item.type,
    title: item.title || "Notification",
    body: item.body || item.message || "",
    link_path: item.link_path || item.link || null,
    is_read: !!item.is_read,
    created_at: item.created_at,
    read_at: item.read_at || (item.is_read ? item.created_at : null),
    actor_user_id: item.actor_user_id || null,
    actor_display_name: item.actor_display_name || null,
    actor_email: item.actor_email || null,
    entity_type: item.entity_type || null,
    entity_id: item.entity_id || null,
    parent_entity_type: item.parent_entity_type || null,
    parent_entity_id: item.parent_entity_id || null,
    metadata: item.metadata || {},
  } as NotificationItem;
}

async function getCurrentUserId(client: AppSupabaseClient) {
  if (!("auth" in client) || !client.auth?.getUser) {
    return undefined;
  }

  try {
    const { data, error } = await client.auth.getUser();

    if (error) {
      logNotificationError("Failed to resolve current user", error);
      return null;
    }

    return data.user?.id ?? null;
  } catch (error) {
    logNotificationError("Failed to read auth session", error);
    return null;
  }
}

async function fetchNotificationsFromTable(
  client: AppSupabaseClient,
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  } = {},
) {
  let query = client.from("notifications").select("*").order("created_at", { ascending: false });

  if (options.unreadOnly) {
    query = query.eq("is_read", false);
  }

  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    logNotificationError("Fallback notifications table read failed", error, { options });
    throw error;
  }

  return ((data || []) as Record<string, any>[]).map(normalizeNotificationItem);
}

async function fetchUnreadCountFromTable(client: AppSupabaseClient) {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    logNotificationError("Fallback unread count query failed", error);
    throw error;
  }

  return count || 0;
}

async function updateNotificationReadStateInTable(client: AppSupabaseClient, id: string, isRead: boolean) {
  const { error } = await client
    .from("notifications")
    .update({
      is_read: isRead,
      read_at: isRead ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (!error) {
    return;
  }

  if (isMissingColumnError(error, "notifications", "read_at")) {
    logNotificationError("Notification read_at column missing during fallback update; retrying with is_read only", error, {
      id,
      isRead,
    });

    const { error: legacyUpdateError } = await client
      .from("notifications")
      .update({
        is_read: isRead,
      })
      .eq("id", id);

    if (!legacyUpdateError) {
      return;
    }

    logNotificationError("Legacy notification state update failed", legacyUpdateError, { id, isRead });
    throw legacyUpdateError;
  }

  throw error;
}

async function markAllNotificationsReadInTable(client: AppSupabaseClient) {
  const { error } = await client
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("is_read", false);

  if (!error) {
    return;
  }

  if (isMissingColumnError(error, "notifications", "read_at")) {
    logNotificationError("Notification read_at column missing during bulk fallback update; retrying with is_read only", error);

    const { error: legacyUpdateError } = await client
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("is_read", false);

    if (!legacyUpdateError) {
      return;
    }

    logNotificationError("Legacy bulk mark-read failed", legacyUpdateError);
    throw legacyUpdateError;
  }

  throw error;
}

async function fetchPreferencesFromTable(client: AppSupabaseClient) {
  const { data, error } = await client
    .from("notification_preferences")
    .select("notification_type, enabled");

  if (error) {
    if (isMissingRelationError(error, "notification_preferences")) {
      logNotificationError("Notification preferences table missing, using defaults", error);
      return buildDefaultPreferences();
    }

    logNotificationError("Fallback notification preference read failed", error);
    throw error;
  }

  const enabledByType = new Map(
    ((data || []) as Array<{ notification_type: string; enabled: boolean }>).map((row) => [
      row.notification_type,
      row.enabled,
    ]),
  );

  return buildDefaultPreferences().map((item) => ({
    ...item,
    enabled: enabledByType.get(item.notification_type) ?? item.default_enabled,
  }));
}

/**
 * Notification center helpers.
 * Keep labels, RPC access, and grouping logic centralized so inbox surfaces stay consistent.
 */
export const notificationTypeConfig: Record<
  string,
  {
    icon: typeof Bell;
    label: string;
    category: NotificationCategory;
    color: string;
  }
> = {
  tracked_ontology_history_changed: {
    icon: GitBranch,
    label: "Tracked ontology change",
    category: "tracking",
    color: "text-accent",
  },
  tracked_definition_history_changed: {
    icon: PencilLine,
    label: "Tracked definition change",
    category: "tracking",
    color: "text-info",
  },
  ontology_workflow_changed: {
    icon: GitPullRequest,
    label: "Ontology workflow change",
    category: "tracked ontology activity",
    color: "text-warning",
  },
  ontology_edited: {
    icon: PencilLine,
    label: "Ontology edited",
    category: "tracked ontology activity",
    color: "text-accent",
  },
  ontology_relation_added: {
    icon: GitBranch,
    label: "Ontology relation added",
    category: "tracked ontology activity",
    color: "text-accent",
  },
  ontology_relation_deleted: {
    icon: GitBranch,
    label: "Ontology relation removed",
    category: "tracked ontology activity",
    color: "text-destructive",
  },
  ontology_deleted: {
    icon: Trash2,
    label: "Ontology deleted",
    category: "tracked ontology activity",
    color: "text-destructive",
  },
  ontology_other_activity: {
    icon: Bell,
    label: "Ontology activity",
    category: "tracked ontology activity",
    color: "text-accent",
  },
  definition_workflow_changed: {
    icon: GitPullRequest,
    label: "Definition workflow change",
    category: "tracked definition activity",
    color: "text-warning",
  },
  definition_edited: {
    icon: PencilLine,
    label: "Definition edited",
    category: "tracked definition activity",
    color: "text-info",
  },
  definition_relation_added: {
    icon: GitBranch,
    label: "Definition relation added",
    category: "tracked definition activity",
    color: "text-info",
  },
  definition_relation_deleted: {
    icon: GitBranch,
    label: "Definition relation removed",
    category: "tracked definition activity",
    color: "text-destructive",
  },
  definition_deleted: {
    icon: Trash2,
    label: "Definition deleted",
    category: "tracked definition activity",
    color: "text-destructive",
  },
  definition_other_activity: {
    icon: Bell,
    label: "Definition activity",
    category: "tracked definition activity",
    color: "text-info",
  },
  comment_reply: {
    icon: MessageSquareReply,
    label: "Comment reply",
    category: "comments",
    color: "text-primary",
  },
  comment_resolved: {
    icon: CheckCheck,
    label: "Comment resolved",
    category: "comments",
    color: "text-success",
  },
  definition_commented_for_author: {
    icon: MessageSquare,
    label: "Comment on your definition",
    category: "comments",
    color: "text-primary",
  },
  review_request_incorporated: {
    icon: GitPullRequest,
    label: "Review request incorporated",
    category: "reviews",
    color: "text-warning",
  },
  assigned_definition_review: {
    icon: GitPullRequest,
    label: "Assigned definition review",
    category: "reviews",
    color: "text-warning",
  },
  assigned_change_review: {
    icon: GitPullRequest,
    label: "Assigned change review",
    category: "reviews",
    color: "text-warning",
  },
};

export async function fetchNotifications(
  client: AppSupabaseClient,
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  } = {},
) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    return [] as NotificationItem[];
  }

  const { data, error } = await client.rpc("fetch_my_notifications", {
    _limit: options.limit ?? 50,
    _offset: options.offset ?? 0,
    _unread_only: options.unreadOnly ?? false,
  });

  if (error) {
    logNotificationError("RPC fetch_my_notifications failed", error, { options });

    if (
      isMissingRpcError(error, "fetch_my_notifications")
      || isMissingColumnError(error, "notifications", "read_at")
    ) {
      return fetchNotificationsFromTable(client, options);
    }

    throw new Error(toErrorMessage(error));
  }

  return ((data || []) as NotificationItem[]).map((item) => normalizeNotificationItem(item as Record<string, any>));
}

export async function fetchUnreadNotificationCount(client: AppSupabaseClient) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    return 0;
  }

  const { data, error } = await client.rpc("fetch_my_notification_unread_count");

  if (error) {
    logNotificationError("RPC fetch_my_notification_unread_count failed", error);

    if (isMissingRpcError(error, "fetch_my_notification_unread_count")) {
      return fetchUnreadCountFromTable(client);
    }

    throw new Error(toErrorMessage(error));
  }

  return Number(data || 0);
}

export async function setNotificationReadState(client: AppSupabaseClient, id: string, isRead: boolean) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    throw new Error("Authentication required.");
  }

  const { error } = await client.rpc("set_my_notification_read_state", {
    _notification_id: id,
    _is_read: isRead,
  });

  if (error) {
    logNotificationError("RPC set_my_notification_read_state failed", error, { id, isRead });

    if (
      isMissingRpcError(error, "set_my_notification_read_state")
      || isMissingColumnError(error, "notifications", "read_at")
    ) {
      try {
        await updateNotificationReadStateInTable(client, id, isRead);
      } catch (updateError) {
        logNotificationError("Fallback notification state update failed", updateError, { id, isRead });
        throw new Error(toErrorMessage(updateError));
      }

      return;
    }

    throw new Error(toErrorMessage(error));
  }
}

export async function markNotificationRead(client: AppSupabaseClient, id: string) {
  await setNotificationReadState(client, id, true);
}

export async function markNotificationUnread(client: AppSupabaseClient, id: string) {
  await setNotificationReadState(client, id, false);
}

export async function markAllNotificationsRead(client: AppSupabaseClient) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    throw new Error("Authentication required.");
  }

  const { error } = await client.rpc("mark_all_my_notifications_read");

  if (error) {
    logNotificationError("RPC mark_all_my_notifications_read failed", error);

    if (
      isMissingRpcError(error, "mark_all_my_notifications_read")
      || isMissingColumnError(error, "notifications", "read_at")
    ) {
      try {
        await markAllNotificationsReadInTable(client);
      } catch (updateError) {
        logNotificationError("Fallback bulk mark-read failed", updateError);
        throw new Error(toErrorMessage(updateError));
      }

      return;
    }

    throw new Error(toErrorMessage(error));
  }
}

export async function fetchNotificationPreferences(client: AppSupabaseClient) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    return buildDefaultPreferences();
  }

  const { data, error } = await client.rpc("fetch_my_notification_preferences");

  if (error) {
    logNotificationError("RPC fetch_my_notification_preferences failed", error);

    if (
      isMissingRpcError(error, "fetch_my_notification_preferences")
      || isMissingRelationError(error, "notification_preferences")
      || isMissingRelationError(error, "notification_type_catalog")
    ) {
      return fetchPreferencesFromTable(client);
    }

    throw new Error(toErrorMessage(error));
  }

  return ((data || []) as NotificationPreference[]).map((item) => ({
    ...item,
    enabled: item.enabled ?? item.default_enabled,
  }));
}

export async function updateNotificationPreference(
  client: AppSupabaseClient,
  notificationType: string,
  enabled: boolean,
) {
  const currentUserId = await getCurrentUserId(client);

  if (currentUserId === null) {
    throw new Error("Authentication required.");
  }

  const { error } = await client.rpc("set_my_notification_preference", {
    _notification_type: notificationType,
    _enabled: enabled,
  });

  if (error) {
    logNotificationError("RPC set_my_notification_preference failed", error, {
      notificationType,
      enabled,
    });

    if (isMissingRpcError(error, "set_my_notification_preference")) {
      const { error: upsertError } = await client.from("notification_preferences").upsert(
        {
          user_id: currentUserId,
          notification_type: notificationType,
          enabled,
        },
        {
          onConflict: "user_id,notification_type",
          ignoreDuplicates: false,
        },
      );

      if (upsertError) {
        logNotificationError("Fallback notification preference upsert failed", upsertError, {
          notificationType,
          enabled,
        });

        if (isMissingRelationError(upsertError, "notification_preferences")) {
          throw new Error("Notification preferences storage is not available. Apply the latest notification migration.");
        }

        throw new Error(toErrorMessage(upsertError));
      }

      return;
    }

    throw new Error(toErrorMessage(error));
  }
}

export function getNotificationTypeMeta(type: string) {
  return (
    notificationTypeConfig[type] || {
      icon: Bell,
      label: "Notification",
      category: "tracking" as const,
      color: "text-primary",
    }
  );
}

export function groupNotifications(items: NotificationItem[]) {
  const unread = items.filter((item) => !item.is_read);
  const read = items.filter((item) => item.is_read);
  const groups: NotificationGroup[] = [];

  if (unread.length > 0) {
    groups.push({
      id: "unread",
      label: "Unread",
      items: unread,
    });
  }

  const today = read.filter((item) => isToday(new Date(item.created_at)));
  const thisWeek = read.filter(
    (item) =>
      !isToday(new Date(item.created_at)) &&
      isThisWeek(new Date(item.created_at), { weekStartsOn: 1 }),
  );
  const thisMonth = read.filter(
    (item) =>
      !isToday(new Date(item.created_at)) &&
      !isThisWeek(new Date(item.created_at), { weekStartsOn: 1 }) &&
      isThisMonth(new Date(item.created_at)),
  );
  const older = read.filter(
    (item) =>
      !isToday(new Date(item.created_at)) &&
      !isThisWeek(new Date(item.created_at), { weekStartsOn: 1 }) &&
      !isThisMonth(new Date(item.created_at)),
  );

  if (today.length > 0) {
    groups.push({ id: "today", label: "Today", items: today });
  }

  if (thisWeek.length > 0) {
    groups.push({ id: "this-week", label: "Earlier This Week", items: thisWeek });
  }

  if (thisMonth.length > 0) {
    groups.push({ id: "this-month", label: "Earlier This Month", items: thisMonth });
  }

  if (older.length > 0) {
    groups.push({ id: "older", label: "Older", items: older });
  }

  return groups;
}
