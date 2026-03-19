import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Search as SearchIcon, Clock, TrendingUp, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("search_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
        .then(({ data }) => setSearchHistory(data || []));
    }
  }, [user]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);

    let q = supabase.from("definitions").select("*, categories(name, color)").eq("is_deleted", false)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,content.ilike.%${query}%`);
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (sortBy === "views") q = q.order("view_count", { ascending: false });
    else if (sortBy === "recent") q = q.order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: false });

    const { data } = await q;
    setResults(data || []);

    // Save search history
    if (user) {
      await supabase.from("search_history").insert({ user_id: user.id, query: query.trim(), filters: { status: statusFilter, sort: sortBy } });
    }
    setLoading(false);
  };

  const clearHistory = async (historyId: string) => {
    await supabase.from("search_history").delete().eq("id", historyId);
    setSearchHistory(prev => prev.filter(h => h.id !== historyId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-1">Find definitions, ontologies, and more</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search definitions..."
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevance</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="views">Most Viewed</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch}>Search</Button>
      </div>

      {!hasSearched && searchHistory.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent searches
            </h3>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map(h => (
                <Badge
                  key={h.id}
                  variant="secondary"
                  className="cursor-pointer group flex items-center gap-1"
                  onClick={() => { setQuery(h.query); }}
                >
                  {h.query}
                  <X className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); clearHistory(h.id); }} />
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : hasSearched && results.length === 0 ? (
        <EmptyState icon={<SearchIcon className="w-6 h-6" />} title="No results" description={`No definitions found for "${query}"`} />
      ) : (
        <div className="space-y-2">
          {results.map(d => (
            <Card key={d.id} className="border-border/50 hover:border-border transition-colors cursor-pointer" onClick={() => navigate(`/definitions/${d.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground">{d.title}</h3>
                  <StatusBadge status={d.status} />
                  <PriorityBadge priority={d.priority} />
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{d.description || d.content || "No description"}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {d.categories && <span>{d.categories.name}</span>}
                  <span>{d.view_count} views</span>
                  <span>{new Date(d.updated_at).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
