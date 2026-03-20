import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { LikeButton } from "@/components/shared/LikeButton";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Edit2, Save, X, Loader2, Send, Eye, Network, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Comment } from "@/components/shared/CommentThread";
import type { TimelineEvent } from "@/components/shared/ActivityTimeline";
import { CommentThread } from "@/components/shared/CommentThread";
import { DefinitionRelationsSection } from "@/components/definition/DefinitionRelationsSection";
import { DefinitionHistorySection } from "@/components/definition/DefinitionHistorySection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteDefinition, updateDefinition } from "@/lib/entity-service";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import { fetchEntityTimelineEvents, recordEntityView } from "@/lib/history-service";
import {
  fetchReviewerOptions,
  formatReviewerLabel,
  type ReviewAssignmentRecord,
  type ReviewerOption,
  upsertDefinitionReviewRequest,
} from "@/lib/workflow-service";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  canAccessWorkflow,
  canDeleteDefinition,
  canEditDefinition,
  canManageRelationships,
} from "@/lib/authorization";

export default function DefinitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [definition, setDefinition] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ title: "", description: "", content: "", example: "" });
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [historyEvents, setHistoryEvents] = useState<TimelineEvent[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [approvalMsg, setApprovalMsg] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const [reviewAssignments, setReviewAssignments] = useState<ReviewAssignmentRecord[]>([]);
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [selectedReviewerTeams, setSelectedReviewerTeams] = useState<string[]>([]);
  const [pendingReviewerUserId, setPendingReviewerUserId] = useState<string>("none");
  const [pendingReviewerTeam, setPendingReviewerTeam] = useState<string>("none");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [relationshipsLoading, setRelationshipsLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);
  const canEditContent = canEditDefinition(role);
  const canDeleteCurrentDefinition = canDeleteDefinition(role);
  const canManageDefinitionRelationships = canManageRelationships(role);
  const canAccessDefinitionWorkflow = canAccessWorkflow(role);
  const viewedDefinitionIdRef = useRef<string | null>(null);

  const fetchAll = async () => {
    if (!id) return;
    setLoading(true);
    setHistoryLoading(true);
    setRelationshipsLoading(true);
    setHistoryError(null);
    setRelationshipsError(null);

    const [defRes, comRes, relRes, favRes, reviewRes, historyRes] = await Promise.all([
      supabase.from("definitions").select("*, ontologies(id, title)").eq("id", id).single(),
      supabase.from("comments").select("*").eq("definition_id", id).order("created_at", { ascending: true }),
      supabase.from("relationships").select("id, source_id, target_id, type, label, source:source_id(id, title), target:target_id(id, title)").or(`source_id.eq.${id},target_id.eq.${id}`),
      user ? supabase.from("favorites").select("id").eq("user_id", user.id).eq("definition_id", id).maybeSingle() : Promise.resolve({ data: null }),
      canAccessDefinitionWorkflow
        ? supabase
            .from("approval_requests")
            .select("id, status, message, review_message, requested_by, created_at, updated_at, definition_id")
            .eq("definition_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      fetchEntityTimelineEvents(supabase, "definition", id)
        .then((events) => ({ data: events, error: null }))
        .catch((error) => ({
          data: [] as TimelineEvent[],
          error: error instanceof Error ? error : new Error("Unable to load history."),
        })),
    ]);

    if (defRes.data) {
      setDefinition(defRes.data);
      setEditData({
        title: defRes.data.title,
        description: defRes.data.description || "",
        content: defRes.data.content || "",
        example: (defRes.data as any).example || "",
      });
      await supabase.from("definitions").update({ view_count: (defRes.data.view_count || 0) + 1 }).eq("id", id);
    }
    setComments(comRes.data || []);
    setRelationships(relRes.data || []);
    setHistoryEvents(historyRes.data || []);
    setIsFavorited(!!favRes.data);
    setReviewRequest(reviewRes.data || null);
    setHistoryError(historyRes.error?.message || null);
    setRelationshipsError(relRes.error?.message || null);
    setHistoryLoading(false);
    setRelationshipsLoading(false);

    if (canAccessDefinitionWorkflow && reviewRes.data?.id) {
      const assignmentsRes = await supabase
        .from("approval_request_assignments" as any)
        .select("*")
        .eq("approval_request_id", reviewRes.data.id)
        .order("created_at", { ascending: true });

      const assignments = (assignmentsRes.data || []) as ReviewAssignmentRecord[];
      const reviewerIds = assignments.map((assignment) => assignment.reviewer_user_id).filter(Boolean) as string[];

      if (reviewerIds.length > 0) {
        const profileRes = await supabase.from("profiles").select("user_id, display_name, email, team").in("user_id", reviewerIds);
        const profileMap = new Map((profileRes.data || []).map((profile: any) => [profile.user_id, profile]));
        assignments.forEach((assignment) => {
          if (assignment.reviewer_user_id) {
            assignment.profiles = profileMap.get(assignment.reviewer_user_id) || null;
          }
        });
      }

      setReviewAssignments(assignments);
      setSelectedReviewerIds(assignments.map((assignment) => assignment.reviewer_user_id).filter(Boolean) as string[]);
      setSelectedReviewerTeams(assignments.map((assignment) => assignment.reviewer_team).filter(Boolean) as string[]);
    } else {
      setReviewAssignments([]);
      setSelectedReviewerIds([]);
      setSelectedReviewerTeams([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();

    return subscribeToAppDataChanges((detail) => {
      if (!id) {
        return;
      }

      if (
        detail.entityId === id ||
        detail.entityType === "relationship" ||
        detail.entityType === "favorite"
      ) {
        fetchAll();
      }
    });
  }, [id, user, canAccessDefinitionWorkflow]);

  useEffect(() => {
    if (!canEditContent) {
      return;
    }

    fetchReviewerOptions(supabase)
      .then((options) => {
        setReviewerOptions(options.users);
        setTeamOptions(options.teams);
      })
      .catch(() => undefined);
  }, [canEditContent]);

  useEffect(() => {
    if (!definition?.id || !definition.title || !user?.id || viewedDefinitionIdRef.current === definition.id) {
      return;
    }

    viewedDefinitionIdRef.current = definition.id;
    recordEntityView(supabase, {
      userId: user.id,
      entityType: "definition",
      entityId: definition.id,
      entityTitle: definition.title,
    }).catch(() => undefined);
  }, [definition?.id, definition?.title, user?.id]);

  const handleSave = async () => {
    if (!canEditContent) { toast.error("Your current role is read-only."); return; }
    if (!definition || !editData.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      await updateDefinition(supabase, {
        definitionId: definition.id,
        userId: user?.id,
        previous: {
          title: definition.title,
          description: definition.description,
          content: definition.content,
          example: definition.example,
          metadata: definition.metadata,
          version: definition.version,
        },
        changes: {
          title: editData.title.trim(),
          description: editData.description.trim(),
          content: editData.content.trim(),
          example: editData.example.trim(),
        },
      });
      toast.success("Definition updated");
      setEditing(false);
      emitAppDataChanged({ entityType: "definition", action: "updated", entityId: definition.id });
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update definition");
    }
    setSaving(false);
  };

  const handleRequestApproval = async () => {
    if (!canEditContent) { toast.error("Your current role is read-only."); return; }
    if (!user || !id) return;
    if (selectedReviewerIds.length === 0 && selectedReviewerTeams.length === 0) {
      toast.error("Assign at least one reviewer user or team.");
      return;
    }
    setRequesting(true);
    try {
      await upsertDefinitionReviewRequest(supabase, id, {
        message: approvalMsg,
        reviewerUserIds: selectedReviewerIds,
        reviewerTeams: selectedReviewerTeams,
      });
      toast.success("Approval requested");
      setApprovalMsg("");
      emitAppDataChanged({ entityType: "definition", action: "updated", entityId: id });
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request approval");
    }
    setRequesting(false);
  };

  const addReviewerUser = () => {
    if (pendingReviewerUserId === "none") {
      return;
    }

    setSelectedReviewerIds((current) => Array.from(new Set([...current, pendingReviewerUserId])));
    setPendingReviewerUserId("none");
  };

  const addReviewerTeam = () => {
    if (pendingReviewerTeam === "none") {
      return;
    }

    setSelectedReviewerTeams((current) => Array.from(new Set([...current, pendingReviewerTeam])));
    setPendingReviewerTeam("none");
  };

  const handleDeleteDefinition = async () => {
    if (!definition) {
      return;
    }

    if (!canDeleteCurrentDefinition) {
      toast.error("Your current role is read-only.");
      return;
    }

    setDeleting(true);

    try {
      await deleteDefinition(supabase, definition.id);
      emitAppDataChanged({ entityType: "definition", action: "deleted", entityId: definition.id });
      toast.success("Definition deleted");
      navigate(definition.ontology_id ? `/ontologies/${definition.ontology_id}` : "/definitions");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete definition");
    }

    setDeleting(false);
    setDeleteOpen(false);
  };

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!definition) return (
    <div className="max-w-4xl mx-auto text-center py-16">
      <p className="text-muted-foreground">Definition not found</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={editing ? "" : definition.title}
        backTo={definition.ontology_id ? `/ontologies/${definition.ontology_id}` : "/ontologies"}
        badges={
          !editing && (
            <>
              <StatusBadge status={definition.status} />
              <PriorityBadge priority={definition.priority} />
              <span className="text-xs text-muted-foreground">v{definition.version}</span>
              {definition.ontologies && (
                <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => navigate(`/ontologies/${definition.ontology_id}`)}>
                  <Network className="h-3 w-3 mr-1" />{definition.ontologies.title}
                </Badge>
              )}
            </>
          )
        }
        actions={
          <>
            <LikeButton entityId={definition.id} entityType="definition" isLiked={isFavorited} />
            {editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                <Button size="icon" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            ) : (canEditContent || canDeleteCurrentDefinition) ? (
              <div className="flex items-center gap-2">
                {canDeleteCurrentDefinition && (
                  <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-2 h-3 w-3" />Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete definition?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the definition, its relationships, comments, favorites, and linked notifications.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDeleteDefinition}
                          disabled={deleting}
                        >
                          {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Delete definition
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {canEditContent && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Edit2 className="mr-2 h-3 w-3" />Edit
                  </Button>
                )}
              </div>
            ) : null}
          </>
        }
      />

      {editing && (
        <Input
          value={editData.title}
          onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
          className="text-xl font-bold"
          placeholder="Definition title"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              {canAccessDefinitionWorkflow && <TabsTrigger value="workflow">Workflow</TabsTrigger>}
            </TabsList>

            <TabsContent value="content" className="mt-4">
              <Card className="border-border/50">
                <CardContent className="p-6">
                  {editing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>Context</Label>
                        <Textarea value={editData.content} onChange={e => setEditData(p => ({ ...p, content: e.target.value }))} rows={6} className="font-mono text-sm" placeholder="Supports markdown..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Example</Label>
                        <Textarea value={editData.example} onChange={e => setEditData(p => ({ ...p, example: e.target.value }))} rows={4} placeholder="Usage example..." />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</h3>
                        <p className="text-sm text-foreground">{definition.description || "No description"}</p>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Context</h3>
                        {definition.content ? (
                          <MarkdownRenderer content={definition.content} />
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No context provided</p>
                        )}
                      </div>
                      {(definition as any).example && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Example</h3>
                          <div className="bg-muted/50 border border-border/50 rounded-lg p-4">
                            <MarkdownRenderer content={(definition as any).example} />
                          </div>
                        </div>
                      )}
                      {definition.tags?.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</h3>
                          <div className="flex flex-wrap gap-1">
                            {definition.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-4 border-t border-border/50">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{definition.view_count} views</span>
                        <span>Created {new Date(definition.created_at).toLocaleDateString()}</span>
                        <span>Updated {new Date(definition.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {canAccessDefinitionWorkflow && (
              <TabsContent value="workflow" className="mt-4">
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Request Approval</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Current status: <StatusBadge status={definition.status} />
                    </p>
                    {reviewAssignments.length > 0 && (
                      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned Reviewers</p>
                        {reviewAssignments.map((assignment) => (
                          <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{formatReviewerLabel(assignment)}</p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.reviewer_team ? "Team review" : assignment.profiles?.email || "User review"}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="capitalize">{assignment.status}</Badge>
                              {assignment.reviewed_at && (
                                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(assignment.reviewed_at).toLocaleString()}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {definition.status === "draft" || definition.status === "rejected" ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Assign Reviewer User</Label>
                            <div className="flex gap-2">
                              <Select value={pendingReviewerUserId} onValueChange={setPendingReviewerUserId}>
                                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Select reviewer</SelectItem>
                                  {reviewerOptions
                                    .filter((option) => option.userId !== user?.id)
                                    .map((option) => (
                                      <SelectItem key={option.userId} value={option.userId}>
                                        {option.displayName}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="outline" onClick={addReviewerUser}>
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </div>
                            {selectedReviewerIds.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {selectedReviewerIds.map((reviewerId) => {
                                  const reviewer = reviewerOptions.find((option) => option.userId === reviewerId);
                                  return (
                                    <Badge key={reviewerId} variant="secondary" className="gap-1">
                                      {reviewer?.displayName || reviewerId}
                                      <button type="button" onClick={() => setSelectedReviewerIds((current) => current.filter((value) => value !== reviewerId))}>x</button>
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Assign Reviewer Team</Label>
                            <div className="flex gap-2">
                              <Select value={pendingReviewerTeam} onValueChange={setPendingReviewerTeam}>
                                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Select team</SelectItem>
                                  {teamOptions.map((team) => (
                                    <SelectItem key={team} value={team}>{team}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="outline" onClick={addReviewerTeam}>
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </div>
                            {selectedReviewerTeams.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {selectedReviewerTeams.map((team) => (
                                  <Badge key={team} variant="secondary" className="gap-1">
                                    {team}
                                    <button type="button" onClick={() => setSelectedReviewerTeams((current) => current.filter((value) => value !== team))}>x</button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <Textarea placeholder="Message for reviewers (optional)" value={approvalMsg} onChange={e => setApprovalMsg(e.target.value)} />
                        <Button onClick={handleRequestApproval} disabled={requesting}>
                          {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Request Approval
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">This definition is currently {definition.status.replace("_", " ")}.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>

          <DefinitionRelationsSection
            entityId={definition.id}
            relationships={relationships}
            loading={relationshipsLoading}
            error={relationshipsError}
            onRefresh={fetchAll}
            allowCreate={canManageDefinitionRelationships}
          />

          <DefinitionHistorySection
            events={historyEvents}
            loading={historyLoading}
            error={historyError}
          />
        </div>

        <div className="lg:col-span-2">
          <Card className="border-border/50 sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Comments</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CommentThread
                comments={comments}
                entityId={definition.id}
                entityType="definition"
                onRefresh={fetchAll}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
