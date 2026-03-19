import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LikeButton } from "@/components/shared/LikeButton";
import { PageHeader } from "@/components/shared/PageHeader";
import { Network, Plus, Search, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Ontologies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ontologies, setOntologies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOnto, setNewOnto] = useState({ title: "", description: "", tags: "" });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from("ontologies").select("*").order("updated_at", { ascending: false });
    if (searchQuery.trim()) query = query.ilike("title", `%${searchQuery}%`);
    const [ontoRes, favsRes] = await Promise.all([
      query,
      user ? supabase.from("favorites").select("ontology_id").eq("user_id", user.id).not("ontology_id", "is", null) : Promise.resolve({ data: [] }),
    ]);
    setOntologies(ontoRes.data || []);
    setFavorites(new Set((favsRes.data || []).map((f: any) => f.ontology_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [searchQuery]);

  const handleCreate = async () => {
    if (!newOnto.title.trim()) { toast.error("Title required"); return; }
    setCreating(true);
    const tags = newOnto.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { data, error } = await supabase.from("ontologies").insert({
      title: newOnto.title.trim(), description: newOnto.description.trim(),
      tags, created_by: user?.id, status: "draft" as any,
    }).select().single();
    if (error) toast.error(error.message);
    else {
      await supabase.from("activity_events").insert({
        user_id: user?.id, action: "created", entity_type: "ontology", entity_id: data.id, entity_title: data.title,
      });
      toast.success("Ontology created");
      setDialogOpen(false);
      setNewOnto({ title: "", description: "", tags: "" });
      fetchData();
    }
    setCreating(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Ontologies"
        description="Browse and manage ontology structures"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Ontology</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Ontology</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2"><Label>Title *</Label><Input placeholder="Ontology title" value={newOnto.title} onChange={e => setNewOnto(p => ({ ...p, title: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Describe this ontology" value={newOnto.description} onChange={e => setNewOnto(p => ({ ...p, description: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Tags (comma-separated)</Label><Input placeholder="e.g. biology, taxonomy" value={newOnto.tags} onChange={e => setNewOnto(p => ({ ...p, tags: e.target.value }))} /></div>
                <Button onClick={handleCreate} className="w-full" disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search ontologies..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      ) : ontologies.length === 0 ? (
        <EmptyState icon={<Network className="w-6 h-6" />} title="No ontologies" description="Create your first ontology to start building knowledge graphs" action={{ label: "Create Ontology", onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ontologies.map(o => (
            <Card key={o.id} className="border-border/50 hover:border-border transition-colors cursor-pointer group" onClick={() => navigate(`/ontologies/${o.id}`)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Network className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex items-center gap-2">
                    <LikeButton
                      entityId={o.id}
                      entityType="ontology"
                      isLiked={favorites.has(o.id)}
                      size="sm"
                      onToggle={(liked) => {
                        setFavorites((previous) => {
                          const next = new Set(previous);
                          if (liked) {
                            next.add(o.id);
                          } else {
                            next.delete(o.id);
                          }
                          return next;
                        });
                      }}
                    />
                    <StatusBadge status={o.status} />
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-1 truncate">{o.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{o.description || "No description"}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {(o.tags || []).slice(0, 3).map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" />{o.view_count}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
