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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { LikeButton } from "@/components/shared/LikeButton";
import { ImportDialog } from "@/components/shared/ImportDialog";
import { ExportDialog } from "@/components/shared/ExportDialog";
import { Plus, Network, Edit2, Save, X, Loader2, Upload, Download, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, type Node, type Edge, addEdge, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getWorkflowNodeStyle, workflowStatusConfig } from "@/lib/workflow-status";
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
import { deleteOntology, updateDefinition, updateOntology } from "@/lib/entity-service";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import { recordEntityView } from "@/lib/history-service";
import {
  createRelationshipRecord,
  CUSTOM_RELATION_TYPE,
  getRelationshipDisplayLabel,
  predefinedRelationshipTypes,
} from "@/lib/relationship-service";

export default function OntologyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [ontology, setOntology] = useState<any>(null);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ title: "", description: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [createDefOpen, setCreateDefOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [graphRelationOpen, setGraphRelationOpen] = useState(false);
  const [graphRenameOpen, setGraphRenameOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingGraphRelation, setCreatingGraphRelation] = useState(false);
  const [renamingGraphDefinition, setRenamingGraphDefinition] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [graphRelationType, setGraphRelationType] = useState<string>(predefinedRelationshipTypes[0]);
  const [graphCustomRelationType, setGraphCustomRelationType] = useState("");
  const [graphRenameDefinitionId, setGraphRenameDefinitionId] = useState<string | null>(null);
  const [graphRenameTitle, setGraphRenameTitle] = useState("");
  const [newDef, setNewDef] = useState({ title: "", description: "", content: "", example: "", priority: "normal" });
  const canEditContent = hasRole("admin") || hasRole("editor");
  const viewedOntologyIdRef = useRef<string | null>(null);

  const fetchAll = async () => {
    if (!id) return;
    const [ontoRes, defsRes, favRes] = await Promise.all([
      supabase.from("ontologies").select("*").eq("id", id).single(),
      supabase.from("definitions").select("*, relationships!relationships_source_id_fkey(*, target:target_id(id, title))").eq("ontology_id", id).eq("is_deleted", false),
      user ? supabase.from("favorites").select("id").eq("user_id", user.id).eq("ontology_id", id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    if (ontoRes.data) {
      setOntology(ontoRes.data);
      setEditData({ title: ontoRes.data.title, description: ontoRes.data.description || "", tags: (ontoRes.data.tags || []).join(", ") });
      await supabase.from("ontologies").update({ view_count: (ontoRes.data.view_count || 0) + 1 }).eq("id", id);
    }
    setIsFavorited(!!favRes.data);

    const defs = defsRes.data || [];
    setDefinitions(defs);

    const graphEdges: Edge[] = [];
    defs.forEach((d: any) => {
      (d.relationships || []).forEach((r: any) => {
        graphEdges.push({
          id: r.id, source: r.source_id, target: r.target_id,
          label: getRelationshipDisplayLabel(r.type, r.label),
          style: { stroke: "hsl(var(--primary))" },
          labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
        });
      });
    });

    const graphNodes: Node[] = defs.map((d: any, i: number) => ({
      id: d.id,
      position: { x: 150 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 150 },
      data: { label: d.title },
      style: {
        ...getWorkflowNodeStyle(d.status || "draft"),
        borderRadius: "8px", padding: "12px 16px", fontSize: "13px",
        fontWeight: 500,
      },
    }));
    setNodes(graphNodes);
    setEdges(graphEdges);
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
        detail.entityType === "definition" ||
        detail.entityType === "relationship" ||
        detail.entityType === "favorite"
      ) {
        fetchAll();
      }
    });
  }, [id, user]);

  useEffect(() => {
    if (!ontology?.id || !ontology.title || !user?.id || viewedOntologyIdRef.current === ontology.id) {
      return;
    }

    viewedOntologyIdRef.current = ontology.id;
    recordEntityView(supabase, {
      userId: user.id,
      entityType: "ontology",
      entityId: ontology.id,
      entityTitle: ontology.title,
    }).catch(() => undefined);
  }, [ontology?.id, ontology?.title, user?.id]);

  const handleSaveOntology = async () => {
    if (!canEditContent) { toast.error("Your current role is read-only."); return; }
    if (!ontology || !editData.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    const tags = editData.tags.split(",").map(t => t.trim()).filter(Boolean);
    try {
      await updateOntology(supabase, {
        ontologyId: ontology.id,
        userId: user?.id,
        previous: {
          title: ontology.title,
          description: ontology.description,
          tags: ontology.tags || [],
        },
        changes: {
          title: editData.title.trim(),
          description: editData.description.trim(),
          tags,
        },
      });
      toast.success("Ontology updated");
      setEditing(false);
      emitAppDataChanged({ entityType: "ontology", action: "updated", entityId: ontology.id });
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update ontology");
    }
    setSaving(false);
  };

  const handleCreateDef = async () => {
    if (!canEditContent) { toast.error("Your current role is read-only."); return; }
    if (!newDef.title.trim()) { toast.error("Title required"); return; }
    setCreating(true);
    const { data, error } = await supabase.from("definitions").insert({
      title: newDef.title.trim(), description: newDef.description.trim(),
      content: newDef.content.trim(), example: newDef.example.trim(),
      ontology_id: id, priority: newDef.priority as any,
      created_by: user?.id, status: "draft" as any,
    }).select().single();
    if (error) toast.error(error.message);
    else {
      await supabase.from("activity_events").insert({
        user_id: user?.id, action: "created", entity_type: "definition",
        entity_id: data.id, entity_title: data.title,
      });
      toast.success("Definition created");
      setCreateDefOpen(false);
      setNewDef({ title: "", description: "", content: "", example: "", priority: "normal" });
      emitAppDataChanged({ entityType: "definition", action: "created", entityId: data.id });
      fetchAll();
    }
    setCreating(false);
  };

  const handleDeleteOntology = async () => {
    if (!ontology) {
      return;
    }

    setDeleting(true);

    try {
      await deleteOntology(supabase, ontology.id);
      emitAppDataChanged({ entityType: "ontology", action: "deleted", entityId: ontology.id });
      toast.success("Ontology deleted");
      navigate("/ontologies");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete ontology");
    }

    setDeleting(false);
    setDeleteOpen(false);
  };

  const handleGraphConnect = (connection: Connection) => {
    if (!canEditContent || !connection.source || !connection.target) {
      return;
    }

    setPendingConnection(connection);
    setGraphRelationType(predefinedRelationshipTypes[0]);
    setGraphCustomRelationType("");
    setGraphRelationOpen(true);
  };

  const handleCreateGraphRelationship = async () => {
    if (!pendingConnection?.source || !pendingConnection.target || !user) {
      return;
    }

    setCreatingGraphRelation(true);
    try {
      const data = await createRelationshipRecord(supabase, {
        sourceId: pendingConnection.source,
        targetId: pendingConnection.target,
        selectedType: graphRelationType as any,
        customType: graphCustomRelationType,
        createdBy: user.id,
      });
      setEdges((current) =>
        addEdge(
          {
            id: data.id,
            source: pendingConnection.source!,
            target: pendingConnection.target!,
            label: getRelationshipDisplayLabel(data.type, data.label),
            style: { stroke: "hsl(var(--primary))" },
            labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
          },
          current,
        ),
      );
      toast.success("Relationship created");
      emitAppDataChanged({ entityType: "relationship", action: "created", entityId: data.id });
      fetchAll();
      setGraphRelationOpen(false);
      setPendingConnection(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create relationship");
    }

    setCreatingGraphRelation(false);
  };

  const openGraphRenameDialog = (definitionId: string) => {
    const selectedDefinition = definitions.find((definition) => definition.id === definitionId);

    if (!selectedDefinition || !canEditContent) {
      return;
    }

    setGraphRenameDefinitionId(definitionId);
    setGraphRenameTitle(selectedDefinition.title);
    setGraphRenameOpen(true);
  };

  const handleRenameGraphDefinition = async () => {
    const selectedDefinition = definitions.find((definition) => definition.id === graphRenameDefinitionId);

    if (!selectedDefinition || !graphRenameTitle.trim()) {
      toast.error("Definition name is required");
      return;
    }

    setRenamingGraphDefinition(true);

    try {
      await updateDefinition(supabase, {
        definitionId: selectedDefinition.id,
        userId: user?.id,
        source: "graph",
        previous: {
          title: selectedDefinition.title,
          description: selectedDefinition.description,
          content: selectedDefinition.content,
          example: selectedDefinition.example,
          metadata: selectedDefinition.metadata,
          version: selectedDefinition.version,
        },
        changes: {
          title: graphRenameTitle.trim(),
          description: selectedDefinition.description,
          content: selectedDefinition.content,
          example: selectedDefinition.example,
        },
      });
      toast.success("Definition renamed");
      setGraphRenameOpen(false);
      emitAppDataChanged({ entityType: "definition", action: "updated", entityId: selectedDefinition.id });
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to rename definition");
    }

    setRenamingGraphDefinition(false);
  };

  if (loading) return (
    <div className="max-w-6xl mx-auto space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>
  );

  if (!ontology) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Ontology not found</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/ontologies")}>Back</Button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={editing ? "" : ontology.title}
        backTo="/ontologies"
        badges={
          !editing && (
            <>
              <StatusBadge status={ontology.status} />
              {(ontology.tags || []).map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
            </>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <LikeButton entityId={ontology.id} entityType="ontology" isLiked={isFavorited} />
            {canEditContent && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-3 w-3 mr-1.5" />Import</Button>}
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><Download className="h-3 w-3 mr-1.5" />Export</Button>
            {canEditContent && (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3 mr-1.5" />Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete ontology?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the ontology, its definitions, relationships, likes, and linked notifications.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDeleteOntology}
                      disabled={deleting}
                    >
                      {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete ontology
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                <Button size="icon" onClick={handleSaveOntology} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            ) : canEditContent ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="h-3 w-3 mr-1.5" />Edit</Button>
            ) : null}
          </div>
        }
      />

      {editing && (
        <Card className="border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-2"><Label>Tags (comma-separated)</Label><Input value={editData.tags} onChange={e => setEditData(p => ({ ...p, tags: e.target.value }))} /></div>
          </CardContent>
        </Card>
      )}

      {!editing && ontology.description && (
        <p className="text-sm text-muted-foreground">{ontology.description}</p>
      )}

      <Tabs defaultValue="definitions">
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="definitions">Definitions ({definitions.length})</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          {canEditContent && (
            <Dialog open={createDefOpen} onOpenChange={setCreateDefOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3 w-3 mr-1.5" />Add Definition</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Create Definition</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-2"><Label>Title *</Label><Input placeholder="Definition title" value={newDef.title} onChange={e => setNewDef(p => ({ ...p, title: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Brief description" value={newDef.description} onChange={e => setNewDef(p => ({ ...p, description: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Context</Label><Textarea placeholder="Detailed context (markdown)" rows={4} value={newDef.content} onChange={e => setNewDef(p => ({ ...p, content: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Example</Label><Textarea placeholder="Usage example" rows={3} value={newDef.example} onChange={e => setNewDef(p => ({ ...p, example: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={newDef.priority} onValueChange={v => setNewDef(p => ({ ...p, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateDef} className="w-full" disabled={creating}>
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Definition
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <TabsContent value="definitions" className="mt-0 space-y-2">
              {definitions.map(d => (
                <Card key={d.id} className="border-border/50 hover:border-border transition-colors cursor-pointer" onClick={() => navigate(`/definitions/${d.id}`)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground">{d.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{d.description || "No description"}</p>
                      {(d.relationships || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.relationships.slice(0, 2).map((relationship: any) => (
                            <Badge key={relationship.id} variant="outline" className="text-[10px]">
                              {relationship.target?.title || "Unknown definition"}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={d.status} />
                  </CardContent>
                </Card>
              ))}
              {definitions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No definitions yet. Create one to get started.
                </div>
              )}
        </TabsContent>

        <TabsContent value="graph" className="mt-0">
          <Card className="border-border/50 sticky top-20">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(workflowStatusConfig).map(([status, meta]) => (
                  <Badge key={status} variant="outline" className={meta.badgeClass}>
                    {meta.label}
                  </Badge>
                ))}
              </div>
              {canEditContent && (
                <p className="text-xs text-muted-foreground">
                  Double-click a node to rename the real definition, or drag a connection between nodes to create a relationship.
                </p>
              )}
              <div style={{ height: 450 }}>
                {nodes.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    <div className="text-center"><Network className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>No definitions to graph</p></div>
                  </div>
                ) : (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleGraphConnect}
                    onNodeDoubleClick={(_, node) => openGraphRenameDialog(node.id)}
                    fitView
                    style={{ background: "hsl(var(--background))" }}
                  >
                    <Background color="hsl(var(--border))" gap={20} />
                    <Controls />
                    <MiniMap style={{ background: "hsl(var(--card))" }} />
                  </ReactFlow>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-0">
          <Card className="border-border/50">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</h3>
                <p className="text-sm text-foreground">{ontology.description || "No description"}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-4 border-t border-border/50">
                <span>Created {new Date(ontology.created_at).toLocaleDateString()}</span>
                <span>Updated {new Date(ontology.updated_at).toLocaleDateString()}</span>
                <span>{ontology.view_count} views</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        ontologyId={ontology.id}
        ontologyTitle={ontology.title}
        onImport={(result) => {
          emitAppDataChanged({ entityType: "definition", action: "imported", entityId: ontology.id });
          toast.success(`Imported ${result.imported} definitions into ${ontology.title}`);
          fetchAll();
          setImportOpen(false);
        }}
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} ontologyId={ontology.id} ontologyTitle={ontology.title} entityName="definitions" />

      <Dialog open={graphRelationOpen} onOpenChange={setGraphRelationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Relationship</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">
                <span>{(definitions.find((definition) => definition.id === pendingConnection?.source)?.title || "Source definition")}</span>
                {pendingConnection?.source && canEditContent && (
                  <Button type="button" variant="ghost" size="sm" className="ml-2 h-6 px-2" onClick={() => openGraphRenameDialog(pendingConnection.source!)}>
                    <Edit2 className="h-3 w-3 mr-1" />Rename
                  </Button>
                )}
              </p>
              <p className="text-muted-foreground">
                <span>connects to {(definitions.find((definition) => definition.id === pendingConnection?.target)?.title || "Target definition")}</span>
                {pendingConnection?.target && canEditContent && (
                  <Button type="button" variant="ghost" size="sm" className="ml-2 h-6 px-2" onClick={() => openGraphRenameDialog(pendingConnection.target!)}>
                    <Edit2 className="h-3 w-3 mr-1" />Rename
                  </Button>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Relationship type</Label>
              <Select value={graphRelationType} onValueChange={setGraphRelationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {predefinedRelationshipTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type.replace(/_/g, " ")}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_RELATION_TYPE}>Custom type</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {graphRelationType === CUSTOM_RELATION_TYPE && (
              <div className="space-y-2">
                <Label>Custom relation type</Label>
                <Input value={graphCustomRelationType} onChange={(event) => setGraphCustomRelationType(event.target.value)} />
              </div>
            )}
            <Button onClick={handleCreateGraphRelationship} disabled={creatingGraphRelation} className="w-full">
              {creatingGraphRelation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create relationship
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={graphRenameOpen} onOpenChange={setGraphRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rename Definition</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Definition name</Label>
              <Input value={graphRenameTitle} onChange={(event) => setGraphRenameTitle(event.target.value)} />
            </div>
            <Button onClick={handleRenameGraphDefinition} disabled={renamingGraphDefinition} className="w-full">
              {renamingGraphDefinition && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save definition name
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
