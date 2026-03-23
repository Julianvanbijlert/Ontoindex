import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  getNotificationTypeMeta,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notification-service";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const refreshNotifications = async () => {
      try {
        const items = await fetchNotifications(supabase, { limit: 5 });
        let count = items.filter((item) => !item.is_read).length;

        try {
          count = await fetchUnreadNotificationCount(supabase);
        } catch (error) {
          console.error("[notification-bell] Failed to load unread notification count", error);
        }

        setNotifications(items);
        setUnreadCount(count);
      } catch (error) {
        console.error("[notification-bell] Failed to refresh notifications", error);
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    void refreshNotifications();

    return subscribeToAppDataChanges((detail) => {
      if (detail.entityType === "notification" || detail.entityType === "definition" || detail.entityType === "ontology") {
        void refreshNotifications();
      }
    });
  }, [user]);

  const handleOpenNotification = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        await markNotificationRead(supabase, notification.id);
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
        emitAppDataChanged({ entityType: "notification", action: "updated", entityId: notification.id });
      }

      if (notification.link_path) {
        navigate(notification.link_path);
      } else {
        navigate("/notifications");
      }
    } catch (error) {
      console.error("[notification-bell] Failed to open notification", error);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    try {
      await markAllNotificationsRead(supabase);
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      emitAppDataChanged({ entityType: "notification", action: "updated" });
    } catch (error) {
      console.error("[notification-bell] Failed to mark all notifications as read", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleMarkAllRead}>
            <CheckCheck className="mr-1 h-3 w-3" />
            Mark all read
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          notifications.map((notification) => {
            const meta = getNotificationTypeMeta(notification.type);
            const Icon = meta.icon;

            return (
              <DropdownMenuItem
                key={notification.id}
                className="flex cursor-pointer items-start gap-3 whitespace-normal px-3 py-3"
                onClick={() => void handleOpenNotification(notification)}
              >
                <div className={cn("mt-0.5 rounded-full bg-muted p-2", meta.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{notification.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer justify-center text-sm font-medium" onClick={() => navigate("/notifications")}>
          View notification inbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
