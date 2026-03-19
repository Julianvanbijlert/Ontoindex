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
import { BookOpen, Search, Eye, Network } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { subscribeToAppDataChanges } from "@/lib/entity-events";

export default function Definitions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ontologyFilter, setOntologyFilter] = useState("all");
  const [ontologies, setOntologies] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from("definitions").select("*, ontologies(id, title)").eq("is_deleted", false).order("updated_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
    if (ontologyFilter !== "all") query = query.eq("ontology_id", ontologyFilter);
    if (searchQuery.trim()) query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);

    const [defsRes, ontoRes, favsRes] = await Promise.all([
      query,
      supabase.from("ontologies").select("id, title").order("title"),
      user ? supabase.from("favorites").select("definition_id").eq("user_id", user.id).not("definition_id", "is", null) : Promise.resolve({ data: [] }),
    ]);

    setDefinitions(defsRes.data || []);
    setOntologies(ontoRes.data || []);
    setFavorites(new Set((favsRes.data || []).map((f: any) => f.definition_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter, ontologyFilter, searchQuery]);

  useEffect(() => {
    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [statusFilter, ontologyFilter, searchQuery, user]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Definitions"
        description="Browse definitions across all ontologies"
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search definitions..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
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
        <div className="space-y-2">
          {definitions.map(d => (
            <Card key={d.id} className="border-border/50 hover:border-border transition-colors cursor-pointer group" onClick={() => navigate(`/definitions/${d.id}`)}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-foreground truncate">{d.title}</h3>
                    <StatusBadge status={d.status} />
                    <PriorityBadge priority={d.priority} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{d.description || "No description"}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {d.ontologies && (
                      <span className="inline-flex items-center gap-1">
                        <Network className="h-3 w-3" />{d.ontologies.title}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{d.view_count}</span>
                    <span>v{d.version}</span>
                    <span>{new Date(d.updated_at).toLocaleDateString()}</span>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
