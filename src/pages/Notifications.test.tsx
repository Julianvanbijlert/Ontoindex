import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Notifications from "@/pages/Notifications";

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
  notificationTypeConfig: {
    definition_changed: { icon: () => null, label: "Definition changed", color: "text-info" },
    definition_status_changed: { icon: () => null, label: "Definition status changed", color: "text-warning" },
    ontology_changed: { icon: () => null, label: "Ontology changed", color: "text-accent" },
    definition_comment: { icon: () => null, label: "Definition comment", color: "text-primary" },
  },
}));

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
  it("shows stored notifications with their type labels and links", async () => {
    fetchNotifications.mockResolvedValue([
      {
        id: "notification-1",
        title: "Definition status changed",
        message: "Access Policy moved from draft to approved.",
        type: "definition_status_changed",
        link: "/definitions/definition-1",
        is_read: false,
        created_at: "2026-03-19T15:00:00.000Z",
      },
    ]);
    markNotificationRead.mockResolvedValue(undefined);

    render(<Notifications />);

    expect(await screen.findByText("Definition status changed", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Access Policy moved from draft to approved.")).toBeInTheDocument();
    expect(screen.getByText("Definition status changed", { selector: "div" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Access Policy moved from draft to approved."));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith({}, "notification-1", "user-1"));
    expect(navigate).toHaveBeenCalledWith("/definitions/definition-1");
  });
});
