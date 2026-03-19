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
import { Network, Plus, Search, Loader2, Eye, LayoutGrid, List, ArrowUpAZ, ArrowDownAZ, Group } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Ontologies() {
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const [ontologies, setOntologies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOnto, setNewOnto] = useState({ title: "", description: "", tags: "" });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const canEditContent = hasRole("admin") || hasRole("editor");

  // Viewer Settings
  const [viewSize, setViewSize] = useState<"small" | "medium" | "large">(profile?.view_preference as any || "medium");
  const [viewFormat, setViewFormat] = useState<"grid" | "table">(profile?.format_preference as any || "grid");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(profile?.sort_preference as any || "desc");
  const [groupBy, setGroupBy] = useState<string>(profile?.group_by_preference || "none");

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from("ontologies").select("*").order("updated_at", { ascending: sortOrder === "asc" });
    if (searchQuery.trim()) query = query.ilike("title", `%${searchQuery}%`);
    const [ontoRes, favsRes] = await Promise.all([
      query,
      user ? supabase.from("favorites").select("ontology_id").eq("user_id", user.id).not("ontology_id", "is", null) : Promise.resolve({ data: [] }),
    ]);
    setOntologies(ontoRes.data || []);
    setFavorites(new Set((favsRes.data || []).map((f: any) => f.ontology_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [searchQuery, sortOrder]);

  const handleCreate = async () => {
    if (!canEditContent) { toast.error("Your current role is read-only."); return; }
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
      emitAppDataChanged({ entityType: "ontology", action: "created", entityId: data.id });
      fetchData();
    }
    setCreating(false);
  };

  useEffect(() => {
    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [searchQuery, user, sortOrder]);

  const groupedOntologies = () => {
    if (groupBy === "none") return { "All Ontologies": ontologies };
    
    return ontologies.reduce((acc: any, onto) => {
      let key = "Other";
      if (groupBy === "status") key = onto.status || "Draft";
      else if (groupBy === "name") key = onto.title[0].toUpperCase();
      
      if (!acc[key]) acc[key] = [];
      acc[key].push(onto);
      return acc;
    }, {});
  };

  const groups = groupedOntologies();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Ontologies"
        description="Browse and manage ontology structures"
        actions={
          canEditContent ? (
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
          ) : undefined
        }
      />

      <div className="bg-card p-4 rounded-xl border border-border/50 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search ontologies..." className="pl-9 h-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/40">
            <Button variant={viewFormat === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewFormat("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewFormat === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewFormat("table")}>
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Tabs value={viewSize} onValueChange={v => setViewSize(v as any)}>
            <TabsList className="h-9 bg-muted/50 p-1 border border-border/40">
              <TabsTrigger value="small" className="h-7 px-3 gap-1.5 text-[11px] font-medium">
                <LayoutGrid className="h-3 w-3" />
                Small
              </TabsTrigger>
              <TabsTrigger value="medium" className="h-7 px-3 gap-1.5 text-[11px] font-medium">
                <LayoutGrid className="h-3.5 w-3.5" />
                Medium
              </TabsTrigger>
              <TabsTrigger value="large" className="h-7 px-3 gap-1.5 text-[11px] font-medium">
                <Square className="h-4 w-4" />
                Large
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="outline" size="sm" className="h-8 gap-2 text-[10px]" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
            {sortOrder === "asc" ? <ArrowUpAZ className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3" />}
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </Button>

          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[120px] text-[10px]">
              <Group className="h-3 w-3 mr-2" />
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No group</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      ) : ontologies.length === 0 ? (
        <EmptyState icon={<Network className="w-6 h-6" />} title="No ontologies" description="Create your first ontology to start building knowledge graphs" action={{ label: "Create Ontology", onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([groupName, groupItems]: [string, any]) => (
            <div key={groupName} className="space-y-4">
              {groupBy !== "none" && (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{groupName}</h2>
                  <div className="h-[1px] flex-1 bg-border/40" />
                  <Badge variant="outline" className="text-[10px]">{groupItems.length}</Badge>
                </div>
              )}
              
              <div className={cn(
                "gap-4",
                viewFormat === "grid" 
                  ? viewSize === "small" 
                    ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" 
                    : viewSize === "large"
                      ? "grid grid-cols-1 lg:grid-cols-2"
                      : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                  : "flex flex-col"
              )}>
                {groupItems.map((o: any) => (
                  <Card key={o.id} className={cn(
                    "border-border/50 hover:border-primary/50 transition-all cursor-pointer group shadow-none",
                    viewSize === "small" ? "p-0" : ""
                  )} onClick={() => navigate(`/ontologies/${o.id}`)}>
                    <CardContent className={cn(
                      "flex flex-col gap-3",
                      viewSize === "small" ? "p-3" : viewSize === "large" ? "p-6" : "p-4"
                    )}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors",
                            viewSize === "small" ? "w-7 h-7" : "w-10 h-10"
                          )}>
                            <Network className={cn("text-primary", viewSize === "small" ? "w-3 h-3" : "w-5 h-5")} />
                          </div>
                          <div>
                            <h3 className={cn(
                              "font-bold text-foreground group-hover:text-primary transition-colors", 
                              viewSize === "large" ? "text-2xl" : viewSize === "small" ? "text-xs" : "text-sm"
                            )}>{o.title}</h3>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <StatusBadge status={o.status} className={viewSize === "small" ? "scale-75 origin-left" : ""} />
                              {viewSize !== "small" && <span className="text-[9px] text-muted-foreground">{new Date(o.updated_at).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>
                        <LikeButton
                          entityId={o.id}
                          entityType="ontology"
                          isLiked={favorites.has(o.id)}
                          size="sm"
                          onToggle={(liked) => {
                            setFavorites((previous) => {
                              const next = new Set(previous);
                              if (liked) next.add(o.id); else next.delete(o.id);
                              return next;
                            });
                          }}
                        />
                      </div>

                      {viewSize !== "small" && (
                        <p className={cn(
                          "text-muted-foreground", 
                          viewSize === "large" ? "text-base" : "text-xs line-clamp-2"
                        )}>{o.description || "No description provided"}</p>
                      )}

                      <div className={cn(
                        "flex items-center justify-between mt-auto border-t border-border/40",
                        viewSize === "small" ? "pt-1.5 mt-0" : viewSize === "large" ? "pt-4 mt-2" : "pt-2 mt-auto"
                      )}>
                        <div className="flex flex-wrap gap-1">
                          {(o.tags || []).slice(0, viewSize === "large" ? 5 : 2).map((t: string) => <Badge key={t} variant="secondary" className="text-[9px] px-1.5 h-4">{t}</Badge>)}
                          {(o.tags || []).length > (viewSize === "large" ? 5 : 2) && <span className="text-[8px] text-muted-foreground">+{(o.tags || []).length - (viewSize === "large" ? 5 : 2)}</span>}
                        </div>
                        {viewSize !== "small" && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{o.view_count || 0}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
