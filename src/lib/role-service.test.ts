import { describe, expect, it, vi } from "vitest";

import { fetchPrimaryRoleForUser, fetchPrimaryRolesForUsers, getPrimaryRole, updateMyRole, updateUserRoleAsAdmin } from "@/lib/role-service";

function createRoleLookupChain(rows: Array<{ user_id: string; role: string }>) {
  const inFilter = vi.fn().mockResolvedValue({
    data: rows,
    error: null,
  });
  const select = vi.fn().mockReturnValue({ in: inFilter });

  return {
    select,
    in: inFilter,
  };
}

function createRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);

  return {
    rpc,
  };
}

describe("role-service", () => {
  it("chooses the highest-precedence role for profile editing", () => {
    expect(getPrimaryRole(["viewer"])).toBe("viewer");
    expect(getPrimaryRole(["viewer", "reviewer"])).toBe("editor");
    expect(getPrimaryRole(["viewer", "admin"])).toBe("admin");
  });

  it("loads the canonical role per user from user_roles", async () => {
    const roleLookup = createRoleLookupChain([
      { user_id: "user-1", role: "viewer" },
      { user_id: "user-1", role: "reviewer" },
      { user_id: "user-2", role: "admin" },
    ]);
    const client = {
      from: vi.fn(() => ({ select: roleLookup.select })),
    } as any;

    const result = await fetchPrimaryRolesForUsers(client, ["user-1", "user-2", "user-3"]);

    expect(client.from).toHaveBeenCalledWith("user_roles");
    expect(roleLookup.in).toHaveBeenCalledWith("user_id", ["user-1", "user-2", "user-3"]);
    expect(result).toEqual({
      "user-1": "editor",
      "user-2": "admin",
      "user-3": "viewer",
    });
  });

  it("loads the current user's primary role from user_roles", async () => {
    const roleLookup = createRoleLookupChain([{ user_id: "user-1", role: "editor" }]);
    const client = {
      from: vi.fn(() => ({ select: roleLookup.select })),
    } as any;

    await expect(fetchPrimaryRoleForUser(client, "user-1")).resolves.toBe("editor");
  });

  it.each([
    { from: "viewer", to: "editor" },
    { from: "viewer", to: "admin" },
    { from: "editor", to: "viewer" },
    { from: "editor", to: "admin" },
    { from: "admin", to: "viewer" },
    { from: "admin", to: "editor" },
  ])("always allows authenticated users to self-change role from $from to $to", async ({ from, to }) => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        user_id: "user-1",
        role: to,
        message: "Role updated",
      },
      error: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    const result = await updateMyRole(client, to as any);

    expect(rpcClient.rpc).toHaveBeenCalledWith("update_my_role", {
      _target_role: to,
    });
    expect(result.role).toBe(to);
  });

  it("uses the secure self-role RPC during self-role changes", async () => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        user_id: "current-user",
        role: "admin",
        message: "Role updated",
      },
      error: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await updateMyRole(client, "admin");

    expect(rpcClient.rpc).toHaveBeenCalledWith("update_my_role", {
      _target_role: "admin",
    });
  });

  it("rejects invalid role values before touching the backend", async () => {
    const from = vi.fn();
    const rpc = vi.fn();
    const client = {
      rpc,
      from,
    } as any;

    await expect(updateMyRole(client, "superadmin" as any)).rejects.toThrow("Unsupported role selection");
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces RPC authorization failures with a useful message", async () => {
    const rpcClient = createRpcClient({
      error: {
        code: "P0001",
        message: "Admin access required",
      },
      data: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await expect(updateMyRole(client, "admin")).rejects.toThrow(
      "Only admins can change another user's role.",
    );
  });

  it("surfaces a clear error when the self-role RPC is unavailable", async () => {
    const rpcClient = createRpcClient({
      error: {
        code: "PGRST202",
        message: "Could not find the function public.update_my_role(_target_role) in the schema cache",
      },
      data: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    const result = updateMyRole(client, "editor");

    await expect(result).rejects.toThrow(
      "The role update service is not configured in the database.",
    );
    await expect(result).rejects.not.toThrow(
      "The secure role update function is not available in this database. Apply the latest secure role-management migration.",
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("allows admins to change another user's role through the admin RPC", async () => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        user_id: "user-2",
        role: "admin",
        message: "User role updated",
      },
      error: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    const result = await updateUserRoleAsAdmin(client, "user-2", "admin");

    expect(rpcClient.rpc).toHaveBeenCalledWith("admin_update_user_access", {
      _target_user_id: "user-2",
      _target_role: "admin",
      _team: null,
    });
    expect(result.role).toBe("admin");
  });

  it.each(["viewer", "editor"])("blocks %s users from changing another user's role", async () => {
    const rpcClient = createRpcClient({
      error: {
        code: "P0001",
        message: "Admin access required",
      },
      data: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await expect(updateUserRoleAsAdmin(client, "user-2", "viewer")).rejects.toThrow(
      "Only admins can change another user's role.",
    );
  });

  it("surfaces a clear error when the admin role RPC is unavailable", async () => {
    const rpcClient = createRpcClient({
      error: {
        code: "PGRST202",
        message: "Could not find the function public.admin_update_user_access(_target_user_id, _target_role, _team) in the schema cache",
      },
      data: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    const result = updateUserRoleAsAdmin(client, "user-2", "viewer");

    await expect(result).rejects.toThrow(
      "The role update service is not configured in the database.",
    );
    await expect(result).rejects.not.toThrow(
      "The secure role update function is not available in this database. Apply the latest secure role-management migration.",
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not perform direct user_roles reads or edge-function calls during self role updates", async () => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        user_id: "user-1",
        role: "viewer",
        message: "Role updated",
      },
      error: null,
    });
    const functions = { invoke: vi.fn() };
    const client = {
      functions,
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await updateMyRole(client, "viewer");

    expect(rpcClient.rpc).toHaveBeenCalled();
    expect(functions.invoke).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not perform direct user_roles writes or edge-function calls during admin role updates", async () => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        user_id: "user-2",
        role: "editor",
        message: "User role updated",
      },
      error: null,
    });
    const functions = { invoke: vi.fn() };
    const client = {
      functions,
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await updateUserRoleAsAdmin(client, "user-2", "editor");

    expect(rpcClient.rpc).toHaveBeenCalled();
    expect(functions.invoke).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("surfaces malformed server responses clearly", async () => {
    const rpcClient = createRpcClient({
      data: {
        success: true,
        role: "editor",
      },
      error: null,
    });
    const client = {
      rpc: rpcClient.rpc,
      from: vi.fn(),
    } as any;

    await expect(updateMyRole(client, "editor")).rejects.toThrow(
      "The role update service returned an unexpected response.",
    );
  });
});
