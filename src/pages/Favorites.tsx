import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Network, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchFavoriteItems, filterAndSortFavorites, type FavoriteFilters, type FavoriteListItem } from "@/lib/favorites-service";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToAppDataChanges } from "@/lib/entity-events";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Favorites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<FavoriteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FavoriteFilters>({
    type: "all",
    ontologyId: "all",
    tag: "all",
    status: "all",
    sortBy: "liked_recent",
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        return;
      }

      setLoading(true);
      await fetchFavoriteItems(supabase, user.id)
        .then((data) => setItems(data))
        .finally(() => setLoading(false));
    };

    fetchData();

    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [user]);

  const ontologies = Array.from(
    new Map(items.filter((item) => item.ontologyId && item.ontologyTitle).map((item) => [item.ontologyId, item.ontologyTitle])).entries(),
  );
  const tags = Array.from(new Set(items.flatMap((item) => item.tags))).sort();
  const visibleItems = filterAndSortFavorites(items, filters);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Favorites</h1>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Select value={filters.type} onValueChange={(value) => setFilters((current) => ({ ...current, type: value as FavoriteFilters["type"] }))}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="definition">Definitions</SelectItem>
            <SelectItem value="ontology">Ontologies</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.ontologyId} onValueChange={(value) => setFilters((current) => ({ ...current, ontologyId: value }))}>
          <SelectTrigger><SelectValue placeholder="Ontology" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ontologies</SelectItem>
            {ontologies.map(([id, title]) => (
              <SelectItem key={id} value={id}>{title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.tag} onValueChange={(value) => setFilters((current) => ({ ...current, tag: value }))}>
          <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.sortBy} onValueChange={(value) => setFilters((current) => ({ ...current, sortBy: value as FavoriteFilters["sortBy"] }))}>
          <SelectTrigger><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="liked_recent">Recently liked</SelectItem>
            <SelectItem value="updated_recent">Recently updated</SelectItem>
            <SelectItem value="alphabetical">Alphabetical</SelectItem>
            <SelectItem value="most_viewed">Most viewed</SelectItem>
            <SelectItem value="workflow_status">Workflow status</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : visibleItems.length === 0 ? (
        <EmptyState icon={<Star className="w-6 h-6" />} title="No favorites" description="Like definitions or ontologies to save them here" />
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <Card
              key={item.favoriteId}
              className="border-border/50 hover:border-border cursor-pointer transition-colors"
              onClick={() => navigate(item.entityType === "ontology" ? `/ontologies/${item.entityId}` : `/definitions/${item.entityId}`)}
            >
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {item.entityType === "ontology" ? "Ontology" : "Definition"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{item.description || "No description"}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.ontologyTitle && item.entityType === "definition" && (
                      <Badge variant="secondary" className="text-[10px]">{item.ontologyTitle}</Badge>
                    )}
                    {item.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.entityType === "ontology" && <Network className="h-4 w-4 text-muted-foreground" />}
                  <StatusBadge status={item.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
