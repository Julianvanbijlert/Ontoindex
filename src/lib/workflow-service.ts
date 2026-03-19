export interface WorkflowRequestRecord {
  id: string;
  status: string | null;
  message: string | null;
  review_message: string | null;
  created_at: string;
  updated_at: string;
  definition_id: string;
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

