import { describe, expect, it, vi } from "vitest";

import { getPrimaryRole, updateMyRole } from "@/lib/role-service";

describe("role-service", () => {
  it("chooses the highest-precedence role for profile editing", () => {
    expect(getPrimaryRole(["viewer"])).toBe("viewer");
    expect(getPrimaryRole(["viewer", "editor"])).toBe("editor");
    expect(getPrimaryRole(["viewer", "admin"])).toBe("admin");
  });

  it("updates the current role through the backend rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null });
    const client = { rpc } as any;

    await updateMyRole(client, "editor");

    expect(rpc).toHaveBeenCalledWith("update_my_role", { _target_role: "editor" });
  });
});

