import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, notificationTypeConfig, type NotificationItem } from "@/lib/notification-service";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    const data = await fetchNotifications(supabase, user.id);
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    return subscribeToAppDataChanges(() => {
      fetchData();
    });
  }, [user]);

  const markRead = async (id: string) => {
    if (!user) return;
    await markNotificationRead(supabase, id, user.id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    emitAppDataChanged({ entityType: "notification", action: "updated", entityId: id });
  };

  const markAllRead = async () => {
    if (!user) return;
    await markAllNotificationsRead(supabase, user.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    emitAppDataChanged({ entityType: "notification", action: "updated" });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread`}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />Mark all read
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={<Bell className="w-6 h-6" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const config = notificationTypeConfig[n.type] || notificationTypeConfig.definition_changed;
            const Icon = config.icon;
            return (
              <Card
                key={n.id}
                className={cn(
                  "border-border/50 transition-colors cursor-pointer hover:bg-muted/30",
                  !n.is_read && "bg-primary/5 border-primary/20"
                )}
                onClick={() => { markRead(n.id); if (n.link) navigate(n.link); }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted", config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {config.label}
                      </Badge>
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && (
                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); markRead(n.id); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
