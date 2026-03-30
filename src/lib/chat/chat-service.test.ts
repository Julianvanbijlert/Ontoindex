import { describe, expect, it, vi } from "vitest";

import { fetchChatMessages, fetchChatSessions, probeChatStorage } from "@/lib/chat/chat-service";

function createClientMock() {
  return {
    from: vi.fn(),
  } as any;
}

describe("chat-service", () => {
  it("returns an empty session list without error", async () => {
    const client = createClientMock();
    client.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      })),
    });

    await expect(fetchChatSessions(client, "user-1")).resolves.toEqual([]);
  });

  it("surfaces a clear message when chat storage tables are missing", async () => {
    const client = createClientMock();
    client.from.mockImplementation((table: string) => {
      if (table === "chat_sessions") {
        return {
          select: vi.fn((_fields?: string, options?: { head?: boolean }) => options?.head
            ? ({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: "42P01",
                  message: 'relation "public.chat_sessions" does not exist',
                },
              }),
            })
            : ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: "42P01",
                    message: 'relation "public.chat_sessions" does not exist',
                  },
                }),
              })),
            })),
        };
      }

      return {
        select: vi.fn((_fields?: string, _options?: { head?: boolean }) => ({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      };
    });

    await expect(fetchChatSessions(client, "user-1")).rejects.toThrow(
      "Chat storage is not configured in this environment yet. Apply the latest chat migrations. Missing: chat_sessions.",
    );
  });

  it("surfaces a clear message when chat messages storage is missing", async () => {
    const client = createClientMock();
    client.from.mockImplementation((table: string) => {
      if (table === "chat_messages") {
        return {
          select: vi.fn((_fields?: string, options?: { head?: boolean }) => options?.head
            ? ({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: "42P01",
                  message: 'relation "public.chat_messages" does not exist',
                },
              }),
            })
            : ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: "42P01",
                    message: 'relation "public.chat_messages" does not exist',
                  },
                }),
              })),
            })),
        };
      }

      return {
        select: vi.fn((_fields?: string, _options?: { head?: boolean }) => ({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      };
    });

    await expect(fetchChatMessages(client, "session-1")).rejects.toThrow(
      "Chat storage is not configured in this environment yet. Apply the latest chat migrations. Missing: chat_messages.",
    );
  });

  it("probes the full chat storage surface and reports partial readiness", async () => {
    const client = createClientMock();
    client.from.mockImplementation((table: string) => ({
      select: vi.fn((_fields?: string, _options?: { head?: boolean }) => ({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: table === "chat_logs"
            ? {
              code: "42P01",
              message: 'relation "public.chat_logs" does not exist',
            }
            : null,
        }),
      })),
    }));

    await expect(probeChatStorage(client)).resolves.toEqual({
      ready: false,
      missingTables: ["chat_logs"],
    });
  });
});
