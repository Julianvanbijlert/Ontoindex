import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, Edit2, GitBranch, MessageSquare, RefreshCcw } from "lucide-react";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export interface NotificationItem {
  id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  is_read: boolean | null;
  created_at: string;
}

export const notificationTypeConfig: Record<
  string,
  {
    icon: typeof Bell;
    label: string;
    color: string;
  }
> = {
  definition_changed: { icon: Edit2, label: "Definition changed", color: "text-info" },
  definition_status_changed: { icon: RefreshCcw, label: "Definition status changed", color: "text-warning" },
  ontology_changed: { icon: GitBranch, label: "Ontology changed", color: "text-accent" },
  definition_comment: { icon: MessageSquare, label: "Definition comment", color: "text-primary" },
  review_assignment: { icon: Bell, label: "Review assignment", color: "text-primary" },
};

export async function fetchNotifications(client: AppSupabaseClient, userId: string, limit?: number) {
  let query = client
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data || []) as NotificationItem[];
}

export async function markNotificationRead(client: AppSupabaseClient, id: string, userId: string) {
  const { error } = await client
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(client: AppSupabaseClient, userId: string) {
  const { error } = await client
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }
}
