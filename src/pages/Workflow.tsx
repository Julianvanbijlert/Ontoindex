import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { GitPullRequest, Check, X, Loader2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  canCurrentUserReviewAssignment,
  filterAndSortWorkflowRequests,
  formatReviewerLabel,
  isWorkflowAdmin,
  setReviewAssignmentDecision,
  type ReviewAssignmentRecord,
  type WorkflowRequestRecord,
} from "@/lib/workflow-service";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import { Badge } from "@/components/ui/badge";
import { getDefaultRouteForRole } from "@/lib/app-access";
import { canAccessWorkflow } from "@/lib/authorization";

export default function Workflow() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<WorkflowRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMessages, setReviewMessages] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title" | "status">("recent");
  const hasWorkflowAccess = canAccessWorkflow(role);
  const adminInWorkflow = isWorkflowAdmin(role);

  const fetchData = async () => {
    if (!hasWorkflowAccess) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("approval_requests")
      .select("id, status, message, review_message, created_at, updated_at, definition_id, requested_by, reviewed_by, definitions(title, description, status)")
      .order("created_at", { ascending: false });

    const requestRecords = (data || []) as WorkflowRequestRecord[];
    const requestIds = requestRecords.map((request) => request.id);

    if (requestIds.length > 0) {
      const assignmentsRes = await supabase
        .from("approval_request_assignments" as any)
        .select("*")
        .in("approval_request_id", requestIds)
        .order("created_at", { ascending: true });

      const assignments = (assignmentsRes.data || []) as (ReviewAssignmentRecord & { approval_request_id: string })[];
      const reviewerIds = assignments.map((assignment) => assignment.reviewer_user_id).filter(Boolean) as string[];
      const profileRes = reviewerIds.length > 0
        ? await supabase.from("profiles").select("user_id, display_name, email, team").in("user_id", reviewerIds)
        : { data: [] };
      const profileMap = new Map((profileRes.data || []).map((reviewer: any) => [reviewer.user_id, reviewer]));

      const assignmentsByRequest = new Map<string, ReviewAssignmentRecord[]>();
      assignments.forEach((assignment) => {
        const enrichedAssignment: ReviewAssignmentRecord = {
          ...assignment,
          profiles: assignment.reviewer_user_id ? profileMap.get(assignment.reviewer_user_id) || null : null,
        };
        const current = assignmentsByRequest.get(assignment.approval_request_id) || [];
        current.push(enrichedAssignment);
        assignmentsByRequest.set(assignment.approval_request_id, current);
      });

      requestRecords.forEach((request) => {
        request.assignments = assignmentsByRequest.get(request.id) || [];
      });
    }

    setRequests(requestRecords);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [hasWorkflowAccess]);

  const handleReview = async (assignmentId: string, definitionId: string, decision: "accepted" | "rejected") => {
    if (!user) {
      return;
    }

    setProcessing(assignmentId);

    try {
      await setReviewAssignmentDecision(supabase, assignmentId, decision, reviewMessages[assignmentId] || "");
      toast.success(`Review ${decision === "accepted" ? "accepted" : "rejected"}`);
      emitAppDataChanged({ entityType: "definition", action: "updated", entityId: definitionId });
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record review");
    }

    setProcessing(null);
  };

  const visibleRequests = useMemo(() => {
    const filteredRequests = requests.filter((request) => {
      if (adminInWorkflow) {
        return true;
      }

      if (request.requested_by === user?.id) {
        return true;
      }

      return (request.assignments || []).some((assignment) =>
        canCurrentUserReviewAssignment(assignment, user?.id, profile?.team, adminInWorkflow),
      );
    });

    return filterAndSortWorkflowRequests(filteredRequests, {
      query: searchQuery,
      status: statusFilter,
      sortBy,
    });
  }, [requests, searchQuery, statusFilter, sortBy, user?.id, profile?.team, adminInWorkflow]);

  if (!hasWorkflowAccess) {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Workflow</h1>
        <p className="text-muted-foreground mt-1">Track reviewer assignments and approve drafts assigned to you or your team.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
            placeholder="Search workflow items..."
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-40 w-full rounded-lg" />)}</div>
      ) : visibleRequests.length === 0 ? (
        <EmptyState icon={<GitPullRequest className="w-6 h-6" />} title="No requests" description="No review requests match your current filters." />
      ) : (
        <div className="space-y-4">
          {visibleRequests.map((request) => (
            <Card key={request.id} className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="cursor-pointer" onClick={() => navigate(`/definitions/${request.definition_id}`)}>
                    <h3 className="font-medium text-foreground hover:text-primary transition-colors">
                      {request.definitions?.title || "Unknown definition"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{request.definitions?.description}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>

                {request.message && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    "{request.message}"
                  </p>
                )}

                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reviewer Status</p>
                  {(request.assignments || []).map((assignment) => {
                    const canReview = canCurrentUserReviewAssignment(assignment, user?.id, profile?.team, adminInWorkflow);

                    return (
                      <div key={assignment.id} className="rounded-lg border border-border/50 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{formatReviewerLabel(assignment)}</p>
                            <p className="text-xs text-muted-foreground">
                              {assignment.reviewer_team ? "Team reviewer" : assignment.profiles?.email || "User reviewer"}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="capitalize">{assignment.status}</Badge>
                            {assignment.reviewed_at && (
                              <p className="mt-1 text-[10px] text-muted-foreground">{new Date(assignment.reviewed_at).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                        {assignment.review_message && (
                          <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{assignment.review_message}</p>
                        )}
                        {assignment.status === "pending" && canReview && (
                          <div className="space-y-3 pt-2 border-t border-border/50">
                            <Textarea
                              placeholder="Review message (optional)"
                              value={reviewMessages[assignment.id] || ""}
                              onChange={(event) => setReviewMessages((current) => ({ ...current, [assignment.id]: event.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleReview(assignment.id, request.definition_id, "accepted")}
                                disabled={processing === assignment.id}
                                className="bg-success hover:bg-success/90 text-success-foreground"
                              >
                                {processing === assignment.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReview(assignment.id, request.definition_id, "rejected")}
                                disabled={processing === assignment.id}
                              >
                                <X className="mr-2 h-3 w-3" />Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-muted-foreground">
                  Submitted {new Date(request.created_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
