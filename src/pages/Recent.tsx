import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Clock, BookOpen, Network, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchRecentActivity } from "@/lib/history-service";
import { subscribeToAppDataChanges } from "@/lib/entity-events";

export default function Recent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const refreshRecentActivity = () => {
      setLoading(true);
      fetchRecentActivity(supabase, 30)
        .then((data) => setEvents(data))
        .finally(() => setLoading(false));
    };

    refreshRecentActivity();

    return subscribeToAppDataChanges(() => {
      refreshRecentActivity();
    });
  }, [user]);

  const iconMap: Record<string, any> = { definition: BookOpen, ontology: Network, comment: MessageSquare };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Recent Activity</h1>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : events.length === 0 ? (
        <EmptyState icon={<Clock className="w-6 h-6" />} title="No activity" description="Your recent actions will appear here" />
      ) : (
        <div className="space-y-2">
          {events.map(e => {
            const Icon = iconMap[e.entity_type] || Clock;
            return (
              <Card key={e.id} className="border-border/50 hover:border-border cursor-pointer transition-colors" onClick={() => e.entity_id && navigate(`/${e.entity_type === "definition" ? "definitions" : "ontologies"}/${e.entity_id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium capitalize">{e.action}</span> {e.entity_type}: {e.entity_title}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
