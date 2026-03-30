import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchUnreadNotificationCount,
  groupNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  updateNotificationPreference,
} from "@/lib/notification-service";

function createAuthenticatedClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    ...overrides,
  } as any;
}

function createNotificationsFallbackClient(rows: Record<string, unknown>[]) {
  const range = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn().mockReturnValue({ range });
  const order = vi.fn().mockReturnValue({ eq, range });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: createAuthenticatedClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.fetch_my_notifications(_limit, _offset, _unread_only) in the schema cache",
        },
      }),
      from,
    }),
    spies: { from, select, order, eq, range },
  };
}

function createReadStateFallbackClient({
  rpcError,
  firstUpdateError = null,
  secondUpdateError = null,
}: {
  rpcError: Record<string, unknown>;
  firstUpdateError?: Record<string, unknown> | null;
  secondUpdateError?: Record<string, unknown> | null;
}) {
  const secondEq = vi.fn().mockResolvedValue({ error: secondUpdateError });
  const firstEq = vi.fn().mockResolvedValue({ error: firstUpdateError });
  const update = vi
    .fn()
    .mockReturnValueOnce({ eq: firstEq })
    .mockReturnValueOnce({ eq: secondEq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    client: createAuthenticatedClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: rpcError,
      }),
      from,
    }),
    spies: { from, update, firstEq, secondEq },
  };
}

describe("notification-service", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads notifications through the inbox rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createAuthenticatedClient({ rpc });

    await fetchNotifications(client, { limit: 10, unreadOnly: true });

    expect(rpc).toHaveBeenCalledWith("fetch_my_notifications", {
      _limit: 10,
      _offset: 0,
      _unread_only: true,
    });
  });

  it("loads unread count through the unread-count rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const client = createAuthenticatedClient({ rpc });

    await expect(fetchUnreadNotificationCount(client)).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("fetch_my_notification_unread_count");
  });

  it("marks a notification as read through the read-state rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "notification-1" }, error: null });
    const client = createAuthenticatedClient({ rpc });

    await markNotificationRead(client, "notification-1");

    expect(rpc).toHaveBeenCalledWith("set_my_notification_read_state", {
      _notification_id: "notification-1",
      _is_read: true,
    });
  });

  it("marks a notification as unread through the read-state rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "notification-1" }, error: null });
    const client = createAuthenticatedClient({ rpc });

    await markNotificationUnread(client, "notification-1");

    expect(rpc).toHaveBeenCalledWith("set_my_notification_read_state", {
      _notification_id: "notification-1",
      _is_read: false,
    });
  });

  it("marks all notifications as read through the bulk rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { marked_count: 4 }, error: null });
    const client = createAuthenticatedClient({ rpc });

    await markAllNotificationsRead(client);

    expect(rpc).toHaveBeenCalledWith("mark_all_my_notifications_read");
  });

  it("loads preferences through the preference rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createAuthenticatedClient({ rpc });

    await fetchNotificationPreferences(client);

    expect(rpc).toHaveBeenCalledWith("fetch_my_notification_preferences");
  });

  it("updates a notification preference through the preference rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { enabled: false }, error: null });
    const client = createAuthenticatedClient({ rpc });

    await updateNotificationPreference(client, "comment_reply", false);

    expect(rpc).toHaveBeenCalledWith("set_my_notification_preference", {
      _notification_type: "comment_reply",
      _enabled: false,
    });
  });

  it("returns an empty array when the notifications rpc returns no rows", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createAuthenticatedClient({ rpc });

    await expect(fetchNotifications(client)).resolves.toEqual([]);
  });

  it("falls back to the notifications table when the inbox rpc is unavailable", async () => {
    const { client } = createNotificationsFallbackClient([
      {
        id: "notification-1",
        type: "comment_reply",
        title: "Reply",
        message: "Fallback body",
        link: "/definitions/definition-1",
        is_read: false,
        created_at: "2026-03-23T10:00:00.000Z",
      },
    ]);

    await expect(fetchNotifications(client)).resolves.toEqual([
      expect.objectContaining({
        id: "notification-1",
        body: "Fallback body",
        link_path: "/definitions/definition-1",
        is_read: false,
      }),
    ]);
  });

  it("falls back to the notifications table when the rpc hits a missing read_at schema-cache error", async () => {
    const range = vi.fn().mockResolvedValue({
      data: [
        {
          id: "notification-1",
          type: "comment_reply",
          title: "Reply",
          message: "Fallback body",
          is_read: true,
          created_at: "2026-03-23T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ range });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const client = createAuthenticatedClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'read_at' column of 'notifications' in the schema cache",
        },
      }),
      from,
    });

    await expect(fetchNotifications(client)).resolves.toEqual([
      expect.objectContaining({
        id: "notification-1",
        is_read: true,
        read_at: "2026-03-23T10:00:00.000Z",
      }),
    ]);
  });

  it("keeps fallback notification reads RLS-safe by not querying another user id", async () => {
    const { client, spies } = createNotificationsFallbackClient([]);

    await fetchNotifications(client, { unreadOnly: true });

    expect(spies.eq).toHaveBeenCalledWith("is_read", false);
    expect(spies.eq).not.toHaveBeenCalledWith("user_id", expect.anything());
  });

  it("returns default preferences when saved preference rows are missing", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn().mockReturnValue({ select });
    const client = createAuthenticatedClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.fetch_my_notification_preferences() in the schema cache",
        },
      }),
      from,
    });

    const result = await fetchNotificationPreferences(client);

    expect(from).toHaveBeenCalledWith("notification_preferences");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_type: "ontology_workflow_changed",
          enabled: true,
        }),
        expect.objectContaining({
          notification_type: "definition_deleted",
          enabled: true,
        }),
        expect.objectContaining({
          notification_type: "comment_reply",
          enabled: true,
        }),
      ]),
    );
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_type: "tracked_ontology_history_changed",
        }),
      ]),
    );
  });

  it("falls back to updating only is_read when read_at is missing from the schema cache", async () => {
    const { client, spies } = createReadStateFallbackClient({
      rpcError: {
        code: "PGRST204",
        message: "Could not find the 'read_at' column of 'notifications' in the schema cache",
      },
      firstUpdateError: {
        code: "PGRST204",
        message: "Could not find the 'read_at' column of 'notifications' in the schema cache",
      },
      secondUpdateError: null,
    });

    await expect(markNotificationRead(client, "notification-1")).resolves.toBeUndefined();
    expect(spies.update).toHaveBeenNthCalledWith(1, {
      is_read: true,
      read_at: expect.any(String),
    });
    expect(spies.update).toHaveBeenNthCalledWith(2, {
      is_read: true,
    });
  });

  it("returns safe defaults for unauthenticated reads and blocks unauthenticated writes", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      rpc: vi.fn(),
    } as any;

    await expect(fetchNotifications(client)).resolves.toEqual([]);
    await expect(fetchNotificationPreferences(client)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notification_type: "ontology_relation_added", enabled: true }),
        expect.objectContaining({ notification_type: "definition_other_activity", enabled: true }),
        expect.objectContaining({ notification_type: "comment_reply", enabled: true }),
      ]),
    );
    await expect(fetchUnreadNotificationCount(client)).resolves.toBe(0);
    await expect(updateNotificationPreference(client, "comment_reply", false)).rejects.toThrow("Authentication required.");
  });

  it("groups unread notifications ahead of time-based read groups", () => {
    const result = groupNotifications([
      {
        id: "unread-1",
        type: "comment_reply",
        title: "Unread",
        body: "Unread body",
        link_path: "/definitions/1",
        is_read: false,
        created_at: new Date().toISOString(),
        read_at: null,
        actor_user_id: null,
        actor_display_name: null,
        actor_email: null,
        entity_type: "comment",
        entity_id: "1",
        parent_entity_type: "definition",
        parent_entity_id: "1",
        metadata: {},
      },
      {
        id: "read-1",
        type: "comment_reply",
        title: "Read",
        body: "Read body",
        link_path: "/definitions/1",
        is_read: true,
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
        actor_user_id: null,
        actor_display_name: null,
        actor_email: null,
        entity_type: "comment",
        entity_id: "1",
        parent_entity_type: "definition",
        parent_entity_id: "1",
        metadata: {},
      },
    ]);

    expect(result[0]?.id).toBe("unread");
    expect(result[0]?.items).toHaveLength(1);
    expect(result[1]?.id).toBe("today");
  });
});
