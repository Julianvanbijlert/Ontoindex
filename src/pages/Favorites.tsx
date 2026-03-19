import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Favorites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("favorites").select("*, definitions(id, title, description, status)").eq("user_id", user.id).not("definition_id", "is", null).order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Favorites</h1>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Star className="w-6 h-6" />} title="No favorites" description="Star definitions to save them here" />
      ) : (
        <div className="space-y-2">
          {items.map(f => f.definitions && (
            <Card key={f.id} className="border-border/50 hover:border-border cursor-pointer transition-colors" onClick={() => navigate(`/definitions/${f.definitions.id}`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{f.definitions.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{f.definitions.description}</p>
                </div>
                <StatusBadge status={f.definitions.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
