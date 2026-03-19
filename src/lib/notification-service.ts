import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function markNotificationRead(client: AppSupabaseClient, id: string) {
  const { error } = await client.from("notifications").update({ is_read: true }).eq("id", id);

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
