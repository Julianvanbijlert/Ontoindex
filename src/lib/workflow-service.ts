import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export interface ReviewAssignmentRecord {
  id: string;
  status: "pending" | "accepted" | "rejected";
  reviewer_user_id?: string | null;
  reviewer_team?: string | null;
  reviewed_by?: string | null;
  review_message?: string | null;
  reviewed_at?: string | null;
  profiles?: {
    display_name?: string | null;
    email?: string | null;
    team?: string | null;
  } | null;
}

export interface WorkflowRequestRecord {
  id: string;
  status: string | null;
  message: string | null;
  review_message: string | null;
  created_at: string;
  updated_at: string;
  definition_id: string;
  requested_by?: string;
  assignments?: ReviewAssignmentRecord[];
  definitions?: {
    title?: string | null;
    description?: string | null;
    status?: string | null;
  } | null;
}

export interface WorkflowFilters {
  query: string;
  status: string;
  sortBy: "recent" | "oldest" | "title" | "status";
}

export interface ReviewerOption {
  userId: string;
  displayName: string;
  email: string | null;
  team: string | null;
}

export function filterAndSortWorkflowRequests(
  requests: WorkflowRequestRecord[],
  filters: WorkflowFilters,
) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  const filtered = requests.filter((request) => {
    if (filters.status !== "all" && request.status !== filters.status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      request.definitions?.title,
      request.definitions?.description,
      request.message,
      request.review_message,
      request.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  return filtered.sort((left, right) => {
    switch (filters.sortBy) {
      case "oldest":
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      case "title":
        return (left.definitions?.title || "").localeCompare(right.definitions?.title || "");
      case "status":
        return (left.status || "").localeCompare(right.status || "");
      case "recent":
      default:
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    }
  });
}

export async function fetchReviewerOptions(client: AppSupabaseClient) {
  const { data, error } = await client
    .from("profiles")
    .select("user_id, display_name, email, team")
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  const users: ReviewerOption[] = (data || []).map((profile: any) => ({
    userId: profile.user_id,
    displayName: profile.display_name,
    email: profile.email,
    team: profile.team,
  }));
  const teams = Array.from(new Set(users.map((user) => user.team).filter(Boolean))) as string[];

  return {
    users,
    teams: teams.sort(),
  };
}

export async function upsertDefinitionReviewRequest(
  client: AppSupabaseClient,
  definitionId: string,
  params: {
    message: string;
    reviewerUserIds: string[];
    reviewerTeams: string[];
  },
) {
  const { data, error } = await client.rpc("upsert_definition_review_request", {
    _definition_id: definitionId,
    _message: params.message,
    _reviewer_user_ids: params.reviewerUserIds,
    _reviewer_teams: params.reviewerTeams,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function setReviewAssignmentDecision(
  client: AppSupabaseClient,
  assignmentId: string,
  decision: "accepted" | "rejected",
  reviewMessage: string,
) {
  const { data, error } = await client.rpc("set_review_assignment_decision", {
    _assignment_id: assignmentId,
    _decision: decision,
    _review_message: reviewMessage,
  });

  if (error) {
    throw error;
  }

  return data;
}

export function canCurrentUserReviewAssignment(
  assignment: ReviewAssignmentRecord,
  currentUserId: string | null | undefined,
  currentTeam: string | null | undefined,
  isAdmin: boolean,
) {
  if (isAdmin) {
    return true;
  }

  if (!currentUserId) {
    return false;
  }

  if (assignment.reviewer_user_id === currentUserId) {
    return true;
  }

  if (assignment.reviewer_team && currentTeam) {
    return assignment.reviewer_team.trim().toLowerCase() === currentTeam.trim().toLowerCase();
  }

  return false;
}

export function formatReviewerLabel(assignment: ReviewAssignmentRecord) {
  if (assignment.profiles?.display_name) {
    return assignment.profiles.display_name;
  }

  if (assignment.reviewer_team) {
    return `${assignment.reviewer_team} team`;
  }

  return "Assigned reviewer";
}

export function deriveAggregateReviewStatus(assignments: ReviewAssignmentRecord[]) {
  if (assignments.some((assignment) => assignment.status === "rejected")) {
    return "rejected";
  }

  if (assignments.length > 0 && assignments.every((assignment) => assignment.status === "accepted")) {
    return "approved";
  }

  return "in_review";
}
