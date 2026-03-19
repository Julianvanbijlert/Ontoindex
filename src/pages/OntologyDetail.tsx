import { useEffect, useState } from "react";
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
import { EntityActivityPanel } from "@/components/shared/EntityActivityPanel";
import { LikeButton } from "@/components/shared/LikeButton";
import { ImportDialog } from "@/components/shared/ImportDialog";
import { ExportDialog } from "@/components/shared/ExportDialog";
import { Plus, Network, Edit2, Save, X, Loader2, Upload, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Comment } from "@/components/shared/CommentThread";
import type { TimelineEvent } from "@/components/shared/ActivityTimeline";

export default function OntologyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ontology, setOntology] = useState<any>(null);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
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
  const [creating, setCreating] = useState(false);
  const [newDef, setNewDef] = useState({ title: "", description: "", content: "", example: "", priority: "normal" });

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

    // Collect all relationships for activity panel
    const allRels: any[] = [];
    const graphEdges: Edge[] = [];
    defs.forEach((d: any) => {
      (d.relationships || []).forEach((r: any) => {
        allRels.push(r);
        graphEdges.push({
          id: r.id, source: r.source_id, target: r.target_id,
          label: r.type.replace("_", " "),
          style: { stroke: "hsl(var(--primary))" },
          labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
        });
      });
    });
    setRelationships(allRels);

    const graphNodes: Node[] = defs.map((d: any, i: number) => ({
      id: d.id,
      position: { x: 150 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 150 },
      data: { label: d.title },
      style: {
        background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
        borderRadius: "8px", padding: "12px 16px", fontSize: "13px",
        fontWeight: 500, color: "hsl(var(--foreground))",
      },
    }));
    setNodes(graphNodes);
    setEdges(graphEdges);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleSaveOntology = async () => {
    if (!ontology || !editData.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    const tags = editData.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("ontologies").update({
      title: editData.title.trim(), description: editData.description.trim(), tags,
    }).eq("id", ontology.id);
    if (error) toast.error(error.message);
    else { toast.success("Ontology updated"); setEditing(false); fetchAll(); }
    setSaving(false);
  };

  const handleCreateDef = async () => {
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
      fetchAll();
    }
    setCreating(false);
  };

  // Timeline from ontology creation
  const timelineEvents: TimelineEvent[] = [];
  if (ontology) {
    timelineEvents.push({ id: "creation", action: "created", timestamp: ontology.created_at, metadata: { summary: `Ontology "${ontology.title}" created` } });
  }

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
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-3 w-3 mr-1.5" />Import</Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><Download className="h-3 w-3 mr-1.5" />Export</Button>
            {editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                <Button size="icon" onClick={handleSaveOntology} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="h-3 w-3 mr-1.5" />Edit</Button>
            )}
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Tabs defaultValue="definitions">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="definitions">Definitions ({definitions.length})</TabsTrigger>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
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
            </div>

            <TabsContent value="definitions" className="mt-0 space-y-2">
              {definitions.map(d => (
                <Card key={d.id} className="border-border/50 hover:border-border transition-colors cursor-pointer" onClick={() => navigate(`/definitions/${d.id}`)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground">{d.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{d.description || "No description"}</p>
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
              <Card className="border-border/50">
                <CardContent className="p-0">
                  <div style={{ height: 450 }}>
                    {nodes.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        <div className="text-center"><Network className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>No definitions to graph</p></div>
                      </div>
                    ) : (
                      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView style={{ background: "hsl(var(--background))" }}>
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
        </div>

        <div className="lg:col-span-2">
          <Card className="border-border/50 sticky top-20">
            <CardContent className="p-4">
              <EntityActivityPanel
                entityId={ontology.id}
                entityType="ontology"
                comments={comments}
                timelineEvents={timelineEvents}
                relationships={relationships}
                onRefresh={fetchAll}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} data={definitions} entityName="definitions" />
    </div>
  );
}
