import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationBell } from "@/components/notifications/NotificationBell";

const fetchNotifications = vi.fn();
const markNotificationRead = vi.fn();
const markAllNotificationsRead = vi.fn();
const navigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/notification-service", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  const DropdownMenu = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const DropdownMenuTrigger = ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return children;
    }

    return <div>{children}</div>;
  };
  const DropdownMenuContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const DropdownMenuLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  const DropdownMenuSeparator = () => <hr />;
  const DropdownMenuItem = ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );

  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("NotificationBell", () => {
  it("shows unread count and notification preview items", async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: "notif-1",
        title: "Definition updated",
        message: "Access Policy was updated.",
        type: "update",
        link: "/definitions/def-1",
        is_read: false,
        created_at: "2026-03-19T09:00:00.000Z",
      },
    ]);

    render(<NotificationBell />);

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

    expect(await screen.findByText("Definition updated")).toBeInTheDocument();
  });
});
