import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Network, GitPullRequest, MessageSquare, TrendingUp, Bell, Search } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { subscribeToAppDataChanges } from "@/lib/entity-events";
import { fetchNotifications } from "@/lib/notification-service";

interface Stats {
  definitions: number;
  ontologies: number;
  pendingApprovals: number;
  comments: number;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ definitions: 0, ontologies: 0, pendingApprovals: 0, comments: 0 });
  const [recentDefs, setRecentDefs] = useState<any[]>([]);
  const [recentOntos, setRecentOntos] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        return;
      }
      const [defsRes, ontoRes, appRes, comRes, recentDefRes, recentOntoRes, activityRes, notifs] = await Promise.all([
        supabase.from("definitions").select("id", { count: "exact", head: true }),
        supabase.from("ontologies").select("id", { count: "exact", head: true }),
        supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "in_review"),
        supabase.from("comments").select("id", { count: "exact", head: true }),
        supabase.from("definitions").select("id, title, status, priority, updated_at, ontologies(title)").order("updated_at", { ascending: false }).limit(5),
        supabase.from("ontologies").select("id, title, status, view_count, updated_at").order("updated_at", { ascending: false }).limit(5),
        supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(8),
        fetchNotifications(supabase, { limit: 5, unreadOnly: true }),
      ]);

      setStats({
        definitions: defsRes.count || 0,
        ontologies: ontoRes.count || 0,
        pendingApprovals: appRes.count || 0,
        comments: comRes.count || 0,
      });
      setRecentDefs(recentDefRes.data || []);
      setRecentOntos(recentOntoRes.data || []);
      setRecentActivity(activityRes.data || []);
      setNotifications(notifs || []);
      setLoading(false);
    };
    fetchData();

    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [user]);

  const statCards = [
    { label: "Definitions", value: stats.definitions, icon: BookOpen, color: "text-primary", path: "/definitions" },
    { label: "Ontologies", value: stats.ontologies, icon: Network, color: "text-accent", path: "/ontologies" },
    { label: "Pending Reviews", value: stats.pendingApprovals, icon: GitPullRequest, color: "text-warning", path: "/workflow" },
    { label: "Comments", value: stats.comments, icon: MessageSquare, color: "text-info", path: "/definitions" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={`Welcome back, ${profile?.display_name || "User"}`}
        description="Here's what's happening in your knowledge base"
        actions={
          <Button onClick={() => navigate("/search")} className="gap-2">
            <Search className="h-4 w-4" />
            Open Search
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} loading={loading} onClick={() => navigate(s.path)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Definitions */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />Recent Definitions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentDefs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No definitions yet</p>
            ) : (
              <div className="space-y-1">
                {recentDefs.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/definitions/${d.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.ontologies?.title || "No ontology"}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Ontologies */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />Recent Ontologies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentOntos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No ontologies yet</p>
            ) : (
              <div className="space-y-1">
                {recentOntos.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/ontologies/${o.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.view_count} views</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity + Notifications */}
        <div className="space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">All caught up!</p>
              ) : (
                <div className="space-y-1">
                  {notifications.slice(0, 3).map(n => (
                    <div key={n.id} className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs font-medium text-foreground">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">No activity</p>
              ) : (
                <div className="space-y-1">
                  {recentActivity.slice(0, 4).map(a => (
                    <div key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-foreground"><span className="font-medium">{a.action}</span> {a.entity_type}: {a.entity_title}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
