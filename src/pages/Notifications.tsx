import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import {
  fetchNotificationPreferences,
  fetchNotifications,
  getNotificationTypeMeta,
  groupNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  updateNotificationPreference,
  type NotificationItem,
  type NotificationPreference,
} from "@/lib/notification-service";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function NotificationCard({
  notification,
  onOpen,
  onToggleRead,
}: {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
  onToggleRead: (notification: NotificationItem) => void;
}) {
  const meta = getNotificationTypeMeta(notification.type);
  const Icon = meta.icon;
  const actorName = notification.actor_display_name || notification.actor_email || null;

  return (
    <Card
      className={cn(
        "border-border/50 transition-colors hover:bg-muted/30",
        notification.link_path && "cursor-pointer",
        !notification.is_read && "border-primary/20 bg-primary/5",
      )}
      onClick={() => notification.link_path && onOpen(notification)}
    >
      <CardContent className="flex gap-4 p-4">
        <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted", meta.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{notification.title}</p>
            <Badge variant="outline" className="text-[10px]">
              {meta.label}
            </Badge>
            {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {actorName && <span>{actorName}</span>}
            <span title={new Date(notification.created_at).toLocaleString()}>
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-xs text-muted-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onToggleRead(notification);
          }}
        >
          {notification.is_read ? "Mark unread" : <><Check className="mr-1 h-3 w-3" />Mark read</>}
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferencesPanel({
  preferences,
  loading,
  updating,
  onToggle,
}: {
  preferences: NotificationPreference[];
  loading: boolean;
  updating: string | null;
  onToggle: (preference: NotificationPreference, enabled: boolean) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, NotificationPreference[]>();

    preferences.forEach((preference) => {
      const current = map.get(preference.category) || [];
      current.push(preference);
      map.set(preference.category, current);
    });

    return Array.from(map.entries());
  }, [preferences]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([category, items]) => (
        <Card key={category} className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((preference) => (
              <div key={preference.notification_type} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{preference.label}</p>
                  <p className="text-sm text-muted-foreground">{preference.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {updating === preference.notification_type && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={preference.enabled}
                    onCheckedChange={(enabled) => onToggle(preference, enabled)}
                    disabled={updating === preference.notification_type}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [updatingPreference, setUpdatingPreference] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadInbox = async ({ quiet = false } = {}) => {
    try {
      if (!quiet) {
        setLoadingInbox(true);
      }

      setInboxError(null);
      setNotifications(await fetchNotifications(supabase));
    } catch (error) {
      console.error("[notifications-page] Failed to load notifications", error);
      setInboxError("Unable to load notifications.");
    } finally {
      if (!quiet) {
        setLoadingInbox(false);
      }
    }
  };

  const loadPreferences = async ({ quiet = false } = {}) => {
    try {
      if (!quiet) {
        setLoadingPrefs(true);
      }

      setPrefsError(null);
      setPreferences(await fetchNotificationPreferences(supabase));
    } catch (error) {
      console.error("[notifications-page] Failed to load notification preferences", error);
      setPrefsError("Unable to load notification preferences.");
    } finally {
      if (!quiet) {
        setLoadingPrefs(false);
      }
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setPreferences([]);
      setLoadingInbox(false);
      setLoadingPrefs(false);
      setInboxError(null);
      setPrefsError(null);
      return;
    }

    void loadInbox();
    void loadPreferences();

    return subscribeToAppDataChanges((detail) => {
      if (detail.entityType === "notification" || detail.entityType === "definition" || detail.entityType === "ontology") {
        void loadInbox({ quiet: true });
      }
    });
  }, [user]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadInbox({ quiet: false }), loadPreferences({ quiet: false })]);
    setRefreshing(false);
  };

  const handleOpenNotification = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        await markNotificationRead(supabase, notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, is_read: true, read_at: new Date().toISOString() }
              : item,
          ),
        );
        emitAppDataChanged({ entityType: "notification", action: "updated", entityId: notification.id });
      }

      if (notification.link_path) {
        navigate(notification.link_path);
      }
    } catch (error) {
      console.error("[notifications-page] Failed to open notification", error);
      toast.error(error instanceof Error ? error.message : "Unable to open notification.");
    }
  };

  const handleToggleRead = async (notification: NotificationItem) => {
    try {
      if (notification.is_read) {
        await markNotificationUnread(supabase, notification.id);
      } else {
        await markNotificationRead(supabase, notification.id);
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                is_read: !notification.is_read,
                read_at: notification.is_read ? null : new Date().toISOString(),
              }
            : item,
        ),
      );
      emitAppDataChanged({ entityType: "notification", action: "updated", entityId: notification.id });
    } catch (error) {
      console.error("[notifications-page] Failed to toggle notification read state", error);
      toast.error(error instanceof Error ? error.message : "Unable to update notification state.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(supabase);
      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })),
      );
      emitAppDataChanged({ entityType: "notification", action: "updated" });
    } catch (error) {
      console.error("[notifications-page] Failed to mark all notifications as read", error);
      toast.error(error instanceof Error ? error.message : "Unable to mark notifications as read.");
    }
  };

  const handleTogglePreference = async (preference: NotificationPreference, enabled: boolean) => {
    setUpdatingPreference(preference.notification_type);

    try {
      await updateNotificationPreference(supabase, preference.notification_type, enabled);
      setPreferences((current) =>
        current.map((item) =>
          item.notification_type === preference.notification_type ? { ...item, enabled } : item,
        ),
      );
      toast.success("Notification preference updated");
    } catch (error) {
      console.error("[notifications-page] Failed to update notification preference", error);
      toast.error(error instanceof Error ? error.message : "Unable to update notification preference.");
    } finally {
      setUpdatingPreference(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "Everything is up to date"}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          {loadingInbox ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : inboxError ? (
            <Card className="border-destructive/20">
              <CardContent className="p-6 text-sm text-destructive">{inboxError}</CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title="No notifications yet"
              description="When tracked items change or someone needs your attention, this inbox will show it here."
            />
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {group.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">{group.items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((notification) => (
                      <NotificationCard
                        key={notification.id}
                        notification={notification}
                        onOpen={handleOpenNotification}
                        onToggleRead={handleToggleRead}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          {prefsError ? (
            <Card className="border-destructive/20">
              <CardContent className="p-6 text-sm text-destructive">{prefsError}</CardContent>
            </Card>
          ) : (
            <PreferencesPanel
              preferences={preferences}
              loading={loadingPrefs}
              updating={updatingPreference}
              onToggle={handleTogglePreference}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
