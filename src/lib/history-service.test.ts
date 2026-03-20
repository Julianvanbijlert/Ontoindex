import { describe, expect, it, vi } from "vitest";

import { fetchRecentActivity } from "@/lib/history-service";

describe("history-service", () => {
  it("loads recent activity through the backend personal activity rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { rpc } as any;

    await fetchRecentActivity(client, 30);

    expect(rpc).toHaveBeenCalledWith("fetch_my_recent_activity", {
      _limit: 30,
    });
  });
});
