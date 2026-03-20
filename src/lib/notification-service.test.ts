import { describe, expect, it, vi } from "vitest";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-service";

describe("notification-service", () => {
  it("loads notifications scoped to the current user", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn(() => ({ select })),
    } as any;

    await fetchNotifications(client, "user-1");

    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("marks a single notification as read only for the current user", async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const client = {
      from: vi.fn(() => ({ update })),
    } as any;

    await markNotificationRead(client, "notification-1", "user-1");

    expect(eqId).toHaveBeenCalledWith("id", "notification-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("marks all notifications as read only for the current user", async () => {
    const eqRead = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqRead });
    const update = vi.fn().mockReturnValue({ eq: eqUser });
    const client = {
      from: vi.fn(() => ({ update })),
    } as any;

    await markAllNotificationsRead(client, "user-1");

    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqRead).toHaveBeenCalledWith("is_read", false);
  });
});
