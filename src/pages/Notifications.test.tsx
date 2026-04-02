import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Notifications from "@/pages/Notifications";

const {
  fetchNotifications,
  fetchNotificationPreferences,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  navigate,
  updateNotificationPreference,
} = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  fetchUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
  navigate: vi.fn(),
}));

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
    markNotificationUnread: (...args: unknown[]) => markNotificationUnread(...args),
    markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
    fetchNotificationPreferences: (...args: unknown[]) => fetchNotificationPreferences(...args),
    updateNotificationPreference: (...args: unknown[]) => updateNotificationPreference(...args),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("Notifications page", () => {
  it("shows notifications and marks one as read before navigating", async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: "notification-1",
        title: "Definition changed: Access Policy",
        body: "Workflow status changed from draft to approved.",
        type: "tracked_definition_history_changed",
        link_path: "/definitions/definition-1",
        is_read: false,
        created_at: "2026-03-19T15:00:00.000Z",
        read_at: null,
        actor_user_id: "user-2",
        actor_display_name: "Reviewer",
        actor_email: "reviewer@example.com",
        entity_type: "definition",
        entity_id: "definition-1",
        parent_entity_type: "ontology",
        parent_entity_id: "ontology-1",
        metadata: {},
      },
    ]);
    fetchUnreadNotificationCount.mockResolvedValue(1);
    fetchNotificationPreferences.mockResolvedValue([]);
    markNotificationRead.mockResolvedValue(undefined);

    render(<Notifications />);

    expect(await screen.findByText("Definition changed: Access Policy")).toBeInTheDocument();
    expect(screen.getByText("Workflow status changed from draft to approved.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Workflow status changed from draft to approved."));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith({}, "notification-1"));
    expect(navigate).toHaveBeenCalledWith("/definitions/definition-1");
  });

  it("updates notification preferences from the preferences tab", async () => {
    fetchNotifications.mockResolvedValue([]);
    fetchUnreadNotificationCount.mockResolvedValue(0);
    fetchNotificationPreferences.mockResolvedValue([
      {
        notification_type: "comment_reply",
        category: "comments",
        label: "Comment replies",
        description: "Notify me when someone replies to one of my comments.",
        default_enabled: true,
        enabled: true,
      },
    ]);
    updateNotificationPreference.mockResolvedValue(undefined);

    render(<Notifications />);

    const preferencesTab = await screen.findByRole("tab", { name: "Preferences" });
    fireEvent.mouseDown(preferencesTab);
    fireEvent.click(preferencesTab);
    fireEvent.click(await screen.findByRole("switch"));

    await waitFor(() =>
      expect(updateNotificationPreference).toHaveBeenCalledWith({}, "comment_reply", false),
    );
  });
});
