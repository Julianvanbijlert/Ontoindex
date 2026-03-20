import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "@/lib/notification-service";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { emitAppDataChanged, subscribeToAppDataChanges } from "@/lib/entity-events";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshNotifications = () => {
      fetchNotifications(supabase, user.id, 5).then(setNotifications);
    };

    refreshNotifications();

    return subscribeToAppDataChanges(() => {
      refreshNotifications();
    });
  }, [user]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const handleOpenNotification = async (notification: NotificationItem) => {
    if (!notification.is_read && user) {
      await markNotificationRead(supabase, notification.id, user.id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      );
      emitAppDataChanged({ entityType: "notification", action: "updated", entityId: notification.id });
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) {
      return;
    }

    await markAllNotificationsRead(supabase, user.id);
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    emitAppDataChanged({ entityType: "notification", action: "updated" });
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
      <DropdownMenuContent align="end" className="w-80">
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
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex cursor-pointer flex-col items-start gap-1 whitespace-normal px-3 py-3"
              onClick={() => handleOpenNotification(notification)}
            >
              <div className="flex w-full items-start gap-2">
                <div
                  className={cn(
                    "mt-1 h-2 w-2 rounded-full",
                    notification.is_read ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{notification.title}</p>
                  <p className="text-xs text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer justify-center text-sm font-medium" onClick={() => navigate("/notifications")}>
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
