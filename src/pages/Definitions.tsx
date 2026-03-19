import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LikeButton } from "@/components/shared/LikeButton";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookOpen, Search, Eye, Network, LayoutGrid, List, SlidersHorizontal, ArrowUpAZ, ArrowDownAZ, Group } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { subscribeToAppDataChanges } from "@/lib/entity-events";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function Definitions() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ontologyFilter, setOntologyFilter] = useState("all");
  const [ontologies, setOntologies] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Viewer Settings
  const [viewSize, setViewSize] = useState<"small" | "medium" | "large">(profile?.view_preference as any || "medium");
  const [viewFormat, setViewFormat] = useState<"grid" | "table">(profile?.format_preference as any || "grid");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(profile?.sort_preference as any || "desc");
  const [groupBy, setGroupBy] = useState<"none" | "name" | "date" | "status">("none");

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from("definitions").select("*, ontologies(id, title)").eq("is_deleted", false);
    
    if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
    if (ontologyFilter !== "all") query = query.eq("ontology_id", ontologyFilter);
    if (searchQuery.trim()) query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    
    // Applying sort
    query = query.order("updated_at", { ascending: sortOrder === "asc" });

    const [defsRes, ontoRes, favsRes] = await Promise.all([
      query,
      supabase.from("ontologies").select("id, title").order("title"),
      user ? supabase.from("favorites").select("definition_id").eq("user_id", user.id).not("definition_id", "is", null) : Promise.resolve({ data: [] }),
    ]);

    let finalDefs = defsRes.data || [];
    
    // Merge localStorage definitions for the demo
    try {
      const localGlobal = JSON.parse(localStorage.getItem("mock_db_definitions_global") || "[]");
      if (localGlobal.length > 0) {
        // Add a mock ontology object for consistency
        const withOnto = localGlobal.map((d: any) => ({
          ...d,
          ontologies: d.ontologies || { id: "global", title: "Imported" }
        }));
        finalDefs = [...finalDefs, ...withOnto];
      }
    } catch (e) {
      console.warn("Failed to load local definitions", e);
    }

    // Secondary client-side sorting if needed (since we merged)
    finalDefs.sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    setDefinitions(finalDefs);
    setOntologies(ontoRes.data || []);
    setFavorites(new Set((favsRes.data || []).map((f: any) => f.definition_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter, ontologyFilter, searchQuery, sortOrder]);

  useEffect(() => {
    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [statusFilter, ontologyFilter, searchQuery, user]);

  const groupedDefinitions = () => {
    if (groupBy === "none") return { "All": definitions };
    return definitions.reduce((acc: any, d) => {
      let key = "Other";
      if (groupBy === "name") key = d.title[0]?.toUpperCase() || "#";
      if (groupBy === "status") key = d.status || "Unknown";
      if (groupBy === "date") key = new Date(d.updated_at).toLocaleDateString();
      
      if (!acc[key]) acc[key] = [];
      acc[key].push(d);
      return acc;
    }, {});
  };

  const groups = groupedDefinitions();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Definitions"
        description="Browse definitions across all ontologies"
      />

      <div className="flex flex-col gap-4 bg-card p-4 rounded-xl border border-border/50">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search definitions..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ontologyFilter} onValueChange={setOntologyFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Ontology" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ontologies</SelectItem>
                {ontologies.map(o => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg">
              <Button variant={viewFormat === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewFormat("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={viewFormat === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewFormat("table")}>
                <List className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-4 w-[1px] bg-border" />

            <Tabs value={viewSize} onValueChange={v => setViewSize(v as any)}>
              <TabsList className="h-8 bg-muted/50">
                <TabsTrigger value="small" className="text-[10px] px-2 h-6">Small</TabsTrigger>
                <TabsTrigger value="medium" className="text-[10px] px-2 h-6">Medium</TabsTrigger>
                <TabsTrigger value="large" className="text-[10px] px-2 h-6">Large</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
              {sortOrder === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </Button>
            
            <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <Group className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No grouping</SelectItem>
                <SelectItem value="name">First Letter</SelectItem>
                <SelectItem value="date">Date Modified</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : definitions.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="No definitions found"
          description="Definitions are created within ontologies. Browse ontologies to add definitions."
          action={{ label: "Browse Ontologies", onClick: () => navigate("/ontologies") }}
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([groupName, groupItems]: [string, any]) => (
            <div key={groupName} className="space-y-4">
              {groupBy !== "none" && (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{groupName}</h2>
                  <div className="flex-1 h-[1px] bg-border/50" />
                  <Badge variant="outline" className="text-[10px]">{groupItems.length}</Badge>
                </div>
              )}
              
              <div className={cn(
                "gap-4",
                viewFormat === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col"
              )}>
                {groupItems.map((d: any) => (
                  <Card 
                    key={d.id} 
                    className={cn(
                      "group border-border/50 hover:border-primary/50 transition-all cursor-pointer overflow-hidden",
                      viewSize === "small" ? "p-3" : viewSize === "large" ? "p-6" : "p-4"
                    )} 
                    onClick={() => navigate(`/definitions/${d.id}`)}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className={cn("font-semibold text-foreground group-hover:text-primary transition-colors", viewSize === "large" ? "text-lg" : "text-sm")}>
                            {d.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <StatusBadge status={d.status} />
                            <PriorityBadge priority={d.priority} />
                          </div>
                        </div>
                        <LikeButton
                          entityId={d.id}
                          entityType="definition"
                          isLiked={favorites.has(d.id)}
                          onToggle={liked => {
                            setFavorites(prev => {
                              const n = new Set(prev);
                              liked ? n.add(d.id) : n.delete(d.id);
                              return n;
                            });
                          }}
                        />
                      </div>
                      
                      <p className={cn(
                        "text-muted-foreground line-clamp-2",
                        viewSize === "small" ? "text-xs" : "text-sm"
                      )}>
                        {d.description || "No description provided"}
                      </p>
                      
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          {d.ontologies && (
                            <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                              <Network className="h-3 w-3" />{d.ontologies.title}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{d.view_count}</span>
                          <span>{new Date(d.updated_at).toLocaleDateString()}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] h-4">v{d.version}</Badge>
                      </div>
                    </div>
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
