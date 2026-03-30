import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type ActivityEntityType = Database["public"]["Tables"]["activity_events"]["Row"]["entity_type"];
type ActivityAction = Database["public"]["Tables"]["activity_events"]["Row"]["action"];
type ActivityEventRow = Database["public"]["Tables"]["activity_events"]["Row"];

export interface HistoryTimelineEvent {
  id: string;
  action: string;
  actor?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string | null;
  user_id: string | null;
  details: Json | null;
  created_at: string;
}

interface LogActivityEventInput {
  userId?: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityTitle?: string | null;
  details?: Json | null;
}

function summarizeActivity(event: ActivityEventRow) {
  const details = (event.details || {}) as Record<string, unknown>;
  const explicitSummary = typeof details.summary === "string" ? details.summary : null;

  if (explicitSummary) {
    return explicitSummary;
  }

  switch (event.action) {
    case "created":
      return `Created "${event.entity_title || "item"}".`;
    case "updated":
      return `Updated "${event.entity_title || "item"}".`;
    case "deleted":
      return `Deleted "${event.entity_title || "item"}".`;
    case "relationship_added":
      return `Added a relationship for "${event.entity_title || "item"}".`;
    case "relationship_removed":
      return `Removed a relationship for "${event.entity_title || "item"}".`;
    case "requested_review":
      return `Requested approval for "${event.entity_title || "item"}".`;
    case "accepted_review":
      return `Accepted the review for "${event.entity_title || "item"}".`;
    case "rejected_review":
      return `Rejected the review for "${event.entity_title || "item"}".`;
    case "status_changed":
      return `Changed workflow status for "${event.entity_title || "item"}".`;
    case "imported":
      return `Imported records into "${event.entity_title || "ontology"}".`;
    default:
      return null;
  }
}

export async function logActivityEvent(client: AppSupabaseClient, input: LogActivityEventInput) {
  if (!input.userId) {
    return;
  }

  const { error } = await client.from("activity_events").insert({
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_title: input.entityTitle ?? null,
    details: input.details ?? {},
  });

  if (error) {
    throw error;
  }
}

export async function recordEntityView(
  client: AppSupabaseClient,
  params: {
    userId?: string | null;
    entityType: "definition" | "ontology";
    entityId: string;
    entityTitle: string;
  },
) {
  await logActivityEvent(client, {
    userId: params.userId,
    action: "viewed",
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    details: {
      summary: `Viewed "${params.entityTitle}".`,
    },
  });
}

export async function fetchEntityTimelineEvents(
  client: AppSupabaseClient,
  entityType: "definition" | "ontology",
  entityId: string,
) {
  const { data, error } = await client
    .from("activity_events")
    .select("id, action, entity_type, entity_id, entity_title, user_id, details, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .neq("action", "viewed")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  const events = data || [];
  const actorIds = [...new Set(events.map((event) => event.user_id).filter(Boolean))] as string[];
  const actorMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", actorIds);

    (profiles || []).forEach((profile: any) => {
      actorMap.set(profile.user_id, profile.display_name || profile.email || "Unknown user");
    });
  }

  return events.map<HistoryTimelineEvent>((event) => ({
    id: event.id,
    action: event.action,
    actor: event.user_id ? actorMap.get(event.user_id) : undefined,
    timestamp: event.created_at,
    metadata: {
      summary: summarizeActivity(event),
      ...(typeof event.details === "object" && event.details ? event.details : {}),
    },
  }));
}

export async function fetchRecentActivity(client: AppSupabaseClient, limit = 30) {
  const { data, error } = await client.rpc("fetch_my_recent_activity", {
    _limit: limit,
  });

  if (error) {
    throw error;
  }

  return (data || []) as RecentActivityItem[];
}
