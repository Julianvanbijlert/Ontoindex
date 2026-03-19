import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { GitPullRequest, Check, X, Loader2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterAndSortWorkflowRequests } from "@/lib/workflow-service";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";

export default function Workflow() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMessages, setReviewMessages] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title" | "status">("recent");

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("approval_requests")
      .select("*, definitions(title, description, status), requester:requested_by(id), reviewer:reviewed_by(id)")
      .order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleReview = async (requestId: string, definitionId: string, approve: boolean) => {
    if (!user) return;
    setProcessing(requestId);
    const newStatus = approve ? "approved" : "rejected";
    const { error: reqError } = await supabase.from("approval_requests").update({
      status: newStatus as any,
      reviewed_by: user.id,
      review_message: reviewMessages[requestId] || "",
    }).eq("id", requestId);

    if (!reqError) {
      await supabase.from("definitions").update({ status: newStatus as any }).eq("id", definitionId);
      await supabase.from("activity_events").insert({
        user_id: user.id, action: newStatus, entity_type: "definition", entity_id: definitionId,
        entity_title: requests.find(r => r.id === requestId)?.definitions?.title || "",
      });
      toast.success(`Definition ${approve ? "approved" : "rejected"}`);
      emitAppDataChanged({ entityType: "definition", action: "updated", entityId: definitionId });
      fetchData();
    } else toast.error(reqError.message);
    setProcessing(null);
  };

  const canReview = hasRole("admin") || hasRole("reviewer");
  const visibleRequests = filterAndSortWorkflowRequests(requests, {
    query: searchQuery,
    status: statusFilter,
    sortBy,
  });

  useEffect(() => {
    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Workflow</h1>
        <p className="text-muted-foreground mt-1">Review and manage approval requests</p>
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
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}</div>
      ) : visibleRequests.length === 0 ? (
        <EmptyState icon={<GitPullRequest className="w-6 h-6" />} title="No requests" description="No approval requests at the moment" />
      ) : (
        <div className="space-y-4">
          {visibleRequests.map(r => (
            <Card key={r.id} className="border-border/50">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="cursor-pointer" onClick={() => navigate(`/definitions/${r.definition_id}`)}>
                    <h3 className="font-medium text-foreground hover:text-primary transition-colors">
                      {r.definitions?.title || "Unknown definition"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{r.definitions?.description}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.message && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg mb-3">
                    "{r.message}"
                  </p>
                )}
                {r.review_message && (
                  <p className="text-sm text-foreground bg-muted/50 p-3 rounded-lg mb-3">
                    Review: "{r.review_message}"
                  </p>
                )}
                <div className="text-xs text-muted-foreground mb-3">
                  Submitted {new Date(r.created_at).toLocaleString()}
                </div>
                {canReview && r.status === "in_review" && (
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <Textarea
                      placeholder="Review message (optional)"
                      value={reviewMessages[r.id] || ""}
                      onChange={e => setReviewMessages(p => ({...p, [r.id]: e.target.value}))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleReview(r.id, r.definition_id, true)}
                        disabled={processing === r.id}
                        className="bg-success hover:bg-success/90 text-success-foreground"
                      >
                        {processing === r.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReview(r.id, r.definition_id, false)}
                        disabled={processing === r.id}
                      >
                        <X className="mr-2 h-3 w-3" />Reject
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
