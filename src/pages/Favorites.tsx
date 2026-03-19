import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Network, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchFavoriteItems, type FavoriteListItem } from "@/lib/favorites-service";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToAppDataChanges } from "@/lib/entity-events";

export default function Favorites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<FavoriteListItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Favorites</h1>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Star className="w-6 h-6" />} title="No favorites" description="Like definitions or ontologies to save them here" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
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
