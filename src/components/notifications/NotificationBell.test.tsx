import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationBell } from "@/components/notifications/NotificationBell";

const fetchNotifications = vi.fn();
const fetchUnreadNotificationCount = vi.fn();
const markNotificationRead = vi.fn();
const markAllNotificationsRead = vi.fn();
const navigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/notification-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notification-service")>("@/lib/notification-service");

  return {
    ...actual,
    fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
    fetchUnreadNotificationCount: (...args: unknown[]) => fetchUnreadNotificationCount(...args),
    markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
    markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("NotificationBell", () => {
  it("shows unread count and preview items", async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: "notification-1",
        title: "New reply to your comment",
        body: "Someone replied to your comment on \"Access Policy\".",
        type: "comment_reply",
        link_path: "/definitions/definition-1",
        is_read: false,
        created_at: "2026-03-19T15:00:00.000Z",
        read_at: null,
        actor_user_id: null,
        actor_display_name: null,
        actor_email: null,
        entity_type: "comment",
        entity_id: "comment-1",
        parent_entity_type: "definition",
        parent_entity_id: "definition-1",
        metadata: {},
      },
    ]);
    fetchUnreadNotificationCount.mockResolvedValue(1);
    markNotificationRead.mockResolvedValue(undefined);

    render(<NotificationBell />);

    expect(await screen.findByText("New reply to your comment")).toBeInTheDocument();
    expect(screen.getByText("Someone replied to your comment on \"Access Policy\".")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Someone replied to your comment on \"Access Policy\"."));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith({}, "notification-1"));
    expect(navigate).toHaveBeenCalledWith("/definitions/definition-1");
  });

  it("marks all notifications as read from the dropdown", async () => {
    fetchNotifications.mockResolvedValue([]);
    fetchUnreadNotificationCount.mockResolvedValue(2);
    markAllNotificationsRead.mockResolvedValue(undefined);

    render(<NotificationBell />);

    fireEvent.click(await screen.findByText("Mark all read"));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledWith({}));
  });

  it("still renders notification previews when unread-count loading fails", async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: "notification-2",
        title: "Definition review assigned",
        body: "You were assigned to review Access Policy.",
        type: "assigned_definition_review",
        link_path: "/definitions/definition-2",
        is_read: false,
        created_at: "2026-03-19T15:00:00.000Z",
        read_at: null,
        actor_user_id: null,
        actor_display_name: null,
        actor_email: null,
        entity_type: "definition",
        entity_id: "definition-2",
        parent_entity_type: null,
        parent_entity_id: null,
        metadata: {},
      },
    ]);
    fetchUnreadNotificationCount.mockRejectedValue(new Error("count lookup failed"));

    render(<NotificationBell />);

    expect(await screen.findByText("Definition review assigned")).toBeInTheDocument();
    expect(screen.getByText("You were assigned to review Access Policy.")).toBeInTheDocument();
  });
});
